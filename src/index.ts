import { ExpressionNode } from './AST.type';
import { compileFastEvaluator } from './FastEvaluator';
import { JSONValue } from './JSON.type';
import Lexer from './Lexer';
import { LexerOptions, LexerToken } from './Lexer.type';
import Parser, { DEFAULT_MAX_DEPTH } from './Parser';
import { Options } from './Parser.type';
import type { PathValue } from './Path.type';
import {
  BuiltInFunctionNames,
  InputArgument,
  InputSignature,
  RegisterOptions,
  RegistrationResult,
  RuntimeFunction,
} from './Runtime';
import { ScopeChain } from './Scope';
import TreeInterpreterInst from './TreeInterpreter';
import { findDisallowedFunction } from './utils';

export type { JSONArray, JSONObject, JSONPrimitive, JSONValue } from './JSON.type';
export type { Options } from './Parser.type';
export type { PathValue } from './Path.type';

export interface ValidationResult {
  valid: boolean;
  error?: string;
  ast?: ExpressionNode;
}

import { type StreamOptions, type StreamSource, searchStream } from './Stream';

export type { StreamOptions, StreamSource };

export interface CompiledQuery<T = JSONValue, D = unknown> {
  (data: D): T;
  search: (data: D) => T;
  searchStream: (source: StreamSource<D>, options?: StreamOptions) => AsyncGenerator<T, void, unknown>;
  ast: ExpressionNode;
}
export type {
  BuiltInFunctionNames,
  FunctionRegistry,
  FunctionSignature,
  InputSignature,
  RegisterOptions,
  RegistrationResult,
  RuntimeFunction,
} from './Runtime';

const TYPE_ANY = InputArgument.TYPE_ANY;
const TYPE_ARRAY = InputArgument.TYPE_ARRAY;
const TYPE_ARRAY_ARRAY = InputArgument.TYPE_ARRAY_ARRAY;
const TYPE_ARRAY_NUMBER = InputArgument.TYPE_ARRAY_NUMBER;
const TYPE_ARRAY_OBJECT = InputArgument.TYPE_ARRAY_OBJECT;
const TYPE_ARRAY_STRING = InputArgument.TYPE_ARRAY_STRING;
const TYPE_BOOLEAN = InputArgument.TYPE_BOOLEAN;
const TYPE_EXPREF = InputArgument.TYPE_EXPREF;
const TYPE_NULL = InputArgument.TYPE_NULL;
const TYPE_NUMBER = InputArgument.TYPE_NUMBER;
const TYPE_OBJECT = InputArgument.TYPE_OBJECT;
const TYPE_STRING = InputArgument.TYPE_STRING;

function compile(expression: string, options?: Options): ExpressionNode {
  return Parser.parse(expression, options);
}

function compileQuery<T = JSONValue, D = unknown>(expression: string, options?: Options): CompiledQuery<T, D> {
  const nodeTree = Parser.parse(expression, options);
  const fastFn = compileFastEvaluator(nodeTree, options, TreeInterpreterInst.runtime);
  const evaluate = fastFn
    ? (data: D): T => fastFn(data as JSONValue) as T
    : (data: D): T => TreeInterpreterInst.search(nodeTree, data as JSONValue, options) as T;

  const fn = function (data: D): T {
    return evaluate(data);
  } as CompiledQuery<T, D>;
  fn.search = (data: D): T => evaluate(data);
  fn.searchStream = (source: StreamSource<D>, streamOptions?: StreamOptions) =>
    searchStream<T, D>(source, nodeTree, { ...options, ...streamOptions });
  fn.ast = nodeTree;
  return fn;
}

function validate(expression: string, options?: Options): ValidationResult {
  if (typeof expression !== 'string') {
    return { valid: false, error: 'Expression must be a string' };
  }
  try {
    const ast = Parser.parse(expression, options);
    if (options) {
      const fnError = findDisallowedFunction(ast, options);
      if (fnError) {
        return { valid: false, error: fnError };
      }
    }
    return { valid: true, ast };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function tokenize(expression: string, options?: LexerOptions): LexerToken[] {
  return Lexer.tokenize(expression, options);
}

// Enhanced registerFunction with backward compatibility
const registerFunction = (
  functionName: string,
  customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
  signature: InputSignature[],
  options?: RegisterOptions,
): void => {
  TreeInterpreterInst.runtime.registerFunction(functionName, customFunction, signature, options);
};

// Enhanced registry functions with type safety
const register = <T extends string>(
  name: T extends BuiltInFunctionNames ? never : T,
  customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
  signature: InputSignature[],
  options?: RegisterOptions,
): RegistrationResult => {
  return TreeInterpreterInst.runtime.register(name, customFunction, signature, options);
};

const unregisterFunction = <T extends string>(name: T extends BuiltInFunctionNames ? never : T): boolean => {
  return TreeInterpreterInst.runtime.unregister(name);
};

const isRegistered = (name: string): boolean => {
  return TreeInterpreterInst.runtime.isRegistered(name);
};

const getRegisteredFunctions = (): string[] => {
  return TreeInterpreterInst.runtime.getRegistered();
};

const getCustomFunctions = (): string[] => {
  return TreeInterpreterInst.runtime.getCustomFunctions();
};

const clearCustomFunctions = (): void => {
  TreeInterpreterInst.runtime.clearCustomFunctions();
};

interface AstCacheEntry {
  nodeTree: ExpressionNode;
  fastFn?: ((data: JSONValue) => JSONValue) | null;
}

const MAX_CACHE_SIZE = 1000;
const astCache = new Map<string, AstCacheEntry>();

function search<T, P extends string>(data: T, expression: P, options?: Options): PathValue<T, P>;
function search<T = JSONValue, D = unknown>(data: D, expression: string, options?: Options): T;
function search(data: unknown, expression: string, options?: Options): unknown {
  if (!options) {
    let entry = astCache.get(expression);
    if (!entry) {
      const nodeTree = Parser.parse(expression);
      const fastFn = compileFastEvaluator(nodeTree, undefined, TreeInterpreterInst.runtime);
      entry = { nodeTree, fastFn };
      if (astCache.size >= MAX_CACHE_SIZE) {
        const firstKey = astCache.keys().next().value;
        if (firstKey !== undefined) {
          astCache.delete(firstKey);
        }
      }
      astCache.set(expression, entry);
    }
    if (entry.fastFn) {
      return entry.fastFn(data as JSONValue);
    }
    return TreeInterpreterInst.search(entry.nodeTree, data as JSONValue);
  }
  const nodeTree = Parser.parse(expression, options);
  return TreeInterpreterInst.search(nodeTree, data as JSONValue, options);
}

function Scope(): ScopeChain {
  return new ScopeChain();
}

const TreeInterpreter = TreeInterpreterInst;

const jmespath = {
  compile,
  compileQuery,
  searchStream,
  validate,
  registerFunction,
  register,
  unregisterFunction,
  isRegistered,
  getRegisteredFunctions,
  getCustomFunctions,
  clearCustomFunctions,
  search,
  tokenize,
  TreeInterpreter,
  DEFAULT_MAX_DEPTH,
  TYPE_ANY,
  TYPE_ARRAY_NUMBER,
  TYPE_ARRAY_STRING,
  TYPE_ARRAY,
  TYPE_BOOLEAN,
  TYPE_EXPREF,
  TYPE_NULL,
  TYPE_NUMBER,
  TYPE_OBJECT,
  TYPE_STRING,
  TYPE_ARRAY_ARRAY,
  TYPE_ARRAY_OBJECT,
  Scope,
};

// Export as default for backward compatibility
// Supports both: import jmespath from '...' and import { search } from '...'
export {
  compile,
  compileQuery,
  searchStream,
  validate,
  registerFunction,
  register,
  unregisterFunction,
  isRegistered,
  getRegisteredFunctions,
  getCustomFunctions,
  clearCustomFunctions,
  search,
  tokenize,
  TreeInterpreter,
  DEFAULT_MAX_DEPTH,
  TYPE_ANY,
  TYPE_ARRAY_NUMBER,
  TYPE_ARRAY_STRING,
  TYPE_ARRAY,
  TYPE_BOOLEAN,
  TYPE_EXPREF,
  TYPE_NULL,
  TYPE_NUMBER,
  TYPE_OBJECT,
  TYPE_STRING,
  TYPE_ARRAY_ARRAY,
  TYPE_ARRAY_OBJECT,
  Scope,
  jmespath,
};
export default jmespath;
