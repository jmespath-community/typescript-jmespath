import { ExpressionNode } from './AST.type';
import { JSONValue } from './JSON.type';
import Lexer from './Lexer';
import { LexerOptions, LexerToken } from './Lexer.type';
import Parser from './Parser';
import { Options } from './Parser.type';
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

export type { JSONArray, JSONObject, JSONPrimitive, JSONValue } from './JSON.type';
export type { Options } from './Parser.type';
export type {
  BuiltInFunctionNames,
  FunctionRegistry,
  FunctionSignature,
  InputSignature,
  RegisterOptions,
  RegistrationResult,
  RuntimeFunction,
} from './Runtime';

export const TYPE_ANY = InputArgument.TYPE_ANY;
export const TYPE_ARRAY = InputArgument.TYPE_ARRAY;
export const TYPE_ARRAY_ARRAY = InputArgument.TYPE_ARRAY_ARRAY;
export const TYPE_ARRAY_NUMBER = InputArgument.TYPE_ARRAY_NUMBER;
export const TYPE_ARRAY_OBJECT = InputArgument.TYPE_ARRAY_OBJECT;
export const TYPE_ARRAY_STRING = InputArgument.TYPE_ARRAY_STRING;
export const TYPE_BOOLEAN = InputArgument.TYPE_BOOLEAN;
export const TYPE_EXPREF = InputArgument.TYPE_EXPREF;
export const TYPE_NULL = InputArgument.TYPE_NULL;
export const TYPE_NUMBER = InputArgument.TYPE_NUMBER;
export const TYPE_OBJECT = InputArgument.TYPE_OBJECT;
export const TYPE_STRING = InputArgument.TYPE_STRING;

export function compile(expression: string, options?: Options): ExpressionNode {
  const nodeTree = Parser.parse(expression, options);
  return nodeTree;
}

export function tokenize(expression: string, options?: LexerOptions): LexerToken[] {
  return Lexer.tokenize(expression, options);
}

// Enhanced registerFunction with backward compatibility
export const registerFunction = (
  functionName: string,
  customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
  signature: InputSignature[],
  options?: RegisterOptions,
): void => {
  TreeInterpreterInst.runtime.registerFunction(functionName, customFunction, signature, options);
};

// Enhanced registry functions with type safety
export const register = <T extends string>(
  name: T extends BuiltInFunctionNames ? never : T,
  customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
  signature: InputSignature[],
  options?: RegisterOptions,
): RegistrationResult => {
  return TreeInterpreterInst.runtime.register(name, customFunction, signature, options);
};

export const unregisterFunction = <T extends string>(name: T extends BuiltInFunctionNames ? never : T): boolean => {
  return TreeInterpreterInst.runtime.unregister(name);
};

export const isRegistered = (name: string): boolean => {
  return TreeInterpreterInst.runtime.isRegistered(name);
};

export const getRegisteredFunctions = (): string[] => {
  return TreeInterpreterInst.runtime.getRegistered();
};

export const getCustomFunctions = (): string[] => {
  return TreeInterpreterInst.runtime.getCustomFunctions();
};

export const clearCustomFunctions = (): void => {
  TreeInterpreterInst.runtime.clearCustomFunctions();
};

export function search(data: JSONValue, expression: string, options?: Options): JSONValue {
  const nodeTree = Parser.parse(expression, options);
  return TreeInterpreterInst.search(nodeTree, data);
}

export function Scope(): ScopeChain {
  return new ScopeChain();
}

export const TreeInterpreter = TreeInterpreterInst;

export const jmespath = {
  compile,
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
};

// Export as default for backward compatibility
// Supports both: import jmespath from '...' and import { jmespath } from '...'
export { jmespath as default };
