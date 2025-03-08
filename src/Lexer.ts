import { JSONValue } from './JSON.type';
import { LexerOptions, LexerToken, Token } from './Lexer.type';
import { isAlpha, isAlphaNum, isNum } from './utils/index';
import { replace } from './utils/strings';

export const basicTokens: Record<string, Token> = {
  '(': Token.TOK_LPAREN,
  ')': Token.TOK_RPAREN,
  '*': Token.TOK_STAR,
  ',': Token.TOK_COMMA,
  '.': Token.TOK_DOT,
  ':': Token.TOK_COLON,
  '@': Token.TOK_CURRENT,
  ']': Token.TOK_RBRACKET,
  '{': Token.TOK_LBRACE,
  '}': Token.TOK_RBRACE,
  '+': Token.TOK_PLUS,
  '%': Token.TOK_MODULO,
  '\u2212': Token.TOK_MINUS,
  '\u00d7': Token.TOK_MULTIPLY,
  '\u00f7': Token.TOK_DIVIDE,
};

const operatorStartToken: Record<string, boolean> = {
  '!': true,
  '<': true,
  '=': true,
  '>': true,
  '&': true,
  '|': true,
  '/': true,
};

const skipChars: Record<string, boolean> = {
  '\t': true,
  '\n': true,
  '\r': true,
  ' ': true,
};

class StreamLexer {
  private _current = 0;
  private _enable_legacy_literals = false;

  tokenize(stream: string, options?: LexerOptions): LexerToken[] {
    const tokens: LexerToken[] = [];
    this._current = 0;
    this._enable_legacy_literals = options?.enable_legacy_literals || false;

    let start;
    let identifier;
    let token;
    while (this._current < stream.length) {
      if (isAlpha(stream[this._current])) {
        start = this._current;
        identifier = this.consumeUnquotedIdentifier(stream);
        tokens.push({
          start,
          type: Token.TOK_UNQUOTEDIDENTIFIER,
          value: identifier,
        });
      } else if (basicTokens[stream[this._current]] !== undefined) {
        tokens.push({
          start: this._current,
          type: basicTokens[stream[this._current]],
          value: stream[this._current],
        });
        this._current += 1;
      } else if (stream[this._current] === '$') {
        start = this._current;
        if (this._current + 1 < stream.length && isAlpha(stream[this._current + 1])) {
          this._current += 1;
          identifier = this.consumeUnquotedIdentifier(stream);
          tokens.push({
            start,
            type: Token.TOK_VARIABLE,
            value: identifier,
          });
        } else {
          tokens.push({
            start: start,
            type: Token.TOK_ROOT,
            value: stream[this._current],
          });
          this._current += 1;
        }
      } else if (stream[this._current] === '-') {
        if (this._current + 1 < stream.length && isNum(stream[this._current + 1])) {
          const token = this.consumeNumber(stream);
          token && tokens.push(token);
        } else {
          const token = {
            start: this._current,
            type: Token.TOK_MINUS,
            value: '-',
          };
          tokens.push(token);
          this._current += 1;
        }
      } else if (isNum(stream[this._current])) {
        token = this.consumeNumber(stream);
        tokens.push(token);
      } else if (stream[this._current] === '[') {
        token = this.consumeLBracket(stream);
        tokens.push(token);
      } else if (stream[this._current] === '"') {
        start = this._current;
        identifier = this.consumeQuotedIdentifier(stream);
        tokens.push({
          start,
          type: Token.TOK_QUOTEDIDENTIFIER,
          value: identifier,
        });
      } else if (stream[this._current] === `'`) {
        start = this._current;
        identifier = this.consumeRawStringLiteral(stream);
        tokens.push({
          start,
          type: Token.TOK_LITERAL,
          value: identifier,
        });
      } else if (stream[this._current] === '`') {
        start = this._current;
        const literal = this.consumeLiteral(stream);
        tokens.push({
          start,
          type: Token.TOK_LITERAL,
          value: literal,
        });
      } else if (operatorStartToken[stream[this._current]] !== undefined) {
        token = this.consumeOperator(stream);
        token && tokens.push(token);
      } else if (skipChars[stream[this._current]] !== undefined) {
        this._current += 1;
      } else {
        const error = new Error(`Syntax error: unknown character: ${stream[this._current]}`);
        error.name = 'LexerError';
        throw error;
      }
    }
    return tokens;
  }

  private consumeUnquotedIdentifier(stream: string): string {
    const start = this._current;
    this._current += 1;
    while (this._current < stream.length && isAlphaNum(stream[this._current])) {
      this._current += 1;
    }
    return stream.slice(start, this._current);
  }

  private consumeQuotedIdentifier(stream: string): string {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (stream[this._current] !== '"' && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === '"')) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    this._current += 1;
    const [value, ok] = this.parseJSON(stream.slice(start, this._current));
    if (!ok) {
      const error = new Error(`syntax: unexpected end of JSON input`);
      error.name = 'LexerError';
      throw error;
    }
    return <string>value;
  }

  private consumeRawStringLiteral(stream: string): string {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (stream[this._current] !== `'` && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === `'`)) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    this._current += 1;
    const literal = stream.slice(start + 1, this._current - 1);
    return replace(replace(literal, `\\\\`, `\\`), `\\'`, `'`);
  }

  private consumeNumber(stream: string): LexerToken {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (isNum(stream[this._current]) && this._current < maxLength) {
      this._current += 1;
    }
    const value = parseInt(stream.slice(start, this._current), 10);
    return { start, value, type: Token.TOK_NUMBER };
  }

  private consumeLBracket(stream: string): LexerToken {
    const start = this._current;
    this._current += 1;
    if (stream[this._current] === '?') {
      this._current += 1;
      return { start, type: Token.TOK_FILTER, value: '[?' };
    }
    if (stream[this._current] === ']') {
      this._current += 1;
      return { start, type: Token.TOK_FLATTEN, value: '[]' };
    }
    return { start, type: Token.TOK_LBRACKET, value: '[' };
  }

  private consumeOrElse(stream: string, peek: string, token: Token, orElse: Token): LexerToken {
    const start = this._current;
    this._current += 1;
    if (this._current < stream.length && stream[this._current] === peek) {
      this._current += 1;
      return {
        start: start,
        type: orElse,
        value: stream.slice(start, this._current),
      };
    }
    return { start: start, type: token, value: stream[start] };
  }

  private consumeOperator(stream: string): LexerToken | void {
    const start = this._current;
    const startingChar = stream[start];
    switch (startingChar) {
      case '!':
        return this.consumeOrElse(stream, '=', Token.TOK_NOT, Token.TOK_NE);
      case '<':
        return this.consumeOrElse(stream, '=', Token.TOK_LT, Token.TOK_LTE);
      case '>':
        return this.consumeOrElse(stream, '=', Token.TOK_GT, Token.TOK_GTE);
      case '=':
        return this.consumeOrElse(stream, '=', Token.TOK_ASSIGN, Token.TOK_EQ);
      case '&':
        return this.consumeOrElse(stream, '&', Token.TOK_EXPREF, Token.TOK_AND);
      case '|':
        return this.consumeOrElse(stream, '|', Token.TOK_PIPE, Token.TOK_OR);
      case '/':
        return this.consumeOrElse(stream, '/', Token.TOK_DIVIDE, Token.TOK_DIV);
    }
  }

  private consumeLiteral(stream: string): JSONValue {
    this._current += 1;
    const start = this._current;
    const maxLength = stream.length;

    while (stream[this._current] !== '`' && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === '`')) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    let literalString = stream.slice(start, this._current).trimStart();
    literalString = literalString.replace('\\`', '`');

    let literal: JSONValue = null;
    let ok = false;

    // attempts to detect and parse valid JSON

    if (this.looksLikeJSON(literalString)) {
      [literal, ok] = this.parseJSON(literalString);
    }

    // invalid JSON values should be converted to quoted
    // JSON strings during the JEP-12 deprecation period.

    if (!ok && this._enable_legacy_literals) {
      [literal, ok] = this.parseJSON(`"${literalString}"`);
    }

    if (!ok) {
      const error = new Error(
        `Syntax error: unexpected end of JSON input or invalid format for a JSON literal: ${stream[this._current]}`,
      );
      error.name = 'LexerError';
      throw error;
    }

    this._current += 1;
    return literal;
  }

  private looksLikeJSON(literalString: string): boolean {
    const startingChars = '[{"';
    const jsonLiterals = ['true', 'false', 'null'];
    const numberLooking = '-0123456789';

    if (literalString === '') {
      return false;
    }
    if (startingChars.includes(literalString[0])) {
      return true;
    }
    if (jsonLiterals.includes(literalString)) {
      return true;
    }
    if (numberLooking.includes(literalString[0])) {
      // eslint-disable-next-line @typescript-eslint/naming-convention
      const [_, ok] = this.parseJSON(literalString);
      return ok;
    }
    return false;
  }

  private parseJSON(text: string): [JSONValue, boolean] {
    try {
      const json = JSON.parse(text);
      return [json, true];
    } catch {
      return [null, false];
    }
  }
}

export const Lexer = new StreamLexer();
export default Lexer;
