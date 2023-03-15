import { JSONValue } from "../src/JSON.type";

export function expectError(action: () => JSONValue, expected: string | string[]): void {
  let result: JSONValue = null;
  let succeeded = false;

  const errorTypes = ['invalid-type', 'invalid-value', 'invalid-arity', 'not-a-number', 'syntax', 'unknown-function'];

  function makePattern(text: string, replaceHyphens = false): string {
    let pattern = text;

    if (replaceHyphens) {
      errorTypes.map(errorType => {
        if (pattern.indexOf(errorType) != -1) {
          pattern = pattern.replace(errorType, errorType.replace('-', ' '));
        }
      });
    }

    pattern = pattern
      .replace(/\-/g, '\\-')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\./g, '\\.')
      .replace(/\*/g, '\\*')
      .replace(/\^/g, '\\^');

    return pattern;
  }
  function getPattern(text: string): RegExp {
    const pattern = `(${makePattern(text)})|(${makePattern(text, true)})`;
    return new RegExp(pattern, "i");
  }

  try {
    result = action();
    succeeded = true;
  } catch (e) {
    if (e instanceof Error) {
      const err = <Error>e;
      if (Array.isArray(expected)) {
        expected.map(element => {
          expect(err.message).toMatch(getPattern(element));
        });
      } else {
        expect(err.message).toMatch(getPattern(expected));
      }
    }
  }

  if (succeeded) {
    throw new Error(`the action was expected to throw an error but returned '${JSON.stringify(result)}' instead`);
  }
}
