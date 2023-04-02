import { search } from '../src';

describe('Searches compiled ast', () => {
  it('search a compiled expression', () => {
    expect(search({ foo: { bar: 'BAZ' } }, 'foo.bar')).toEqual('BAZ');
  });
  it('search a compiled expression', () => {
    expect(search({ foo: 'bar' }, "foo match 'ba[rz]'")).toEqual(true);
  });
});
