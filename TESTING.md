# Testing Guide

This document provides comprehensive information about testing the TMetric MCP Server.

## Table of Contents

- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Running Tests](#running-tests)
- [Test Structure](#test-structure)
- [Writing Tests](#writing-tests)
- [Coverage Requirements](#coverage-requirements)
- [Mocking Strategy](#mocking-strategy)
- [Best Practices](#best-practices)

## Overview

The TMetric MCP Server uses a comprehensive testing strategy with:
- **Unit tests** for utility functions
- **Integration tests** for API client operations
- **HTTP mocking** using `nock` for reliable, deterministic tests
- **Time mocking** using Vitest's fake timers for predictable time-based tests

## Testing Stack

- **[Vitest](https://vitest.dev/)** - Fast, modern test framework with native ESM support
- **[Nock](https://github.com/nock/nock)** - HTTP mocking library for intercepting Axios requests
- **[@vitest/coverage-v8](https://vitest.dev/guide/coverage.html)** - Code coverage using V8's native instrumentation
- **[@vitest/ui](https://vitest.dev/guide/ui.html)** - Interactive test UI for development

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with interactive UI
npm run test:ui

# Run tests in watch mode with coverage
npm run test:coverage:watch
```

### Watch Mode

Watch mode is ideal during development:
```bash
npm run test:watch
```

This will:
- Re-run tests when files change
- Only run tests related to changed files
- Show results in real-time

### Coverage Reports

Generate coverage reports to ensure comprehensive testing:
```bash
npm run test:coverage
```

Coverage reports are generated in multiple formats:
- **Terminal output** - Quick summary in console
- **HTML report** - Open `coverage/index.html` in browser for detailed view
- **LCOV report** - Machine-readable format for CI/CD integration

## Test Structure

### Test Files

Tests are co-located with source files:
```
src/
├── utils.ts              # Utility functions
├── utils.test.ts         # Unit tests for utilities
├── tmetric-client.ts     # TMetric API client
├── tmetric-client.test.ts # Integration tests for client
├── types.ts              # TypeScript types (no tests needed)
└── index.ts              # MCP server entry point (excluded from coverage)
```

### Test Organization

Each test file follows this structure:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ModuleName', () => {
  beforeEach(() => {
    // Setup code that runs before each test
  });

  afterEach(() => {
    // Cleanup code that runs after each test
  });

  describe('functionName', () => {
    it('should handle normal case', () => {
      // Arrange: Set up test data
      // Act: Execute the function
      // Assert: Verify the result
    });

    it('should handle edge case', () => {
      // ...
    });

    it('should handle error case', () => {
      // ...
    });
  });
});
```

## Writing Tests

### Unit Tests (utils.test.ts)

Unit tests focus on pure functions with no external dependencies:

```typescript
import { describe, it, expect } from 'vitest';
import { formatMinutesToGitLab } from './utils.js';

describe('formatMinutesToGitLab', () => {
  it('should format hours and minutes', () => {
    expect(formatMinutesToGitLab(150)).toBe('2h30m');
  });

  it('should handle edge cases', () => {
    expect(formatMinutesToGitLab(0)).toBe('0m');
    expect(formatMinutesToGitLab(60)).toBe('1h');
  });
});
```

### Integration Tests (tmetric-client.test.ts)

Integration tests verify API interactions using mocked HTTP requests:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import nock from 'nock';
import { TMetricClient } from './tmetric-client.js';

const TMETRIC_BASE_URL = 'https://app.tmetric.com';
const API_TOKEN = 'test-api-token';
const ACCOUNT_ID = 'test-account-123';

describe('TMetricClient', () => {
  let client: TMetricClient;

  beforeEach(() => {
    client = new TMetricClient(API_TOKEN);
    nock.cleanAll(); // Clean previous mocks
  });

  afterEach(() => {
    nock.cleanAll(); // Ensure cleanup
  });

  it('should fetch projects', async () => {
    // Mock the API response
    nock(TMETRIC_BASE_URL)
      .get('/api/v3/user')
      .reply(200, { activeAccountId: ACCOUNT_ID });

    nock(TMETRIC_BASE_URL)
      .get(`/api/v3/accounts/${ACCOUNT_ID}/timeentries/projects`)
      .reply(200, [{ id: 1, name: 'Test Project' }]);

    // Execute
    await client.initialize();
    const result = await client.listProjects();

    // Verify
    expect(result.success).toBe(true);
    expect(result.projects).toHaveLength(1);
  });
});
```

### Mocking Time

Use Vitest's fake timers for predictable time-based tests:

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

it('should calculate elapsed time', () => {
  const startTime = '2024-01-15T10:00:00Z';
  const elapsed = calculateElapsed(startTime);
  expect(elapsed).toBe('2h 0m'); // Exactly 2 hours from 10:00 to 12:00
});
```

## Coverage Requirements

The project maintains high coverage standards:

| Metric      | Threshold | Current |
|-------------|-----------|---------|
| Statements  | 80%       | 100%    |
| Branches    | 80%       | 97%+    |
| Functions   | 80%       | 100%    |
| Lines       | 80%       | 100%    |

### Excluded from Coverage

These files are intentionally excluded:
- `src/index.ts` - MCP server entry point (tested through manual integration)
- `**/*.config.ts` - Configuration files
- `**/*.test.ts` - Test files themselves

### Viewing Coverage

After running `npm run test:coverage`, open the HTML report:
```bash
# Linux/Mac
open coverage/index.html

# Windows
start coverage/index.html
```

The HTML report shows:
- Line-by-line coverage highlighting
- Branch coverage visualization
- Uncovered code paths
- Coverage trends

## Mocking Strategy

### HTTP Mocking with Nock

Nock intercepts HTTP requests made by Axios:

```typescript
// Mock successful API call
nock('https://app.tmetric.com')
  .get('/api/v3/user')
  .reply(200, { activeAccountId: '123' });

// Mock API error
nock('https://app.tmetric.com')
  .get('/api/v3/projects')
  .reply(500, { error: 'Server error' });

// Mock network error
nock('https://app.tmetric.com')
  .get('/api/v3/projects')
  .replyWithError('Network error');

// Verify request body
nock('https://app.tmetric.com')
  .post('/api/v3/timeentries', (body) => {
    expect(body.task.name).toBe('Expected Task');
    return true;
  })
  .reply(200, { id: '456' });
```

### Best Practices for Mocking

1. **Always clean mocks**: Use `nock.cleanAll()` in `beforeEach` and `afterEach`
2. **Mock before initialization**: Set up mocks before calling client methods
3. **Test both success and failure**: Mock successful responses and error cases
4. **Verify request details**: Use request body matchers to verify data sent to API
5. **One mock per test**: Keep mocks isolated to individual test cases

## Best Practices

### Test Organization

1. **Group related tests** using nested `describe` blocks
2. **Use descriptive names** that explain what's being tested
3. **Follow AAA pattern**: Arrange, Act, Assert
4. **One assertion per test** (when possible) for clarity

### Test Data

1. **Use realistic data** that matches actual API responses
2. **Create constants** for repeated values (API_TOKEN, ACCOUNT_ID)
3. **Use factories** for complex test objects to reduce duplication

### Async Testing

1. **Always await** async operations
2. **Use `expect().rejects`** for testing expected errors:
   ```typescript
   await expect(client.initialize()).rejects.toThrow('Failed to initialize');
   ```

### Edge Cases

Always test:
- **Empty inputs** - empty arrays, null values, undefined
- **Boundary conditions** - zero, maximum values
- **Error states** - network errors, API errors, validation errors
- **Race conditions** - multiple timers, concurrent requests

### Continuous Integration

When setting up CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test

- name: Generate coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v3
  with:
    files: ./coverage/lcov.info
```

## Debugging Tests

### Run Specific Tests

```bash
# Run tests matching pattern
npm test -- utils

# Run single test file
npm test -- src/utils.test.ts

# Run tests with specific name
npm test -- -t "should calculate elapsed time"
```

### Use Interactive UI

The interactive UI is great for debugging:
```bash
npm run test:ui
```

Then open `http://localhost:51204/__vitest__/` in your browser.

### Console Debugging

Add console logs in tests:
```typescript
it('should debug this', () => {
  const result = someFunction();
  console.log('Result:', result);
  expect(result).toBe(expected);
});
```

Use Vitest's built-in debugging:
```typescript
import { debug } from 'vitest';

it('should debug this', () => {
  debug(someValue); // Pretty-prints the value
});
```

## Common Issues

### Issue: Tests fail with "nock: No match for request"

**Solution**: Ensure all HTTP requests are mocked before they're made:
```typescript
beforeEach(() => {
  // Mock ALL requests the test will make
  nock('https://app.tmetric.com')
    .get('/api/v3/user')
    .reply(200, { activeAccountId: '123' });
});
```

### Issue: Time-based tests are flaky

**Solution**: Use fake timers instead of real delays:
```typescript
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
});
```

### Issue: Coverage not meeting threshold

**Solution**:
1. Run `npm run test:coverage` to see uncovered lines
2. Open `coverage/index.html` for visual coverage report
3. Add tests for uncovered branches and edge cases

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Nock Documentation](https://github.com/nock/nock)
- [Testing Best Practices](https://testingjavascript.com/)
- [Arrange-Act-Assert Pattern](https://automationpanda.com/2020/07/07/arrange-act-assert-a-pattern-for-writing-good-tests/)
