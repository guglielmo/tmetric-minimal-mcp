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
    name: 'tmetric-minimal-mcp',
    version: '2.0.0',
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
        description: 'Delete a time entry. Mode "current" deletes active timer only, "last" deletes most recent entry (with 5-min safety window).',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['current', 'last'],
              description: 'Deletion mode: "current" for active timer only, "last" for most recent entry',
              default: 'current',
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
        const { mode } = args as { mode?: 'current' | 'last' };
        const result = await tmetricClient.deleteTimeEntry(mode);
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
  console.error('TMetric Minimal MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
