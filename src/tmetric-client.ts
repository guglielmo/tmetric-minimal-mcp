import axios, { AxiosInstance } from 'axios';
import type {
  TMetricProject,
  TMetricTimeEntry,
  TMetricUser,
  TimerInfo,
  ApiResponse
} from './types.js';
import {
  calculateElapsed,
  calculateDurationMinutes,
  formatMinutesToGitLab,
  extractGitLabBaseUrl,
  extractIssueNumber,
  formatIssueId
} from './utils.js';

export class TMetricClient {
  private client: AxiosInstance;
  private accountId: string | null = null;

  constructor(apiToken: string) {
    this.client = axios.create({
      baseURL: 'https://app.tmetric.com/api/v3',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Initialize client by fetching user info and caching account ID
   */
  async initialize(): Promise<void> {
    try {
      const response = await this.client.get<TMetricUser>('/user');
      this.accountId = response.data.activeAccountId;
    } catch (error: any) {
      throw new Error(`Failed to initialize TMetric client: ${error.message}`);
    }
  }

  /**
   * Ensure client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.accountId) {
      await this.initialize();
    }
  }

  /**
   * Get list of projects
   */
  async listProjects(): Promise<ApiResponse> {
    try {
      await this.ensureInitialized();

      const response = await this.client.get<TMetricProject[]>(
        `/accounts/${this.accountId}/timeentries/projects`
      );

      return {
        success: true,
        projects: response.data.map(p => ({
          id: p.id,
          name: p.name
        }))
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'API_ERROR',
        message: `Failed to list projects: ${error.message}`
      };
    }
  }

  /**
   * Get current running timer by querying today's time entries
   */
  async getCurrentTimer(): Promise<TimerInfo> {
    try {
      await this.ensureInitialized();

      const today = new Date().toISOString().split('T')[0];

      const response = await this.client.get<TMetricTimeEntry[]>(
        `/accounts/${this.accountId}/timeentries`,
        {
          params: {
            startDate: today,
            endDate: today
          }
        }
      );

      // Find entry with no endTime (active timer)
      const activeEntry = response.data.find(entry => entry.endTime === null);

      if (!activeEntry) {
        return { is_running: false };
      }

      return {
        is_running: true,
        timer_id: activeEntry.id,
        task_name: activeEntry.task?.name || 'Unknown task',
        task_url: activeEntry.task?.externalLink?.link,
        project_name: activeEntry.project?.name || 'No project',
        project_id: activeEntry.project?.id,
        started_at: activeEntry.startTime,
        elapsed: calculateElapsed(activeEntry.startTime)
      };
    } catch (error: any) {
      throw new Error(`Failed to get current timer: ${error.message}`);
    }
  }

  /**
   * Start a new timer
   */
  async startTimer(
    projectId: number,
    taskName: string,
    taskUrl?: string
  ): Promise<ApiResponse> {
    try {
      await this.ensureInitialized();

      // CRITICAL: Check if timer already running
      const current = await this.getCurrentTimer();
      if (current.is_running) {
        return {
          success: false,
          error: 'TIMER_ALREADY_RUNNING',
          message: 'Cannot start new timer. A timer is already running.',
          current_timer: current
        };
      }

      // Build task object
      const task: any = { name: taskName };

      // Add GitLab integration if task URL provided
      if (taskUrl) {
        const issueNumber = extractIssueNumber(taskUrl);
        const gitlabBaseUrl = extractGitLabBaseUrl(taskUrl);

        if (issueNumber) {
          task.externalLink = {
            link: taskUrl,
            issueId: formatIssueId(issueNumber)
          };
          task.integration = {
            url: gitlabBaseUrl,
            type: 'GitLab'
          };
        }
      }

      // Create time entry with startTime: null (means "now")
      const entryData = {
        startTime: null,
        endTime: null,
        project: { id: projectId },
        task,
        tags: []
      };

      const response = await this.client.post<TMetricTimeEntry>(
        `/accounts/${this.accountId}/timeentries`,
        entryData
      );

      return {
        success: true,
        timer_id: response.data.id,
        started_at: response.data.startTime,
        task_name: taskName
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'API_ERROR',
        message: `Failed to start timer: ${error.message}`
      };
    }
  }

  /**
   * Stop the current timer
   */
  async stopTimer(): Promise<ApiResponse> {
    try {
      await this.ensureInitialized();

      // Get current timer
      const current = await this.getCurrentTimer();
      if (!current.is_running) {
        return {
          success: false,
          error: 'NO_TIMER_RUNNING',
          message: 'No active timer to stop'
        };
      }

      const timerId = current.timer_id!;

      // Get full entry details
      const entryResponse = await this.client.get<TMetricTimeEntry>(
        `/accounts/${this.accountId}/timeentries/${timerId}`
      );

      const fullEntry = entryResponse.data;

      // Set endTime to now
      fullEntry.endTime = new Date().toISOString();

      // Update entry
      await this.client.put(
        `/accounts/${this.accountId}/timeentries/${timerId}`,
        fullEntry
      );

      // Calculate duration
      const durationMinutes = calculateDurationMinutes(
        current.started_at!,
        fullEntry.endTime
      );

      return {
        success: true,
        time_spent: formatMinutesToGitLab(durationMinutes),
        time_spent_minutes: durationMinutes,
        started_at: current.started_at,
        ended_at: fullEntry.endTime,
        task_name: current.task_name
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'API_ERROR',
        message: `Failed to stop timer: ${error.message}`
      };
    }
  }

  /**
   * Delete a time entry
   */
  async deleteTimeEntry(entryId?: string): Promise<ApiResponse> {
    try {
      await this.ensureInitialized();

      let targetId = entryId;

      // If no entry ID provided, use current timer
      if (!targetId) {
        const current = await this.getCurrentTimer();
        if (!current.is_running) {
          return {
            success: false,
            error: 'NO_TIMER_RUNNING',
            message: 'No active timer to delete'
          };
        }
        targetId = current.timer_id;
      }

      await this.client.delete(
        `/accounts/${this.accountId}/timeentries/${targetId}`
      );

      return {
        success: true,
        deleted: targetId
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'API_ERROR',
        message: `Failed to delete entry: ${error.message}`
      };
    }
  }
}
