import { search } from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
  it('evaluates reduce function with lambda expression', () => {
    expect(search([1, 2, 3], 'reduce(@, `1`, <$lhs, $rhs> => $lhs × $rhs)')).toEqual(6);
    expect(search([1, 2, 3], 'reduce(@, `1`, <$lhs, $rhs> => $lhs × $[0])')).toEqual(1);
  });
});
