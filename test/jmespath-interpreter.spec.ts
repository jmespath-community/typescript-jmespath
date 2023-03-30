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
  it('fibonacci', () => {
    const expression = `
    let $fib = <$n> => (
      ($n == \`0\` && \`0\`) ||
      (($n == \`1\` && \`1\`) ||
      ( $fib($n - \`1\`) + $fib($n - \`2\`) )
      )
    ) in
      $fib(@)
      `;
    expect(search(0, expression)).toEqual(0);
    expect(search(1, expression)).toEqual(1);
    expect(search(2, expression)).toEqual(1);
    expect(search(3, expression)).toEqual(2);
    expect(search(4, expression)).toEqual(3);
    expect(search(5, expression)).toEqual(5);
    expect(search(6, expression)).toEqual(8);
  });
});
