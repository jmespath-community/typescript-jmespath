import { search } from '../src';
import { expectError } from './compliance.spec';

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
  it('search a in lexical scope', () => {
    expect(search({}, "let({foo: 'bar'}, &foo)") ).toEqual('bar');
  });
  it('pad_left()', () => { // this should be included in the compliance test suite
    expect(search('', 'pad_left(@, `10`)')).toEqual('');
  });
  it('pad_right()', () => { // this should be included in the compliance test suite
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
  it('find_last()', () => { // this should be included in the compliance test suite
    expectError(() => {
      return search('subject string', "find_last(@, 's', `1.3`)");
    }, 'invalid-value');
  });
  it('from_items()', () => {
    // TODO: must be "invalid-type"
    expectError(() => {
      return search(null, 'from_items(@)');
    }, ['TypeError', 'null']);
  });
  it('from_items()', () => {
    // TODO: must be "invalid-type"
    expectError(() => {
      return search('foo', 'from_items(@)');
    }, ['TypeError', 'string']);
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
    // TODO: should be 'invalid-type'
    expectError(() => {
      return search({}, 'group_by(@, &`false`)');
    }, 'TypeError');
  });
  it('group_by()', () => {
    expectError(() => {
      // should be 'invalid-type'
      return search([{}, {}], 'group_by(@, &`false`)');
    }, 'TypeError');
  });
  it('group_by()', () => {
    // should be 'invalid-type'
    expectError(() => {
      return search([{a: 42}, {a: 42}], 'group_by(@, &a)');
    }, 'TypeError');
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
  it('pad_right()', () => { // this should be included in the compliance test suite
    expectError(() => {
      return search('subject string', "pad_right(@, `1`, '--')");
    }, 'invalid-value');
  });
});
