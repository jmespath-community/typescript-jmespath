import { describe, expect, it } from 'vitest';
import { search } from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
});
