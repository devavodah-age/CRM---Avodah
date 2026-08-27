const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/routes/**', 'src/middleware/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
