import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'build/**',
        '**/*.config.ts',
        '**/*.test.ts',
        'src/index.ts', // MCP server entry point - integration tested separately
      ],
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'build'],
  },
});
