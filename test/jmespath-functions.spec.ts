import { search } from '../src';

describe('Evaluates functions', () => {
  it('search a in lexical scope', () => {
    expect(search({}, "let({foo: 'bar'}, &foo)") ).toEqual('bar');
  });
});
