/**
 * Jest configuration for Type-on-Strap theme unit tests
 * @see https://jestjs.io/docs/configuration
 */
module.exports = {
  // Test environment
  testEnvironment: 'jsdom',
  
  // Test match patterns
  testMatch: [
    '**/unit/**/*.test.js',
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/_site/',
    '/e2e/',
    '/playwright-report/',
    '/test-results/',
  ],
  
  // Coverage configuration
  collectCoverageFrom: [
    'unit/**/*.js',
    '!unit/**/*.test.js',
    '!**/node_modules/**',
  ],
  
  // Coverage directory
  coverageDirectory: 'coverage',
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Setup files
  setupFiles: [],
  
  // Module paths
  roots: ['<rootDir>/unit'],
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Reset mocks between tests
  resetMocks: true,
  
  // Restore mocks between tests
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
};

