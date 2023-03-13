import { Text } from '../src/utils/text';

describe('text', () => {
  it('should look like a string', () => {
    expect(new Text('hello').string).toEqual('hello');
  });
  it('should handle surrogate pair as a single code point', () => {
    expect(new Text('𝌆').length).toEqual(1);
  });
});

describe('text comparer', () => {
  it('should order two text objects <=', () => {
    expect(new Text('hello').compareTo('world')).toEqual(-1);
    expect(Text.comparer('hello', 'world')).toEqual(-1);
  });
  it('should order two text objects == ', () => {
    expect(new Text('goodbye').compareTo('goodbye')).toEqual(-1);
    expect(Text.comparer('goodbye', 'goodbye')).toEqual(-1);
  });
  it('should order two text objects >= ', () => {
    expect(new Text('world').compareTo('cruel')).toEqual(1);
    expect(Text.comparer('world', 'cruel')).toEqual(1);
  });
});