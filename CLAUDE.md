# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build**: `npm run build` - Compiles TypeScript to JavaScript in `/build`
**Watch**: `npm run watch` - Compiles TypeScript in watch mode
**Development**: `npm run dev` - Runs the server directly from TypeScript source using tsx

## Project Architecture

This is a minimal Model Context Protocol (MCP) server that integrates TMetric time tracking with Claude Code and other MCP clients. The architecture follows a clean separation of concerns:

### File Structure

- `src/types.ts` - TypeScript interfaces for TMetric API entities and responses
- `src/utils.ts` - Duration calculation and GitLab URL parsing utilities
- `src/tmetric-client.ts` - TMetric API client with core timer operations
- `src/index.ts` - MCP server entry point that exposes tools via stdio transport

### Core Architecture Patterns

**TMetricClient class** (`src/tmetric-client.ts`):
- Lazy initialization: Fetches and caches `accountId` on first API call via `ensureInitialized()`
- All API methods return `ApiResponse` objects with structured success/error states
- Timer state is always fetched from API (no local caching) to ensure accuracy
- GitLab integration: Automatically extracts issue numbers from URLs and formats them for TMetric

**MCP Server** (`src/index.ts`):
- Single `TMetricClient` instance shared across all tool calls
- Tools are registered with JSON schemas defining their parameters
- All tool responses return JSON-serialized results in MCP text content format
- Server runs on stdio transport for communication with MCP clients

### API Integration

- Base URL: `https://app.tmetric.com/api/v3`
- Authentication: Bearer token via `TMETRIC_API_TOKEN` environment variable
- Account-scoped endpoints: All endpoints include `/accounts/{accountId}` after initialization
- Time entries: Active timer identified by `endTime === null` in today's entries

### Critical Implementation Details

**Single Timer Enforcement**: `startTimer()` always checks for running timer before creating new one. Returns error if timer already active.

**GitLab Integration**: When `task_url` is provided to `startTimer()`:
1. Extracts issue number from URL pattern `/issues/(\d+)/`
2. Formats as "Gitlab Issue: #123" for TMetric display
3. Adds `externalLink` and `integration` fields to task object

**Time Calculation**:
- `calculateElapsed()` formats running time as "Xh Ym" or "Ym"
- `formatMinutesToGitLab()` formats duration as "Xh", "Ym", or "XhYm" for GitLab time tracking

## MCP Tools Exposed

The server exposes 5 minimal tools:
- `list_tmetric_projects` - Get available projects for time tracking
- `get_current_timer` - Check if timer running and get details
- `start_timer` - Start timer (fails if one already running, supports GitLab URL)
- `stop_timer` - Stop active timer and return time spent in GitLab format
- `delete_time_entry` - Delete entry by ID or current timer if no ID provided

## Environment Variables

- `TMETRIC_API_TOKEN`: Required for TMetric API authentication (server exits if not set)

## Package Structure

- Uses ESM modules (`"type": "module"`)
- Binary entry point: `build/index.js` (published as `tmetric-mcp-server` command)
- Distribution files: Only `/build` folder is published to npm
- Dependencies: axios (HTTP), date-fns (time calculations)