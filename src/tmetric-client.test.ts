import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import nock from 'nock';
import { TMetricClient } from './tmetric-client.js';
import type { TMetricUser, TMetricProject, TMetricTimeEntry } from './types.js';

const TMETRIC_BASE_URL = 'https://app.tmetric.com';
const API_TOKEN = 'test-api-token';
const ACCOUNT_ID = 'test-account-123';

describe('TMetricClient', () => {
  let client: TMetricClient;

  beforeEach(() => {
    client = new TMetricClient(API_TOKEN);
    nock.cleanAll();

    // Mock current time for consistent elapsed time calculations
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    nock.cleanAll();
    vi.useRealTimers();
  });

  describe('initialize', () => {
    it('should fetch and cache account ID', async () => {
      const mockUser: TMetricUser = {
        activeAccountId: ACCOUNT_ID,
        email: 'test@example.com',
        name: 'Test User',
      };

      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, mockUser);

      await client.initialize();

      // Verify the account ID was cached by making another call
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
        .reply(200, []);

      const result = await client.listProjects();
      expect(result.success).toBe(true);
    });

    it('should throw error when API call fails', async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(401, { error: 'Unauthorized' });

      await expect(client.initialize()).rejects.toThrow(
        'Failed to initialize TMetric client'
      );
    });

    it('should throw error when network fails', async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .replyWithError('Network error');

      await expect(client.initialize()).rejects.toThrow(
        'Failed to initialize TMetric client'
      );
    });
  });

  describe('listProjects', () => {
    beforeEach(async () => {
      // Initialize client before each test
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      await client.initialize();
    });

    it('should return list of projects', async () => {
      const mockProjects: TMetricProject[] = [
        { id: 1, name: 'Project One' },
        { id: 2, name: 'Project Two' },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
        .reply(200, mockProjects);

      const result = await client.listProjects();

      expect(result.success).toBe(true);
      expect(result.projects).toEqual([
        { id: 1, name: 'Project One' },
        { id: 2, name: 'Project Two' },
      ]);
    });

    it('should return empty array when no projects', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
        .reply(200, []);

      const result = await client.listProjects();

      expect(result.success).toBe(true);
      expect(result.projects).toEqual([]);
    });

    it('should handle API errors gracefully', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
        .reply(500, { error: 'Internal Server Error' });

      const result = await client.listProjects();

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
      expect(result.message).toContain('Failed to list projects');
    });

    it('should auto-initialize if not already initialized', async () => {
      const newClient = new TMetricClient(API_TOKEN);

      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
        .reply(200, [{ id: 1, name: 'Test' }]);

      const result = await newClient.listProjects();

      expect(result.success).toBe(true);
    });
  });

  describe('getCurrentTimer', () => {
    beforeEach(async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      await client.initialize();
    });

    it('should return timer info when timer is running', async () => {
      const mockEntries: TMetricTimeEntry[] = [
        {
          id: 'entry-1',
          startTime: '2024-01-15T10:00:00Z',
          endTime: null, // Active timer
          project: { id: 123, name: 'Test Project' },
          task: {
            name: 'Test Task',
            externalLink: {
              link: 'https://gitlab.com/test/repo/-/issues/42',
              issueId: 'Gitlab Issue: #42',
            },
          },
        },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, mockEntries);

      const result = await client.getCurrentTimer();

      expect(result.is_running).toBe(true);
      expect(result.timer_id).toBe('entry-1');
      expect(result.task_name).toBe('Test Task');
      expect(result.task_url).toBe('https://gitlab.com/test/repo/-/issues/42');
      expect(result.project_name).toBe('Test Project');
      expect(result.project_id).toBe(123);
      expect(result.started_at).toBe('2024-01-15T10:00:00Z');
      expect(result.elapsed).toBe('2h 0m'); // 2 hours from 10:00 to 12:00
    });

    it('should return not running when no active timer', async () => {
      const mockEntries: TMetricTimeEntry[] = [
        {
          id: 'entry-1',
          startTime: '2024-01-15T10:00:00Z',
          endTime: '2024-01-15T11:00:00Z', // Completed
          project: { id: 123, name: 'Test Project' },
        },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, mockEntries);

      const result = await client.getCurrentTimer();

      expect(result.is_running).toBe(false);
      expect(result.timer_id).toBeUndefined();
    });

    it('should return not running when no entries today', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const result = await client.getCurrentTimer();

      expect(result.is_running).toBe(false);
    });

    it('should handle task without external link', async () => {
      const mockEntries: TMetricTimeEntry[] = [
        {
          id: 'entry-1',
          startTime: '2024-01-15T10:00:00Z',
          endTime: null,
          project: { id: 123, name: 'Test Project' },
          task: { name: 'Simple Task' },
        },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, mockEntries);

      const result = await client.getCurrentTimer();

      expect(result.is_running).toBe(true);
      expect(result.task_url).toBeUndefined();
    });

    it('should handle entry without task', async () => {
      const mockEntries: TMetricTimeEntry[] = [
        {
          id: 'entry-1',
          startTime: '2024-01-15T10:00:00Z',
          endTime: null,
          project: { id: 123, name: 'Test Project' },
        },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, mockEntries);

      const result = await client.getCurrentTimer();

      expect(result.is_running).toBe(true);
      expect(result.task_name).toBe('Unknown task');
    });

    it('should throw error on API failure', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(500, { error: 'Server error' });

      await expect(client.getCurrentTimer()).rejects.toThrow(
        'Failed to get current timer'
      );
    });
  });

  describe('startTimer', () => {
    beforeEach(async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      await client.initialize();
    });

    it('should start a new timer without GitLab URL', async () => {
      // Mock getCurrentTimer to return no running timer
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const mockResponse: TMetricTimeEntry = {
        id: 'new-entry',
        startTime: '2024-01-15T12:00:00Z',
        endTime: null,
        project: { id: 123, name: 'Test Project' },
        task: { name: 'New Task' },
      };

      nock(TMETRIC_BASE_URL)
        .post(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`, (body) => {
          expect(body.project.id).toBe(123);
          expect(body.task.name).toBe('New Task');
          expect(body.startTime).toBeNull();
          expect(body.endTime).toBeNull();
          return true;
        })
        .reply(200, mockResponse);

      const result = await client.startTimer(123, 'New Task');

      expect(result.success).toBe(true);
      expect(result.timer_id).toBe('new-entry');
      expect(result.task_name).toBe('New Task');
      expect(result.started_at).toBe('2024-01-15T12:00:00Z');
    });

    it('should start a new timer with GitLab URL', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const mockResponse: TMetricTimeEntry = {
        id: 'new-entry',
        startTime: '2024-01-15T12:00:00Z',
        endTime: null,
        project: { id: 123, name: 'Test Project' },
        task: {
          name: 'Issue #42: Fix bug',
          externalLink: {
            link: 'https://gitlab.openpolis.io/test/repo/-/issues/42',
            issueId: 'Gitlab Issue: #42',
          },
          integration: {
            url: 'https://gitlab.openpolis.io',
            type: 'GitLab',
          },
        },
      };

      nock(TMETRIC_BASE_URL)
        .post(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`, (body) => {
          expect(body.task.externalLink.link).toBe(
            'https://gitlab.openpolis.io/test/repo/-/issues/42'
          );
          expect(body.task.externalLink.issueId).toBe('Gitlab Issue: #42');
          expect(body.task.integration.url).toBe('https://gitlab.openpolis.io');
          expect(body.task.integration.type).toBe('GitLab');
          return true;
        })
        .reply(200, mockResponse);

      const result = await client.startTimer(
        123,
        'Issue #42: Fix bug',
        'https://gitlab.openpolis.io/test/repo/-/issues/42'
      );

      expect(result.success).toBe(true);
      expect(result.timer_id).toBe('new-entry');
    });

    it('should fail when timer already running', async () => {
      const runningEntry: TMetricTimeEntry[] = [
        {
          id: 'existing-entry',
          startTime: '2024-01-15T10:00:00Z',
          endTime: null,
          project: { id: 456, name: 'Other Project' },
          task: { name: 'Existing Task' },
        },
      ];

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, runningEntry);

      const result = await client.startTimer(123, 'New Task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('TIMER_ALREADY_RUNNING');
      expect(result.message).toContain('Cannot start new timer');
      expect(result.current_timer).toBeDefined();
      expect(result.current_timer?.task_name).toBe('Existing Task');
    });

    it('should handle GitLab URL without issue number', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const mockResponse: TMetricTimeEntry = {
        id: 'new-entry',
        startTime: '2024-01-15T12:00:00Z',
        endTime: null,
        project: { id: 123, name: 'Test Project' },
        task: { name: 'Task without issue' },
      };

      nock(TMETRIC_BASE_URL)
        .post(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`, (body) => {
          // Should not have externalLink or integration
          expect(body.task.externalLink).toBeUndefined();
          expect(body.task.integration).toBeUndefined();
          return true;
        })
        .reply(200, mockResponse);

      const result = await client.startTimer(
        123,
        'Task without issue',
        'https://gitlab.com/test/repo' // No /issues/N
      );

      expect(result.success).toBe(true);
    });

    it('should handle API errors', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      nock(TMETRIC_BASE_URL)
        .post(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .reply(400, { error: 'Bad request' });

      const result = await client.startTimer(123, 'Task');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
      expect(result.message).toContain('Failed to start timer');
    });
  });

  describe('stopTimer', () => {
    beforeEach(async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      await client.initialize();
    });

    it('should stop running timer and return time spent', async () => {
      const runningEntry: TMetricTimeEntry = {
        id: 'timer-123',
        startTime: '2024-01-15T10:00:00Z',
        endTime: null,
        project: { id: 456, name: 'Test Project' },
        task: { name: 'Test Task' },
      };

      // Mock getCurrentTimer
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, [runningEntry]);

      // Mock get full entry
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(200, runningEntry);

      // Mock update entry
      nock(TMETRIC_BASE_URL)
        .put(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`, (body) => {
          expect(body.endTime).toBe('2024-01-15T12:00:00.000Z');
          return true;
        })
        .reply(200, { ...runningEntry, endTime: '2024-01-15T12:00:00Z' });

      const result = await client.stopTimer();

      expect(result.success).toBe(true);
      expect(result.time_spent).toBe('2h'); // 10:00 to 12:00
      expect(result.time_spent_minutes).toBe(120);
      expect(result.started_at).toBe('2024-01-15T10:00:00Z');
      expect(result.task_name).toBe('Test Task');
    });

    it('should fail when no timer is running', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const result = await client.stopTimer();

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_TIMER_RUNNING');
      expect(result.message).toBe('No active timer to stop');
    });

    it('should handle partial hours correctly', async () => {
      const runningEntry: TMetricTimeEntry = {
        id: 'timer-123',
        startTime: '2024-01-15T10:30:00Z', // Started at 10:30
        endTime: null,
        project: { id: 456, name: 'Test Project' },
        task: { name: 'Test Task' },
      };

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, [runningEntry]);

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(200, runningEntry);

      nock(TMETRIC_BASE_URL)
        .put(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(200, { ...runningEntry, endTime: '2024-01-15T12:00:00Z' });

      const result = await client.stopTimer();

      expect(result.success).toBe(true);
      expect(result.time_spent).toBe('1h30m'); // 10:30 to 12:00
      expect(result.time_spent_minutes).toBe(90);
    });

    it('should handle API errors when getting entry', async () => {
      const runningEntry: TMetricTimeEntry = {
        id: 'timer-123',
        startTime: '2024-01-15T10:00:00Z',
        endTime: null,
        project: { id: 456, name: 'Test Project' },
        task: { name: 'Test Task' },
      };

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, [runningEntry]);

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(500, { error: 'Server error' });

      const result = await client.stopTimer();

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
    });

    it('should handle API errors when updating entry', async () => {
      const runningEntry: TMetricTimeEntry = {
        id: 'timer-123',
        startTime: '2024-01-15T10:00:00Z',
        endTime: null,
        project: { id: 456, name: 'Test Project' },
        task: { name: 'Test Task' },
      };

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, [runningEntry]);

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(200, runningEntry);

      nock(TMETRIC_BASE_URL)
        .put(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-123`)
        .reply(400, { error: 'Bad request' });

      const result = await client.stopTimer();

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
    });
  });

  describe('deleteTimeEntry', () => {
    beforeEach(async () => {
      nock(TMETRIC_BASE_URL)
        .get('/api/v3/user')
        .reply(200, { activeAccountId: ACCOUNT_ID });

      await client.initialize();
    });

    it('should delete entry by ID', async () => {
      nock(TMETRIC_BASE_URL)
        .delete(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/entry-123`)
        .reply(200);

      const result = await client.deleteTimeEntry('entry-123');

      expect(result.success).toBe(true);
      expect(result.deleted).toBe('entry-123');
    });

    it('should delete current timer when no ID provided', async () => {
      const runningEntry: TMetricTimeEntry = {
        id: 'timer-456',
        startTime: '2024-01-15T10:00:00Z',
        endTime: null,
        project: { id: 123, name: 'Test' },
        task: { name: 'Task' },
      };

      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, [runningEntry]);

      nock(TMETRIC_BASE_URL)
        .delete(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/timer-456`)
        .reply(200);

      const result = await client.deleteTimeEntry();

      expect(result.success).toBe(true);
      expect(result.deleted).toBe('timer-456');
    });

    it('should fail when no timer running and no ID provided', async () => {
      nock(TMETRIC_BASE_URL)
        .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries`)
        .query({ startDate: '2024-01-15', endDate: '2024-01-15' })
        .reply(200, []);

      const result = await client.deleteTimeEntry();

      expect(result.success).toBe(false);
      expect(result.error).toBe('NO_TIMER_RUNNING');
      expect(result.message).toBe('No active timer to delete');
    });

    it('should handle API errors', async () => {
      nock(TMETRIC_BASE_URL)
        .delete(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/entry-123`)
        .reply(404, { error: 'Not found' });

      const result = await client.deleteTimeEntry('entry-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
      expect(result.message).toContain('Failed to delete entry');
    });

    it('should handle network errors', async () => {
      nock(TMETRIC_BASE_URL)
        .delete(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/entry-123`)
        .replyWithError('Network error');

      const result = await client.deleteTimeEntry('entry-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API_ERROR');
    });
  });
});
