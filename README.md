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

### Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui
```

### Test Coverage

The project has comprehensive test coverage with:
- **100% statement coverage** across all modules
- **97%+ branch coverage** for edge cases
- Unit tests for all utility functions (`utils.ts`)
- Full integration tests for TMetric API client (`tmetric-client.ts`)
- Mocked HTTP requests using `nock` for reliable testing

See [TESTING.md](TESTING.md) for detailed information about the testing strategy and how to write new tests.

### Manual Testing

Test the MCP server with Claude Code by starting a conversation and using commands like:
- "List my TMetric projects"
- "Start timer on project 12345 for Issue #123: Fix bug"
- "What am I working on?"
- "Stop the timer"

## Troubleshooting

### "TMETRIC_API_TOKEN is required"
Make sure you've set the environment variable with your API token.

### "Failed to initialize TMetric client"
Check that your API token is valid and you have network access to TMetric.

### "Timer already running"
This is expected behavior. Stop the current timer before starting a new one.

## License

MIT