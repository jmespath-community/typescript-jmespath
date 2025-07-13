import { describe, expect, it } from 'vitest';
import { search } from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });

  it('handles filter projections with array field access', () => {
    const data = [
      {
        stack: '',
        branch: ['one/', 'two/'],
      },
      {
        stack: null,
        branch: ['three/', 'four/'],
      },
    ];

    const result = search(data, "[?stack==''].branch[?starts_with(@, 'one')]");
    expect(result).toEqual([['one/']]);
  });
});
