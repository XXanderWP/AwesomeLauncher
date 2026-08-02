module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.jest.json'
      }
    ]
  },
  collectCoverageFrom: [
    'src/shared/**/*.ts',
    'src/main/utils/**/*.ts',
    'src/main/services/auth/**/*.ts',
    'src/main/services/download/preserveBackup.ts',
    'src/main/services/mods/modMetadata.ts',
    'src/main/services/config/ConfigService.ts',
    'src/main/services/server-status/**/*.ts',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^electron$': '<rootDir>/tests/mocks/electron.ts'
  },
  clearMocks: true
}
