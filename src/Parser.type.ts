import { JSONObject } from './JSON.type';
import { LexerOptions } from './Lexer.type';

export type ScopeEntry = JSONObject;

export interface Options extends LexerOptions {
  maxDepth?: number;
  allowedFunctions?: string[];
  disallowedFunctions?: string[];
  timeoutMs?: number;
}
