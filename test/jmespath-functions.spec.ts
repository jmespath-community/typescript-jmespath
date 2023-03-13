import { expectError } from './compliance.spec';
import { search } from '../src';

describe('Evaluates functions', () => {
  it('search a in lexical scope', () => {
    expect(search({}, "let({foo: 'bar'}, &foo)") ).toEqual('bar');
  });
  it('pad_left()', () => { // this should be included in the compliance test suite
    expect(search('', 'pad_left(@, `10`)')).toEqual('');
  });
  it('pad_right()', () => { // this should be included in the compliance test suite
    expect(search('', 'pad_right(@, `10`)')).toEqual('');
  });
});

describe('Type-checks function arguments', () => {
  it('find_last()', () => { // this should be included in the compliance test suite
    expectError(() => {
      return search('subject string', "find_last(@, 's', `1.3`)");
    }, 'invalid-value');
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
