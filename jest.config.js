module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFilesAfterEnv: ['./tests/setup.js'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/controllers/**/*.js',
    'src/services/**/*.js',
    '!src/services/emailService.js',
    '!src/services/smsService.js'
  ]
};
