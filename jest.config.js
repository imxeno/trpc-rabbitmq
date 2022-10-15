// @ts-check

/** @type {import('ts-jest/dist/types').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: './test',
  snapshotFormat: {
    escapeString: true,
    printBasicPrototype: true
  }
};
