import { describe, it, expect } from 'vitest';
import { search, registerFunction, TYPE_NUMBER } from '../src';
import { expectError } from './error.utils';

describe('Evaluates functions', () => {
  it('from_items()', () => {
    expect(search([], 'from_items(@)')).toEqual({});
  });
  it('from_items()', () => {
    expect(
      search(
        [
          ['foo', 'bar'],
          ['baz', 'qux'],
        ],
        'from_items(@)',
      ),
    ).toEqual({ foo: 'bar', baz: 'qux' });
  });
  it('group_by()', () => {
    expect(search([], 'group_by(@, &ignored)')).toEqual({});
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
    expect(search(input, 'group_by(items, &spec.nodeName)')).toEqual({
      node_01: [
        { spec: { nodeName: 'node_01', other: 'values_01' } },
        { spec: { nodeName: 'node_01', other: 'values_04' } },
      ],
      node_02: [{ spec: { nodeName: 'node_02', other: 'values_02' } }],
      node_03: [{ spec: { nodeName: 'node_03', other: 'values_03' } }],
    });
  });
  it('items()', () => {
    expect(search({ foo: 'bar', baz: 'qux' }, 'items(@)')).toEqual([
      ['foo', 'bar'],
      ['baz', 'qux'],
    ]);
  });
  it('pad_left()', () => {
    // this should be included in the compliance test suite
    expect(search('', 'pad_left(@, `10`)')).toEqual('');
  });
  it('pad_right()', () => {
    // this should be included in the compliance test suite
    expect(search('', 'pad_right(@, `10`)')).toEqual('');
  });
  it('zip()', () => {
    expect(search([], 'zip(@)')).toEqual([]);
  });
  it('zip()', () => {
    const input = {
      people: ['Monika', 'Alice'],
      country: ['Germany', 'USA', 'France'],
    };
    expect(search(input, 'zip(people, country)')).toEqual([
      ['Monika', 'Germany'],
      ['Alice', 'USA'],
    ]);
  });
});

describe('Type-checks function arguments', () => {
  it('find_last()', () => {
    // this should be included in the compliance test suite
    expectError(() => {
      return search('subject string', "find_last(@, 's', `1.3`)");
    }, 'invalid-value');
  });
  it('from_items()', () => {
    expectError(() => {
      return search(null, 'from_items(@)');
    }, ['invalid-type', 'null']);
  });
  it('from_items()', () => {
    expectError(() => {
      return search('foo', 'from_items(@)');
    }, ['invalid-type', 'string']);
  });
  it('from_items()', () => {
    expectError(() => {
      return search([[]], 'from_items(@)');
    }, 'invalid-value');
  });
  it('from_items()', () => {
    expectError(() => {
      return search([[1, 'one']], 'from_items(@)');
    }, 'invalid-value');
  });
  it('group_by()', () => {
    expectError(() => {
      return search({}, 'group_by(@, &`false`)');
    }, 'invalid-type');
  });
  it('group_by()', () => {
    expectError(() => {
      return search([{}, {}], 'group_by(@, &`false`)');
    }, 'invalid-type');
  });
  it('group_by()', () => {
    expectError(() => {
      return search([{ a: 42 }, { a: 42 }], 'group_by(@, &a)');
    }, 'invalid-type');
  });
  it('length()', () => {
    try {
      search([], 'length(`null`)');
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
      return search('subject string', "pad_right(@, `1`, '--')");
    }, 'invalid-value');
  });
});

describe('custom functions', () => {
  it('must be in scope for let expression', () => {
    registerFunction(
      'plusplus', // FUNCTION NAME
      resolvedArgs => {
        // CUSTOM FUNCTION
        const [num] = resolvedArgs;
        return num + 1;
      },
      [{ types: [TYPE_NUMBER] }], //SIGNATURE
    );
    expect(search({ index: 0 }, 'let $n = index in plusplus($n)')).toEqual(1);
  });
});
