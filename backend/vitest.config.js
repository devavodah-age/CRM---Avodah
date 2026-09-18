const { defineConfig, configDefaults } = require('vitest/config');

const integrationTests = [
  '**/routes/__tests__/auth.test.js',
  '**/routes/__tests__/leads.test.js',
];

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // Nunca deixa os testes destrutivos caírem por engano no DATABASE_URL de
    // produção. Eles só rodam quando um banco dedicado é informado.
    exclude: process.env.TEST_DATABASE_URL
      ? configDefaults.exclude
      : [...configDefaults.exclude, ...integrationTests],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/routes/**', 'src/middleware/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
});
