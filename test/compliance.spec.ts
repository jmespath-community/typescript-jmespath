import { readdirSync, readFileSync } from 'fs';
import { basename } from 'path';
import { Options, search } from '../src';
import { JSONValue } from '../src/JSON.type';
import { expectError } from './error.utils';

export type ComplianceTestCaseDefinition = { expression: string; result?: JSONValue; error?: string };
export type ComplianceTestCase = { given: JSONValue; cases: ComplianceTestCaseDefinition[] };
export type ComplianceTestSuite = ComplianceTestCase[];

// Compliance tests that aren't supported yet.
const notImplementedYet: string[] = ['benchmarks.json'];

export function endsWith(str: string, suffix: string): boolean {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

export function addTestSuitesFromFile(filename: string, options?: Options): void {
  options = options || {};
  describe(filename, () => {
    const spec: ComplianceTestSuite = JSON.parse(readFileSync(filename, 'utf-8'));
    for (let i = 0; i < spec.length; i++) {
      const msg = `suite ${i} for filename ${filename}`;
      describe(msg, () => {
        const given = spec[i].given;
        const cases = spec[i].cases.map(c => [c.expression, c.result, c.error]);

        test.each(cases)('should pass test %# %s', (expression, result, error) => {
          if (error !== undefined) {
            expectError(() => {
              return search(given, <string>expression, options);
            }, <string>error);
          } else {
            expect(search(given, <string>expression, options)).toEqual(result);
          }
        });
      });
    }
  });
}

function getFileList(dirName: string): string[] {
  let files: string[] = [];
  const items = readdirSync(dirName, { withFileTypes: true });
  for (const item of items) {
    const itemName = `${dirName}/${item.name}`;
    if (item.isDirectory()) {
      files = [...files, ...getFileList(itemName)];
    } else {
      if (item.name.endsWith('.json') && !notImplementedYet.includes(basename(item.name))) {
        files.push(itemName);
      }
    }
  }

  return files;
}

const listing = getFileList('test/compliance/tests');
for (let i = 0; i < listing.length; i++) {
  const options: Options = {};
  if (basename(listing[i]) === 'legacy-literal.json') {
    options.enable_legacy_literals = true;
  }
  addTestSuitesFromFile(listing[i], options);
}
