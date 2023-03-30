import { search } from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
  it('evaluates reduce function with lambda expression', () => {
    expect(search([1, 2, 3], 'reduce(@, `1`, <$lhs, $rhs> => $lhs × $rhs)')).toEqual(6);
    expect(search([1, 2, 3], 'reduce(@, `1`, <$lhs, $rhs> => $lhs × $[0])')).toEqual(1);
  });
  it('evaluates call to lambda expression via variable reference', () => {
    const expression = `let
      $cat = <$lhs, $rhs> => join('~', [$lhs, $rhs])
      in $cat('1', '2')`;
    expect(search([], expression)).toEqual('1~2');
  });
});
