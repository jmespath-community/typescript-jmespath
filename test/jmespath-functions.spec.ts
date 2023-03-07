import { expectError } from './compliance.spec';
import { search } from '../src';

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
  it('items()', () => {
    expect(search({ foo: 'bar', baz: 'qux' }, 'items(@)')).toEqual([
      ['foo', 'bar'],
      ['baz', 'qux'],
    ]);
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
});
