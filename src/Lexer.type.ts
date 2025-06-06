import { JSONValue } from './JSON.type';

export enum Token {
  TOK_EOF = 'EOF',
  TOK_VARIABLE = 'Variable',
  TOK_ASSIGN = 'Assign',
  TOK_UNQUOTEDIDENTIFIER = 'UnquotedIdentifier',
  TOK_QUOTEDIDENTIFIER = 'QuotedIdentifier',
  TOK_RBRACKET = 'Rbracket',
  TOK_RPAREN = 'Rparen',
  TOK_COMMA = 'Comma',
  TOK_COLON = 'Colon',
  TOK_RBRACE = 'Rbrace',
  TOK_NUMBER = 'Number',
  TOK_CURRENT = 'Current',
  TOK_ROOT = 'Root',
  TOK_EXPREF = 'Expref',
  TOK_PIPE = 'Pipe',
  TOK_OR = 'Or',
  TOK_AND = 'And',
  TOK_EQ = 'EQ',
  TOK_GT = 'GT',
  TOK_LT = 'LT',
  TOK_GTE = 'GTE',
  TOK_LTE = 'LTE',
  TOK_NE = 'NE',
  TOK_PLUS = 'Plus',
  TOK_MINUS = 'Minus',
  TOK_MULTIPLY = 'Multiply',
  TOK_DIVIDE = 'Divide',
  TOK_MODULO = 'Modulo',
  TOK_DIV = 'Div',
  TOK_FLATTEN = 'Flatten',
  TOK_STAR = 'Star',
  TOK_FILTER = 'Filter',
  TOK_DOT = 'Dot',
  TOK_NOT = 'Not',
  TOK_LBRACE = 'Lbrace',
  TOK_LBRACKET = 'Lbracket',
  TOK_LPAREN = 'Lparen',
  TOK_LITERAL = 'Literal',
  TOK_QUESTION = 'Question',
}

export type LexerTokenValue = JSONValue;

export interface LexerToken {
  type: Token;
  value: LexerTokenValue;
  start: number;
}

export interface LexerOptions {
  // The flag to enable pre-JEP-12 literal compatibility.
  // JEP-12 deprecates `foo` -> "foo" syntax.
  // Valid expressions MUST use: `"foo"` -> "foo"
  //
  // Setting this flag to `true` enables support for legacy syntax.
  //
  enable_legacy_literals?: boolean;
}
