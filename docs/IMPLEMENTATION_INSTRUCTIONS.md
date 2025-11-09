# TMetric MCP Server - Implementation Instructions

## Overview

Build a minimal TMetric MCP server in TypeScript that provides 5-6 core time tracking operations. This server will be used with Claude Code to automate GitLab issue workflow with time tracking.

## Project Setup

### 1. Initialize Project

```bash
mkdir tmetric-mcp-server
cd tmetric-mcp-server
npm init -y
```

### 2. Install Dependencies

```bash
# MCP SDK
npm install @modelcontextprotocol/sdk

# HTTP client
npm install axios

# Date handling
npm install date-fns

# TypeScript and build tools
npm install --save-dev typescript @types/node tsx

# Type definitions
npm install --save-dev @types/axios
```

### 3. Configure TypeScript

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "build"]
}
```

### 4. Update package.json

Add to `package.json`:

```json
{
  "type": "module",
  "bin": {
    "tmetric-mcp-server": "./build/index.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "dev": "tsx src/index.ts",
    "prepare": "npm run build"
  }
}
```

## Project Structure

```
tmetric-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tmetric-client.ts     # TMetric API client
│   ├── types.ts              # TypeScript interfaces
│   └── utils.ts              # Duration formatting utilities
├── tsconfig.json
├── package.json
└── README.md
```

## Implementation

### File 1: `src/types.ts`

Define TypeScript interfaces for TMetric API:

```typescript
export interface TMetricProject {
  id: number;
  name: string;
}

export interface TMetricTimeEntry {
  id: string;
  startTime: string;
  endTime: string | null;
  project?: {
    id: number;
    name: string;
  };
  task?: {
    name: string;
    externalLink?: {
      link: string;
      issueId: string;
    };
    integration?: {
      url: string;
      type: string;
    };
  };
  tags?: string[];
}

export interface TMetricUser {
  activeAccountId: string;
  email: string;
  name: string;
}

export interface TimerInfo {
  is_running: boolean;
  timer_id?: string;
  task_name?: string;
  task_url?: string;
  project_name?: string;
  project_id?: number;
  started_at?: string;
  elapsed?: string;
}

export interface ApiResponse {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}
```

### File 2: `src/utils.ts`

Duration calculation and formatting utilities:

```typescript
import { formatDuration, intervalToDuration, parseISO } from 'date-fns';

/**
 * Calculate elapsed time from start time to now
 */
export function calculateElapsed(startTime: string): string {
  const start = parseISO(startTime);
  const now = new Date();
  
  const duration = intervalToDuration({ start, end: now });
  
  const hours = duration.hours || 0;
  const minutes = duration.minutes || 0;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Calculate duration between start and end times
 * Returns minutes
 */
export function calculateDurationMinutes(startTime: string, endTime: string): number {
  const start = parseISO(startTime);
  const end = parseISO(endTime);
  
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 60000); // Convert to minutes
}

/**
 * Format minutes to GitLab time format (e.g., "2h30m", "45m", "1h")
 */
export function formatMinutesToGitLab(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours}h${mins}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  }
  return `${mins}m`;
}

/**
 * Extract GitLab base URL from issue URL
 * e.g., "https://gitlab.openpolis.io/group/project/-/issues/123" 
 *    -> "https://gitlab.openpolis.io"
 */
export function extractGitLabBaseUrl(issueUrl: string): string {
  try {
    const url = new URL(issueUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'https://gitlab.com'; // Default fallback
  }
}

/**
 * Extract issue number from GitLab URL
 * e.g., "https://gitlab.../issues/123" -> "123"
 */
export function extractIssueNumber(issueUrl: string): string | null {
  const match = issueUrl.match(/issues\/(\d+)/);
  return match ? match[1] : null;
}

/**
 * Format issue number for TMetric display
 */
export function formatIssueId(issueNumber: string): string {
  return `Gitlab Issue: #${issueNumber}`;
}
```

### File 3: `src/tmetric-client.ts`

TMetric API client implementation:

```typescript
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
```

### File 4: `src/index.ts`

MCP server implementation:

```typescript
#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { TMetricClient } from './tmetric-client.js';

// Get API token from environment
const TMETRIC_API_TOKEN = process.env.TMETRIC_API_TOKEN;

if (!TMETRIC_API_TOKEN) {
  console.error('Error: TMETRIC_API_TOKEN environment variable is required');
  process.exit(1);
}

// Initialize TMetric client
const tmetricClient = new TMetricClient(TMETRIC_API_TOKEN);

// Initialize MCP server
const server = new Server(
  {
    name: 'tmetric-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_tmetric_projects',
        description: 'Get list of available TMetric projects for time tracking',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_current_timer',
        description: 'Check if a timer is currently running and get its details',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'start_timer',
        description: 'Start time tracking on a project and task. Will fail if another timer is already running.',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'number',
              description: 'TMetric project ID',
            },
            task_name: {
              type: 'string',
              description: 'Name of the task (e.g., "Issue #123: Fix bug")',
            },
            task_url: {
              type: 'string',
              description: 'Optional GitLab issue URL for integration',
            },
          },
          required: ['project_id', 'task_name'],
        },
      },
      {
        name: 'stop_timer',
        description: 'Stop the currently running timer and return time spent',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'delete_time_entry',
        description: 'Delete a time entry. If no entry_id provided, deletes the current timer.',
        inputSchema: {
          type: 'object',
          properties: {
            entry_id: {
              type: 'string',
              description: 'Optional: specific entry ID to delete. If not provided, deletes current timer.',
            },
          },
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_tmetric_projects': {
        const result = await tmetricClient.listProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_current_timer': {
        const result = await tmetricClient.getCurrentTimer();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'start_timer': {
        const { project_id, task_name, task_url } = args as {
          project_id: number;
          task_name: string;
          task_url?: string;
        };
        
        const result = await tmetricClient.startTimer(
          project_id,
          task_name,
          task_url
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'stop_timer': {
        const result = await tmetricClient.stopTimer();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'delete_time_entry': {
        const { entry_id } = args as { entry_id?: string };
        const result = await tmetricClient.deleteTimeEntry(entry_id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: false,
              error: 'INTERNAL_ERROR',
              message: error.message,
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('TMetric MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### File 5: `README.md`

```markdown
# TMetric MCP Server

Minimal Model Context Protocol server for TMetric time tracking integration.

## Features

- List TMetric projects
- Start/stop timers
- Check current timer status
- GitLab issue integration
- Delete time entries

## Installation

```bash
npm install
npm run build
```

## Configuration

Set your TMetric API token:

```bash
export TMETRIC_API_TOKEN="your_token_here"
```

## Usage with Claude Code

Add to your MCP settings file (usually `~/.config/claude-code/mcp.json`):

```json
{
  "mcpServers": {
    "tmetric": {
      "command": "node",
      "args": ["/path/to/tmetric-mcp-server/build/index.js"],
      "env": {
        "TMETRIC_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

Or use npx:

```json
{
  "mcpServers": {
    "tmetric": {
      "command": "npx",
      "args": ["-y", "/path/to/tmetric-mcp-server"],
      "env": {
        "TMETRIC_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

## Available Tools

### list_tmetric_projects()
Get list of available projects.

### get_current_timer()
Check if a timer is running.

### start_timer(project_id, task_name, task_url?)
Start tracking time on a project/task.

### stop_timer()
Stop current timer and return time spent.

### delete_time_entry(entry_id?)
Delete a time entry.

## Development

```bash
# Watch mode
npm run watch

# Run directly with tsx
npm run dev
```

## Testing

Test with Claude Code by starting a conversation and using commands like:
- "List my TMetric projects"
- "Start timer on project 12345 for Issue #123: Fix bug"
- "What am I working on?"
- "Stop the timer"
```

## Build Instructions

1. Create all the files above in the correct structure
2. Run `npm install` to install dependencies
3. Run `npm run build` to compile TypeScript
4. Test the server by running it manually:
   ```bash
   TMETRIC_API_TOKEN="your_token" node build/index.js
   ```
5. Configure in Claude Code's MCP settings
6. Test with Claude Code

## Testing the Server

### Manual Testing (Without Claude Code)

You can test the server using stdio directly:

```bash
# Start the server
TMETRIC_API_TOKEN="your_token" node build/index.js

# In another terminal, send MCP messages
# (You'll need to format them as JSON-RPC)
```

### Testing with Claude Code

Once configured, test with natural language:
- "What TMetric projects do I have?"
- "Start timer on project 61545 for 'Issue #123: Test task'"
- "What timer is running?"
- "Stop the timer"

## Troubleshooting

### "TMETRIC_API_TOKEN is required"
Make sure you've set the environment variable with your API token.

### "Failed to initialize TMetric client"
Check that your API token is valid and you have network access to TMetric.

### "Timer already running"
This is expected behavior. Stop the current timer before starting a new one.

## Next Steps

After building the server:
1. Test each tool individually
2. Use with the GitLab workflow Skill
3. Integrate into your daily development workflow
4. Report any issues or needed features
```

## Summary

This implementation provides:

✅ **5 core tools**: list projects, get timer, start timer, stop timer, delete entry  
✅ **Single timer enforcement**: Checks API before starting new timers  
✅ **GitLab integration**: Automatic issue linking in TMetric  
✅ **Proper error handling**: Clear error messages for all failure cases  
✅ **No state caching**: Always queries API for current timer  
✅ **TypeScript**: Full type safety  

## To Build:

1. Create the directory structure
2. Copy each code block into the appropriate file
3. Run `npm install`
4. Run `npm run build`
5. Configure in Claude Code
6. Test!

Let me know if you need any clarifications or want me to adjust any part of the implementation!
