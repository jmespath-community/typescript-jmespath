import { describe, expect, it } from 'vitest';
import jmespath from '../src';
import { expectError } from './error.utils';

describe('Evaluates functions', () => {
  it('from_items()', () => {
    expect(jmespath.search([], 'from_items(@)')).toEqual({});
  });
  it('from_items()', () => {
    expect(
      jmespath.search(
        [
          ['foo', 'bar'],
          ['baz', 'qux'],
        ],
        'from_items(@)',
      ),
    ).toEqual({ foo: 'bar', baz: 'qux' });
  });
  it('group_by()', () => {
    expect(jmespath.search([], 'group_by(@, &ignored)')).toEqual({});
  });
  it('group_by()', () => {
    const input = {
      items: [
        { spec: { nodeName: 'node_01', other: 'values_01' } },
        { spec: { nodeName: 'node_02', other: 'values_02' } },
        { spec: { nodeName: 'node_03', other: 'values_03' } },
        { spec: { nodeName: 'node_01', other: 'values_04' } },
      ],
    };
    expect(jmespath.search(input, 'group_by(items, &spec.nodeName)')).toEqual({
      node_01: [
        { spec: { nodeName: 'node_01', other: 'values_01' } },
        { spec: { nodeName: 'node_01', other: 'values_04' } },
      ],
      node_02: [{ spec: { nodeName: 'node_02', other: 'values_02' } }],
      node_03: [{ spec: { nodeName: 'node_03', other: 'values_03' } }],
    });
  });
  it('group_by() prototype keys collision', () => {
    const items = [
      { k: 'constructor', val: 1 },
      { k: 'toString', val: 2 },
      { k: '__proto__', val: 3 },
      { k: 'hasOwnProperty', val: 4 },
      { k: 'a', val: 5 },
    ];
    expect(jmespath.search(items, 'group_by(@, &k)')).toEqual({
      constructor: [{ k: 'constructor', val: 1 }],
      toString: [{ k: 'toString', val: 2 }],
      ['__proto__']: [{ k: '__proto__', val: 3 }],
      hasOwnProperty: [{ k: 'hasOwnProperty', val: 4 }],
      a: [{ k: 'a', val: 5 }],
    });
  });
  it('group_by() discards null or missing keys per spec', () => {
    const items = [{ b: true, name: 'one' }, { b: false, name: 'two' }, { b: false, name: null }, { b: false }];
    expect(jmespath.search(items, 'group_by(@, &name)')).toEqual({
      one: [{ b: true, name: 'one' }],
      two: [{ b: false, name: 'two' }],
    });
  });
  it('contains() returns false for non-string search in string', () => {
    expect(jmespath.search('abc', 'contains(@, `1`)')).toBe(false);
    expect(jmespath.search('abc', 'contains(@, `null`)')).toBe(false);
    expect(jmespath.search('abc', 'contains(@, `true`)')).toBe(false);
    expect(jmespath.search('abc', 'contains(@, `{"a": 1}`)')).toBe(false);
    expect(jmespath.search('abc', 'contains(@, `[1]`)')).toBe(false);
    expect(jmespath.search('abc', "contains(@, 'b')")).toBe(true);
    expect(jmespath.search('abc', "contains(@, 'z')")).toBe(false);
  });
  it('min() and max() use code-point ordering for strings', () => {
    expect(jmespath.search(['b', 'A', 'B', 'a'], 'min(@)')).toEqual('A');
    expect(jmespath.search(['b', 'A', 'B', 'a'], 'max(@)')).toEqual('b');
    expect(jmespath.search(['é', 'z', 'Z'], 'min(@)')).toEqual('Z');
    expect(jmespath.search(['é', 'z', 'Z'], 'max(@)')).toEqual('é');
    expect(jmespath.search(['\u{10000}', '\uE000'], 'min(@)')).toEqual('\uE000');
    expect(jmespath.search(['\u{10000}', '\uE000'], 'max(@)')).toEqual('\u{10000}');
    expect(jmespath.search([], 'min(@)')).toBeNull();
    expect(jmespath.search([], 'max(@)')).toBeNull();
  });
  it('max_by() and min_by() support string keys', () => {
    const items = [{ k: 'apple' }, { k: 'banana' }, { k: 'cherry' }];
    expect(jmespath.search(items, 'max_by(@, &k)')).toEqual({ k: 'cherry' });
    expect(jmespath.search(items, 'min_by(@, &k)')).toEqual({ k: 'apple' });

    const mixedCase = [{ k: 'b' }, { k: 'A' }, { k: 'B' }, { k: 'a' }];
    expect(jmespath.search(mixedCase, 'max_by(@, &k)')).toEqual({ k: 'b' });
    expect(jmespath.search(mixedCase, 'min_by(@, &k)')).toEqual({ k: 'A' });
  });
  it('max_by() and min_by() preserve scalar 0 and empty string', () => {
    expect(jmespath.search([0, -1, -2], 'max_by(@, &@)')).toEqual(0);
    expect(jmespath.search([0, 1, 2], 'min_by(@, &@)')).toEqual(0);
    expect(jmespath.search(['', 'a', 'b'], 'min_by(@, &@)')).toEqual('');
    expect(jmespath.search([], 'max_by(@, &@)')).toBeNull();
    expect(jmespath.search([], 'min_by(@, &@)')).toBeNull();
  });
  it('items()', () => {
    expect(jmespath.search({ foo: 'bar', baz: 'qux' }, 'items(@)')).toEqual([
      ['foo', 'bar'],
      ['baz', 'qux'],
    ]);
  });
  it('pad_left()', () => {
    // this should be included in the compliance test suite
    expect(jmespath.search('', 'pad_left(@, `10`)')).toEqual('');
    expect(jmespath.search('hi', "pad_left(@, `5`, '😀')")).toEqual('😀😀😀hi');
    expect(jmespath.search('😀', "pad_left(@, `3`, '-')")).toEqual('--😀');
    expect(jmespath.search('hello', "pad_left(@, `5`, '-')")).toEqual('hello');
    expect(jmespath.search('hello', "pad_left(@, `3`, '-')")).toEqual('hello');
  });
  it('pad_right()', () => {
    // this should be included in the compliance test suite
    expect(jmespath.search('', 'pad_right(@, `10`)')).toEqual('');
    expect(jmespath.search('hi', "pad_right(@, `5`, '😀')")).toEqual('hi😀😀😀');
    expect(jmespath.search('😀', "pad_right(@, `3`, '-')")).toEqual('😀--');
    expect(jmespath.search('hello', "pad_right(@, `5`, '-')")).toEqual('hello');
    expect(jmespath.search('hello', "pad_right(@, `3`, '-')")).toEqual('hello');
  });
  it('to_number() conforms strictly to JSON number grammar', () => {
    // Non-JSON numbers return null
    expect(jmespath.search('', 'to_number(@)')).toBeNull();
    expect(jmespath.search('   ', 'to_number(@)')).toBeNull();
    expect(jmespath.search('0x1f', 'to_number(@)')).toBeNull();
    expect(jmespath.search('0b10', 'to_number(@)')).toBeNull();
    expect(jmespath.search('0o10', 'to_number(@)')).toBeNull();
    expect(jmespath.search('+1', 'to_number(@)')).toBeNull();
    expect(jmespath.search('01', 'to_number(@)')).toBeNull();
    expect(jmespath.search('00', 'to_number(@)')).toBeNull();
    expect(jmespath.search('1.', 'to_number(@)')).toBeNull();
    expect(jmespath.search('.5', 'to_number(@)')).toBeNull();
    expect(jmespath.search('1e', 'to_number(@)')).toBeNull();
    expect(jmespath.search('Infinity', 'to_number(@)')).toBeNull();
    expect(jmespath.search('-Infinity', 'to_number(@)')).toBeNull();
    expect(jmespath.search('NaN', 'to_number(@)')).toBeNull();

    // Valid JSON numbers are converted
    expect(jmespath.search('0', 'to_number(@)')).toBe(0);
    expect(jmespath.search('-0', 'to_number(@)')).toBe(-0);
    expect(jmespath.search('123', 'to_number(@)')).toBe(123);
    expect(jmespath.search('-123', 'to_number(@)')).toBe(-123);
    expect(jmespath.search('12.34', 'to_number(@)')).toBe(12.34);
    expect(jmespath.search('-0.5', 'to_number(@)')).toBe(-0.5);
    expect(jmespath.search('1e5', 'to_number(@)')).toBe(100000);
    expect(jmespath.search('2.5E-2', 'to_number(@)')).toBe(0.025);
    expect(jmespath.search(42, 'to_number(@)')).toBe(42);
    expect(jmespath.search(null, 'to_number(@)')).toBeNull();
    expect(jmespath.search([1], 'to_number(@)')).toBeNull();
  });
  it('zip()', () => {
    expect(jmespath.search([], 'zip(@)')).toEqual([]);
  });
  it('zip()', () => {
    const input = {
      people: ['Monika', 'Alice'],
      country: ['Germany', 'USA', 'France'],
    };
    expect(jmespath.search(input, 'zip(people, country)')).toEqual([
      ['Monika', 'Germany'],
      ['Alice', 'USA'],
    ]);
  });
});

describe('Type-checks function arguments', () => {
  it('find_last()', () => {
    // this should be included in the compliance test suite
    expectError(() => {
      return jmespath.search('subject string', "find_last(@, 's', `1.3`)");
    }, 'invalid-value');
  });
  it('from_items()', () => {
    expectError(() => {
      return jmespath.search(null, 'from_items(@)');
    }, ['invalid-type', 'null']);
  });
  it('from_items()', () => {
    expectError(() => {
      return jmespath.search('foo', 'from_items(@)');
    }, ['invalid-type', 'string']);
  });
  it('from_items()', () => {
    expectError(() => {
      return jmespath.search([[]], 'from_items(@)');
    }, 'invalid-value');
  });
  it('from_items()', () => {
    expectError(() => {
      return jmespath.search([[1, 'one']], 'from_items(@)');
    }, 'invalid-value');
  });
  it('group_by()', () => {
    expectError(() => {
      return jmespath.search({}, 'group_by(@, &`false`)');
    }, 'invalid-type');
  });
  it('group_by()', () => {
    expectError(() => {
      return jmespath.search([{}, {}], 'group_by(@, &`false`)');
    }, 'invalid-type');
  });
  it('group_by()', () => {
    expectError(() => {
      return jmespath.search([{ a: 42 }, { a: 42 }], 'group_by(@, &a)');
    }, 'invalid-type');
  });
  it('max_by() and min_by() error on non-number non-string keys', () => {
    expectError(() => {
      return jmespath.search([{ k: true }], 'max_by(@, &k)');
    }, 'invalid-type');
    expectError(() => {
      return jmespath.search([{ k: true }], 'min_by(@, &k)');
    }, 'invalid-type');
  });
  it('max_by() and min_by() error on mixed key types', () => {
    expectError(() => {
      return jmespath.search([{ k: 1 }, { k: 'foo' }], 'max_by(@, &k)');
    }, 'invalid-type');
    expectError(() => {
      return jmespath.search([{ k: 'foo' }, { k: 1 }], 'min_by(@, &k)');
    }, 'invalid-type');
  });
  it('length()', () => {
    try {
      jmespath.search([], 'length(`null`)');
    } catch (e) {
      if (e instanceof Error) {
        expect(e.message).toContain('length() expected argument 1 to be type (string | array | object)');
        expect(e.message).toContain('received type null instead.');
      }
    }
  });
  it('pad_right()', () => {
    // this should be included in the compliance test suite
    expectError(() => {
      return jmespath.search('subject string', "pad_right(@, `1`, '--')");
    }, 'invalid-value');
  });
  it('pad_left() rejects empty string and multi-codepoint padding', () => {
    expectError(() => {
      return jmespath.search('subject string', "pad_left(@, `10`, '')");
    }, 'invalid-value');
    expectError(() => {
      return jmespath.search('subject string', "pad_left(@, `10`, '😀😀')");
    }, 'invalid-value');
  });
  it('pad_right() rejects empty string and multi-codepoint padding', () => {
    expectError(() => {
      return jmespath.search('subject string', "pad_right(@, `10`, '')");
    }, 'invalid-value');
    expectError(() => {
      return jmespath.search('subject string', "pad_right(@, `10`, '😀😀')");
    }, 'invalid-value');
  });

  it('replace() does not repeatedly mutate its own inserted substitutions', () => {
    expect(jmespath.search({}, "replace('a', 'a', 'ba', `3`)")).toEqual('ba');
    expect(jmespath.search({}, "replace('banana', 'an', 'anan', `1`)")).toEqual('bananana');
    expect(jmespath.search({}, "replace('abc', '', 'x', `1`)")).toEqual('axbc');
  });

  it('find_first() and find_last() handle negative slice bounds and codepoints correctly', () => {
    expect(jmespath.search({ s: 'subject string' }, "find_first(s, 's', `-6`)")).toBe(8);
    expect(jmespath.search({ s: 'subject string' }, "find_first(s, 's', `-3`)")).toBeNull();
    expect(jmespath.search({ s: 'subject string' }, "find_last(s, 's', `-5`)")).toBeNull();
    expect(jmespath.search({ s: 'subject string' }, "find_last(s, 's', `0`, `-7`)")).toBe(0);

    // Unicode code point indexing
    expect(jmespath.search({ s: '😀abc😀' }, "find_first(s, 'a')")).toBe(1);
    expect(jmespath.search({ s: '😀abc😀' }, "find_first(s, '😀', `1`)")).toBe(4);
    expect(jmespath.search({ s: '😀abc😀' }, "find_last(s, '😀')")).toBe(4);
    expect(jmespath.search({ s: '😀abc😀' }, "find_last(s, '😀', `0`, `3`)")).toBe(0);
  });

  it('split() splits empty search string by Unicode code points', () => {
    expect(jmespath.search({}, "split('😀ab', '')")).toEqual(['😀', 'a', 'b']);
    expect(jmespath.search({}, "split('😀ab', '', `1`)")).toEqual(['😀', 'ab']);
  });
});

describe('custom functions', () => {
  it('must be in scope for let expression', () => {
    jmespath.registerFunction(
      'plusplus', // FUNCTION NAME
      resolvedArgs => {
        // CUSTOM FUNCTION
        const [num] = resolvedArgs;
        return num + 1;
      },
      [{ types: [jmespath.TYPE_NUMBER] }], //SIGNATURE
    );
    expect(jmespath.search({ index: 0 }, 'let $n = index in plusplus($n)')).toEqual(1);
  });
});
