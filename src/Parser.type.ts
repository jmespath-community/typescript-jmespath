import { ExpressionReference } from './AST.type';
import { JSONValue } from './JSON.type';
import { LexerOptions } from './Lexer.type';

export type Options = LexerOptions;
export type ScopeItem = JSONValue | ExpressionReference;
export type ScopeEntry = { [member: string]: ScopeItem };
