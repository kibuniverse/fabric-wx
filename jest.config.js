module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
  ],
  moduleFileExtensions: ['ts', 'js', 'json'],
  coverageDirectory: 'coverage',
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        module: 'commonjs',
        target: 'ES2020',
        types: ['jest', 'node'],
        skipLibCheck: true,
      },
    }],
  },
  moduleNameMapper: {
    '^wx-server-sdk$': '<rootDir>/__mocks__/wx-server-sdk.js',
    '^wx$': '<rootDir>/__mocks__/wx.ts',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
};