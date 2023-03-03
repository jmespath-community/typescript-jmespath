import { compile, TreeInterpreter } from '../src';

describe('Evaluates functions', () => {
  it('search a in lexical scope', () => {
    const ast = compile("let({foo: 'bar'}, &foo)");
    expect(TreeInterpreter.search(ast, {})).toEqual('bar');
  });
});
