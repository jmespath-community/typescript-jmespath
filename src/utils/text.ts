export class Text {
  private _text: string;

  constructor(text: string) {
    this._text = text;
  }

  public get string(): string {
    return this._text;
  }

  public get length(): number {
    let count = 0;
    for (const _ of this._text) {
      count += 1;
    }
    return count;
  }

  public compareTo(other: string): number {
    return Text.compare(this, new Text(other));
  }

  public static get comparer(): (lhs: string, rhs: string) => number {
    return (left: string, right: string): number => {
      return new Text(left).compareTo(right);
    };
  }

  public static compare(left: Text, right: Text): number {
    const leftChars = [...left._text];
    const rightChars = [...right._text];
    const len = Math.min(leftChars.length, rightChars.length);
    for (let index = 0; index < len; index++) {
      if (leftChars[index] === rightChars[index]) {
        continue;
      }
      // biome-ignore lint/style/noNonNullAssertion: Character from non-empty string always has code point
      return leftChars[index].codePointAt(0)! > rightChars[index].codePointAt(0)! ? 1 : -1;
    }
    if (leftChars.length === rightChars.length) {
      return 0;
    }
    return leftChars.length > rightChars.length ? 1 : -1;
  }

  public reverse(): string {
    return [...this._text].reverse().join('');
  }
}
