// https://jestjs.io/docs/configuration
//

import type {Config} from 'jest';

const config: Config = {
  verbose: true,
  transform: {
    ".(ts|tsx)": "ts-jest"
  },
  testEnvironment: "node",
  testPathIgnorePatterns: ['.vscode', 'dist', 'node_modules'],
  maxConcurrency: 1,
  testRegex: '(/__tests__/.*|\\.?(test|spec))\\.(tsx?|jsx?)$',
  moduleDirectories: ["node_modules", "src"],
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js"
  ],
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/test/"
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  collectCoverageFrom: [
    "src/**/*.ts"
  ]
};

export default config;
