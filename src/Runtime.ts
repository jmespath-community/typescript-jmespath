import type { ExpressionNode } from './AST.type';
import type {
  JSONArray,
  JSONArrayArray,
  JSONArrayKeyValuePairs,
  JSONArrayObject,
  JSONObject,
  JSONValue,
  ObjectDict,
} from './JSON.type';
import type { TreeInterpreter } from './TreeInterpreter';
import {
  findFirst,
  findLast,
  lower,
  padLeft,
  padRight,
  replace,
  split,
  trim,
  trimLeft,
  trimRight,
  upper,
} from './utils/strings';
import { Text } from './utils/text';

export enum InputArgument {
  TYPE_NUMBER = 0,
  TYPE_ANY = 1,
  TYPE_STRING = 2,
  TYPE_ARRAY = 3,
  TYPE_OBJECT = 4,
  TYPE_BOOLEAN = 5,
  TYPE_EXPREF = 6,
  TYPE_NULL = 7,
  TYPE_ARRAY_NUMBER = 8,
  TYPE_ARRAY_STRING = 9,
  TYPE_ARRAY_OBJECT = 10,
  TYPE_ARRAY_ARRAY = 11,
}

export interface InputSignature {
  types: InputArgument[];
  variadic?: boolean;
  optional?: boolean;
}

export type RuntimeFunction<T extends ReadonlyArray<JSONValue | ExpressionNode>, U> = (resolvedArgs: T) => U;

export interface FunctionSignature {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  // biome-ignore lint: lint/suspicious/noExplicitAny
  _func: RuntimeFunction<any, JSONValue>;
  _signature: InputSignature[];
}

export interface FunctionTable {
  [functionName: string]: FunctionSignature;
}

// Built-in function names for TypeScript 5.x template literal type checking
export type BuiltInFunctionNames =
  | 'abs'
  | 'avg'
  | 'ceil'
  | 'contains'
  | 'ends_with'
  | 'find_first'
  | 'find_last'
  | 'floor'
  | 'from_items'
  | 'group_by'
  | 'items'
  | 'join'
  | 'keys'
  | 'length'
  | 'lower'
  | 'map'
  | 'max'
  | 'max_by'
  | 'merge'
  | 'min'
  | 'min_by'
  | 'not_null'
  | 'pad_left'
  | 'pad_right'
  | 'replace'
  | 'reverse'
  | 'sort'
  | 'sort_by'
  | 'split'
  | 'starts_with'
  | 'sum'
  | 'to_array'
  | 'to_number'
  | 'to_string'
  | 'type'
  | 'upper'
  | 'values'
  | 'zip';

// Registration options for enhanced registerFunction behavior
export interface RegisterOptions {
  /**
   * Allow overriding existing functions. Default: false
   * When true, replaces existing function without error
   * When false, throws error if function already exists (backward compatible)
   */
  override?: boolean;
  /**
   * Emit warning when overriding existing functions. Default: false
   * Only applies when override is true
   */
  warn?: boolean;
}

// Registration result for better error handling and introspection
export type RegistrationResult =
  | { success: true; message?: string }
  | { success: false; reason: 'already-exists' | 'invalid-signature' | 'invalid-name'; message: string };

// Enhanced function registry interface for state management
export interface FunctionRegistry {
  /**
   * Register a new function with optional override behavior
   */
  register<T extends string>(
    name: T extends BuiltInFunctionNames ? never : T,
    func: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
    signature: InputSignature[],
    options?: RegisterOptions,
  ): RegistrationResult;

  /**
   * Unregister a custom function (built-in functions cannot be unregistered)
   */
  unregister<T extends string>(name: T extends BuiltInFunctionNames ? never : T): boolean;

  /**
   * Check if a function is registered
   */
  isRegistered(name: string): boolean;

  /**
   * Get list of all registered function names
   */
  getRegistered(): string[];

  /**
   * Get list of custom (non-built-in) function names
   */
  getCustomFunctions(): string[];

  /**
   * Clear all custom functions (built-in functions remain)
   */
  clearCustomFunctions(): void;
}

// Factory functions for common function patterns
const createMathFunction =
  (mathFn: (n: number) => number): RuntimeFunction<[number], number> =>
  ([value]) =>
    mathFn(value);

const createStringFunction =
  (stringFn: (s: string) => string): RuntimeFunction<[string], string> =>
  ([subject]) =>
    stringFn(subject);

const createObjectFunction =
  <T>(objFn: (obj: JSONObject) => T): RuntimeFunction<[JSONObject], T> =>
  ([obj]) =>
    objFn(obj);

export class Runtime implements FunctionRegistry {
  _interpreter: TreeInterpreter;
  _functionTable: FunctionTable;
  private _customFunctions: Set<string> = new Set();
  TYPE_NAME_TABLE = Object.freeze({
    [InputArgument.TYPE_NUMBER]: 'number',
    [InputArgument.TYPE_ANY]: 'any',
    [InputArgument.TYPE_STRING]: 'string',
    [InputArgument.TYPE_ARRAY]: 'array',
    [InputArgument.TYPE_OBJECT]: 'object',
    [InputArgument.TYPE_BOOLEAN]: 'boolean',
    [InputArgument.TYPE_EXPREF]: 'expression',
    [InputArgument.TYPE_NULL]: 'null',
    [InputArgument.TYPE_ARRAY_NUMBER]: 'Array<number>',
    [InputArgument.TYPE_ARRAY_OBJECT]: 'Array<object>',
    [InputArgument.TYPE_ARRAY_STRING]: 'Array<string>',
    [InputArgument.TYPE_ARRAY_ARRAY]: 'Array<Array<any>>',
  } as const);

  constructor(interpreter: TreeInterpreter) {
    this._interpreter = interpreter;
    this._functionTable = this.buildFunctionTable();
  }

  private buildFunctionTable(): FunctionTable {
    return {
      // Math functions
      abs: { _func: createMathFunction(Math.abs), _signature: [{ types: [InputArgument.TYPE_NUMBER] }] },
      ceil: { _func: createMathFunction(Math.ceil), _signature: [{ types: [InputArgument.TYPE_NUMBER] }] },
      floor: { _func: createMathFunction(Math.floor), _signature: [{ types: [InputArgument.TYPE_NUMBER] }] },

      // String functions
      lower: { _func: createStringFunction(lower), _signature: [{ types: [InputArgument.TYPE_STRING] }] },
      upper: { _func: createStringFunction(upper), _signature: [{ types: [InputArgument.TYPE_STRING] }] },

      // Object functions
      keys: { _func: createObjectFunction(Object.keys), _signature: [{ types: [InputArgument.TYPE_OBJECT] }] },
      values: { _func: createObjectFunction(Object.values), _signature: [{ types: [InputArgument.TYPE_OBJECT] }] },

      // Complex functions that need custom implementations
      avg: { _func: this.functionAvg, _signature: [{ types: [InputArgument.TYPE_ARRAY_NUMBER] }] },
      contains: {
        _func: this.functionContains,
        _signature: [
          { types: [InputArgument.TYPE_STRING, InputArgument.TYPE_ARRAY] },
          { types: [InputArgument.TYPE_ANY] },
        ],
      },
      ends_with: {
        _func: this.functionEndsWith,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_STRING] }],
      },
      find_first: {
        _func: this.functionFindFirst,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
        ],
      },
      find_last: {
        _func: this.functionFindLast,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
        ],
      },
      from_items: { _func: this.functionFromItems, _signature: [{ types: [InputArgument.TYPE_ARRAY_ARRAY] }] },
      group_by: {
        _func: this.functionGroupBy,
        _signature: [{ types: [InputArgument.TYPE_ARRAY] }, { types: [InputArgument.TYPE_EXPREF] }],
      },
      items: { _func: this.functionItems, _signature: [{ types: [InputArgument.TYPE_OBJECT] }] },
      join: {
        _func: this.functionJoin,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_ARRAY_STRING] }],
      },
      length: {
        _func: this.functionLength,
        _signature: [{ types: [InputArgument.TYPE_STRING, InputArgument.TYPE_ARRAY, InputArgument.TYPE_OBJECT] }],
      },
      map: {
        _func: this.functionMap,
        _signature: [{ types: [InputArgument.TYPE_EXPREF] }, { types: [InputArgument.TYPE_ARRAY] }],
      },
      max: {
        _func: this.functionMax,
        _signature: [{ types: [InputArgument.TYPE_ARRAY_NUMBER, InputArgument.TYPE_ARRAY_STRING] }],
      },
      max_by: {
        _func: this.functionMaxBy,
        _signature: [{ types: [InputArgument.TYPE_ARRAY] }, { types: [InputArgument.TYPE_EXPREF] }],
      },
      merge: { _func: this.functionMerge, _signature: [{ types: [InputArgument.TYPE_OBJECT], variadic: true }] },
      min: {
        _func: this.functionMin,
        _signature: [{ types: [InputArgument.TYPE_ARRAY_NUMBER, InputArgument.TYPE_ARRAY_STRING] }],
      },
      min_by: {
        _func: this.functionMinBy,
        _signature: [{ types: [InputArgument.TYPE_ARRAY] }, { types: [InputArgument.TYPE_EXPREF] }],
      },
      not_null: { _func: this.functionNotNull, _signature: [{ types: [InputArgument.TYPE_ANY], variadic: true }] },
      pad_left: {
        _func: this.functionPadLeft,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER] },
          { types: [InputArgument.TYPE_STRING], optional: true },
        ],
      },
      pad_right: {
        _func: this.functionPadRight,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER] },
          { types: [InputArgument.TYPE_STRING], optional: true },
        ],
      },
      replace: {
        _func: this.functionReplace,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
        ],
      },
      reverse: {
        _func: this.functionReverse,
        _signature: [{ types: [InputArgument.TYPE_STRING, InputArgument.TYPE_ARRAY] }],
      },
      sort: {
        _func: this.functionSort,
        _signature: [{ types: [InputArgument.TYPE_ARRAY_STRING, InputArgument.TYPE_ARRAY_NUMBER] }],
      },
      sort_by: {
        _func: this.functionSortBy,
        _signature: [{ types: [InputArgument.TYPE_ARRAY] }, { types: [InputArgument.TYPE_EXPREF] }],
      },
      split: {
        _func: this.functionSplit,
        _signature: [
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_STRING] },
          { types: [InputArgument.TYPE_NUMBER], optional: true },
        ],
      },
      starts_with: {
        _func: this.functionStartsWith,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_STRING] }],
      },
      sum: { _func: this.functionSum, _signature: [{ types: [InputArgument.TYPE_ARRAY_NUMBER] }] },
      to_array: { _func: this.functionToArray, _signature: [{ types: [InputArgument.TYPE_ANY] }] },
      to_number: { _func: this.functionToNumber, _signature: [{ types: [InputArgument.TYPE_ANY] }] },
      to_string: { _func: this.functionToString, _signature: [{ types: [InputArgument.TYPE_ANY] }] },
      trim: {
        _func: this.functionTrim,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_STRING], optional: true }],
      },
      trim_left: {
        _func: this.functionTrimLeft,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_STRING], optional: true }],
      },
      trim_right: {
        _func: this.functionTrimRight,
        _signature: [{ types: [InputArgument.TYPE_STRING] }, { types: [InputArgument.TYPE_STRING], optional: true }],
      },
      type: { _func: this.functionType, _signature: [{ types: [InputArgument.TYPE_ANY] }] },
      zip: { _func: this.functionZip, _signature: [{ types: [InputArgument.TYPE_ARRAY], variadic: true }] },
    };
  }

  /**
   * Enhanced registerFunction with backward compatibility and new options
   * @deprecated Use register() method for enhanced functionality
   */
  registerFunction(
    name: string,
    customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
    signature: InputSignature[],
    options?: RegisterOptions,
  ): void {
    // For backward compatibility, we bypass the type checking here
    // The register method will still validate the function name at runtime
    const result = this._registerInternal(name, customFunction, signature, options);
    if (!result.success) {
      throw new Error(result.message);
    }
  }

  /**
   * Internal registration method that bypasses TypeScript type checking
   */
  private _registerInternal(
    name: string,
    customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
    signature: InputSignature[],
    options: RegisterOptions = {},
  ): RegistrationResult {
    // Validate function name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return {
        success: false,
        reason: 'invalid-name',
        message: 'Function name must be a non-empty string',
      };
    }

    // Validate signature
    try {
      this.validateInputSignatures(name, signature);
    } catch (error) {
      return {
        success: false,
        reason: 'invalid-signature',
        message: error instanceof Error ? error.message : 'Invalid function signature',
      };
    }

    const { override = false, warn = false } = options;
    const exists = name in this._functionTable;

    // Handle existing function
    if (exists && !override) {
      return {
        success: false,
        reason: 'already-exists',
        message: `Function already defined: ${name}(). Use { override: true } to replace it.`,
      };
    }

    // Emit warning if requested
    if (exists && override && warn) {
      console.warn(`Warning: Overriding existing function: ${name}()`);
    }

    // Register the function
    this._functionTable[name] = {
      _func: customFunction.bind(this),
      _signature: signature,
    };

    // Track custom functions (exclude built-ins)
    this._customFunctions.add(name);

    const message = exists
      ? `Function ${name}() overridden successfully`
      : `Function ${name}() registered successfully`;
    return { success: true, message };
  }

  /**
   * Register a new function with enhanced options and type safety
   */
  register<T extends string>(
    name: T extends BuiltInFunctionNames ? never : T,
    customFunction: RuntimeFunction<(JSONValue | ExpressionNode)[], JSONValue>,
    signature: InputSignature[],
    options: RegisterOptions = {},
  ): RegistrationResult {
    return this._registerInternal(name, customFunction, signature, options);
  }

  /**
   * Unregister a custom function (built-in functions cannot be unregistered)
   */
  unregister<T extends string>(name: T extends BuiltInFunctionNames ? never : T): boolean {
    if (!this._customFunctions.has(name)) {
      return false; // Function doesn't exist or is built-in
    }

    delete this._functionTable[name];
    this._customFunctions.delete(name);
    return true;
  }

  /**
   * Check if a function is registered
   */
  isRegistered(name: string): boolean {
    return name in this._functionTable;
  }

  /**
   * Get list of all registered function names
   */
  getRegistered(): string[] {
    return Object.keys(this._functionTable);
  }

  /**
   * Get list of custom (non-built-in) function names
   */
  getCustomFunctions(): string[] {
    return Array.from(this._customFunctions);
  }

  /**
   * Clear all custom functions (built-in functions remain)
   */
  clearCustomFunctions(): void {
    for (const name of this._customFunctions) {
      delete this._functionTable[name];
    }
    this._customFunctions.clear();
  }

  callFunction(name: string, resolvedArgs: (JSONValue | ExpressionNode)[]): JSONValue {
    const functionEntry = this._functionTable[name];
    if (functionEntry === undefined) {
      throw new Error(`Unknown function: ${name}()`);
    }
    this.validateArgs(name, resolvedArgs, functionEntry._signature);
    return functionEntry._func.call(this, resolvedArgs);
  }

  private validateInputSignatures(name: string, signature: InputSignature[]): void {
    for (let i = 0; i < signature.length; i += 1) {
      if ('variadic' in signature[i] && i !== signature.length - 1) {
        throw new Error(`Invalid arity: ${name}() 'variadic' argument ${i + 1} must occur last`);
      }
    }
  }

  private validateArgs(name: string, args: (JSONValue | ExpressionNode)[], signature: InputSignature[]): void {
    this.validateInputSignatures(name, signature);
    this.validateArity(name, args, signature);
    this.validateTypes(name, args, signature);
  }

  private validateArity(name: string, args: (JSONValue | ExpressionNode)[], signature: InputSignature[]): void {
    const numberOfRequiredArgs = signature.filter(argSignature => !(argSignature.optional ?? false)).length;
    const lastArgIsVariadic = signature[signature.length - 1]?.variadic ?? false;
    const tooFewArgs = args.length < numberOfRequiredArgs;
    const tooManyArgs = args.length > signature.length;

    if ((lastArgIsVariadic && tooFewArgs) || (!lastArgIsVariadic && (tooFewArgs || tooManyArgs))) {
      const tooFewModifier =
        tooFewArgs && ((!lastArgIsVariadic && numberOfRequiredArgs > 1) || lastArgIsVariadic) ? 'at least ' : '';
      const pluralized = signature.length > 1;
      throw new Error(
        `Invalid arity: ${name}() takes ${tooFewModifier}${numberOfRequiredArgs} argument${
          (pluralized && 's') || ''
        } but received ${args.length}`,
      );
    }
  }

  private validateTypes(name: string, args: (JSONValue | ExpressionNode)[], signature: InputSignature[]): void {
    for (let i = 0; i < signature.length; i += 1) {
      const currentSpec = signature[i].types;
      const actualType = this.getTypeName(args[i]) as InputArgument;

      if (actualType === undefined) {
        continue;
      }

      const typeMatched = currentSpec.some(expectedType => this.typeMatches(actualType, expectedType, args[i]));

      if (!typeMatched) {
        const expected = currentSpec.map(typeId => this.TYPE_NAME_TABLE[typeId]).join(' | ');
        throw new Error(
          `Invalid type: ${name}() expected argument ${i + 1} to be type (${expected}) but received type ${
            this.TYPE_NAME_TABLE[actualType]
          } instead.`,
        );
      }
    }
  }

  private typeMatches(actual: InputArgument, expected: InputArgument, argValue: unknown): boolean {
    if (expected === InputArgument.TYPE_ANY) {
      return true;
    }
    if (
      expected === InputArgument.TYPE_ARRAY_STRING ||
      expected === InputArgument.TYPE_ARRAY_NUMBER ||
      expected === InputArgument.TYPE_ARRAY_OBJECT ||
      expected === InputArgument.TYPE_ARRAY_ARRAY ||
      expected === InputArgument.TYPE_ARRAY
    ) {
      if (expected === InputArgument.TYPE_ARRAY) {
        return actual === InputArgument.TYPE_ARRAY;
      }
      if (actual === InputArgument.TYPE_ARRAY) {
        let subtype;
        if (expected === InputArgument.TYPE_ARRAY_NUMBER) {
          subtype = InputArgument.TYPE_NUMBER;
        } else if (expected === InputArgument.TYPE_ARRAY_OBJECT) {
          subtype = InputArgument.TYPE_OBJECT;
        } else if (expected === InputArgument.TYPE_ARRAY_STRING) {
          subtype = InputArgument.TYPE_STRING;
        } else if (expected === InputArgument.TYPE_ARRAY_ARRAY) {
          subtype = InputArgument.TYPE_ARRAY;
        }
        const array = <JSONValue[]>argValue;
        for (let i = 0; i < array.length; i += 1) {
          const typeName = this.getTypeName(array[i]);
          if (typeName !== undefined && subtype !== undefined && !this.typeMatches(typeName, subtype, array[i])) {
            return false;
          }
        }
        return true;
      }
    } else {
      return actual === expected;
    }
    return false;
  }
  private getTypeName(obj: JSONValue | ExpressionNode): InputArgument | undefined {
    if (obj === null) {
      return InputArgument.TYPE_NULL;
    }
    if (typeof obj === 'string') {
      return InputArgument.TYPE_STRING;
    }
    if (typeof obj === 'number') {
      return InputArgument.TYPE_NUMBER;
    }
    if (typeof obj === 'boolean') {
      return InputArgument.TYPE_BOOLEAN;
    }
    if (Array.isArray(obj)) {
      return InputArgument.TYPE_ARRAY;
    }
    if (typeof obj === 'object') {
      if ((obj as ObjectDict).expref) {
        return InputArgument.TYPE_EXPREF;
      }
      return InputArgument.TYPE_OBJECT;
    }
    return;
  }

  createKeyFunction(exprefNode: ExpressionNode, allowedTypes: InputArgument[]): (x: JSONValue) => JSONValue {
    const interpreter = this._interpreter;
    const keyFunc = (x: JSONValue): JSONValue => {
      const current = interpreter.visit(exprefNode, x) as JSONValue;
      if (!allowedTypes.includes(this.getTypeName(current) as InputArgument)) {
        const msg = `Invalid type: expected one of (${allowedTypes
          .map(t => this.TYPE_NAME_TABLE[t])
          .join(' | ')}), received ${this.TYPE_NAME_TABLE[this.getTypeName(current) as InputArgument]}`;
        throw new Error(msg);
      }
      return current;
    };
    return keyFunc;
  }

  private functionAvg: RuntimeFunction<[number[]], number | null> = ([inputArray]) => {
    if (!inputArray || inputArray.length == 0) {
      return null;
    }

    let sum = 0;
    for (let i = 0; i < inputArray.length; i += 1) {
      sum += inputArray[i];
    }
    return sum / inputArray.length;
  };

  private functionContains: RuntimeFunction<[string[] | JSONArray, JSONValue], JSONValue> = ([
    searchable,
    searchValue,
  ]) => {
    if (Array.isArray(searchable)) {
      const array = <JSONArray>searchable;
      return array.includes(searchValue);
    }

    if (typeof searchable === 'string') {
      const text = <string>searchable;
      if (typeof searchValue === 'string') {
        return text.includes(searchValue);
      }
    }

    return null;
  };

  private functionEndsWith: RuntimeFunction<[string, string], boolean> = resolvedArgs => {
    const [searchStr, suffix] = resolvedArgs;
    return searchStr.includes(suffix, searchStr.length - suffix.length);
  };

  private functionFindFirst = this.createFindFunction(findFirst);
  private functionFindLast = this.createFindFunction(findLast);

  private createFindFunction(
    findFn: (subject: string, search: string, start?: number, end?: number) => number | null,
  ): RuntimeFunction<JSONValue[], number | null> {
    return resolvedArgs => {
      const subject = resolvedArgs[0] as string;
      const search = resolvedArgs[1] as string;
      const start = resolvedArgs.length > 2 ? (resolvedArgs[2] as number) : undefined;
      const end = resolvedArgs.length > 3 ? (resolvedArgs[3] as number) : undefined;
      return findFn(subject, search, start, end);
    };
  }

  private functionFromItems: RuntimeFunction<[JSONArrayKeyValuePairs], JSONObject> = ([array]) => {
    array.map((pair: [string, JSONValue]) => {
      if (pair.length != 2 || typeof pair[0] !== 'string') {
        throw new Error('invalid value, each array must contain two elements, a pair of string and value');
      }
    });
    return Object.fromEntries(array);
  };

  private functionGroupBy: RuntimeFunction<[JSONArrayObject, ExpressionNode], JSONValue> = ([array, exprefNode]) => {
    const keyFunction = this.createKeyFunction(exprefNode, [InputArgument.TYPE_STRING]);
    const groups: Record<string, JSONValue[]> = {};
    for (const item of array) {
      const key = keyFunction(item) as string;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
    }
    return groups;
  };

  private functionItems: RuntimeFunction<[JSONObject], JSONArray> = ([inputValue]) => {
    return Object.entries(inputValue);
  };

  private functionJoin: RuntimeFunction<[string, string[]], string> = resolvedArgs => {
    const [joinChar, listJoin] = resolvedArgs;
    return listJoin.join(joinChar);
  };

  private functionLength: RuntimeFunction<[string | JSONArray | JSONObject], number> = ([inputValue]) => {
    if (typeof inputValue === 'string') {
      return new Text(inputValue).length;
    }
    if (Array.isArray(inputValue)) {
      return inputValue.length;
    }
    return Object.keys(inputValue).length;
  };

  private functionMap: RuntimeFunction<[ExpressionNode, JSONArray], JSONArray> = ([exprefNode, elements]) => {
    if (!this._interpreter) {
      return [];
    }
    const mapped: JSONValue[] = [];
    const interpreter = this._interpreter;
    for (let i = 0; i < elements.length; i += 1) {
      mapped.push(<JSONValue>interpreter.visit(exprefNode, elements[i]));
    }
    return mapped;
  };

  private functionMax: RuntimeFunction<[(string | number)[]], string | number | null> = ([inputValue]) => {
    if (!inputValue.length) {
      return null;
    }

    const typeName = this.getTypeName(inputValue[0]);
    if (typeName === InputArgument.TYPE_NUMBER) {
      return Math.max(...(inputValue as number[]));
    }

    const elements = inputValue as string[];
    let maxElement = elements[0];
    for (let i = 1; i < elements.length; i += 1) {
      if (maxElement.localeCompare(elements[i]) < 0) {
        maxElement = elements[i];
      }
    }
    return maxElement;
  };

  private functionMaxBy: RuntimeFunction<[number[] | string[], ExpressionNode], JSONValue> = resolvedArgs => {
    const exprefNode = resolvedArgs[1];
    const resolvedArray = resolvedArgs[0];
    const keyFunction = this.createKeyFunction(exprefNode, [InputArgument.TYPE_NUMBER, InputArgument.TYPE_STRING]);
    let maxNumber = -Infinity;
    let maxRecord!: JSONValue;
    let current: number | undefined;
    for (let i = 0; i < resolvedArray.length; i += 1) {
      current = keyFunction && (keyFunction(resolvedArray[i]) as number);
      if (current !== undefined && current > maxNumber) {
        maxNumber = current;
        maxRecord = resolvedArray[i];
      }
    }
    return maxRecord || null;
  };

  private functionMerge: RuntimeFunction<JSONObject[], JSONObject> = resolvedArgs => {
    let merged = {};
    for (let i = 0; i < resolvedArgs.length; i += 1) {
      const current = resolvedArgs[i];
      merged = Object.assign(merged, current);
    }
    return merged;
  };

  private functionMin: RuntimeFunction<[(string | number)[]], string | number | null> = ([inputValue]) => {
    if (!inputValue.length) {
      return null;
    }

    const typeName = this.getTypeName(inputValue[0]);
    if (typeName === InputArgument.TYPE_NUMBER) {
      return Math.min(...(inputValue as number[]));
    }

    const elements = inputValue as string[];
    let minElement = elements[0];
    for (let i = 1; i < elements.length; i += 1) {
      if (elements[i].localeCompare(minElement) < 0) {
        minElement = elements[i];
      }
    }
    return minElement;
  };

  private functionMinBy: RuntimeFunction<[number[] | string[], ExpressionNode], JSONValue> = resolvedArgs => {
    const exprefNode = resolvedArgs[1];
    const resolvedArray = resolvedArgs[0];
    const keyFunction = this.createKeyFunction(exprefNode, [InputArgument.TYPE_NUMBER, InputArgument.TYPE_STRING]);
    let minNumber = Infinity;
    let minRecord!: JSONValue;
    let current: number | undefined;
    for (let i = 0; i < resolvedArray.length; i += 1) {
      current = keyFunction && (keyFunction(resolvedArray[i]) as number);
      if (current !== undefined && current < minNumber) {
        minNumber = current;
        minRecord = resolvedArray[i];
      }
    }
    return minRecord || null;
  };

  private functionNotNull: RuntimeFunction<JSONArray, JSONValue> = resolvedArgs => {
    for (let i = 0; i < resolvedArgs.length; i += 1) {
      if (this.getTypeName(resolvedArgs[i]) !== InputArgument.TYPE_NULL) {
        return resolvedArgs[i];
      }
    }
    return null;
  };

  private functionPadLeft = this.createPadFunction(padLeft);
  private functionPadRight = this.createPadFunction(padRight);

  private createPadFunction(
    padFn: (subject: string, width: number, padding?: string) => string,
  ): RuntimeFunction<JSONValue[], string> {
    return resolvedArgs => {
      const subject = resolvedArgs[0] as string;
      const width = resolvedArgs[1] as number;
      const padding = resolvedArgs.length > 2 ? (resolvedArgs[2] as string) : undefined;
      return padFn(subject, width, padding);
    };
  }

  private functionReplace: RuntimeFunction<JSONValue[], string> = resolvedArgs => {
    const subject = <string>resolvedArgs[0];
    const string = <string>resolvedArgs[1];
    const by = <string>resolvedArgs[2];
    return replace(subject, string, by, resolvedArgs.length > 3 ? <number>resolvedArgs[3] : undefined);
  };

  private functionSplit: RuntimeFunction<JSONValue[], string[]> = resolvedArgs => {
    const subject = <string>resolvedArgs[0];
    const search = <string>resolvedArgs[1];
    return split(subject, search, resolvedArgs.length > 2 ? <number>resolvedArgs[2] : undefined);
  };

  private functionReverse: RuntimeFunction<[string | JSONArray], string | JSONArray> = ([inputValue]) => {
    const typeName = this.getTypeName(inputValue);
    if (typeName === InputArgument.TYPE_STRING) {
      return new Text(inputValue as string).reverse();
    }
    const reversedArray = [...(inputValue as JSONArray)];
    reversedArray.reverse();
    return reversedArray;
  };

  private functionSort: RuntimeFunction<[(string | number)[]], (string | number)[]> = ([inputValue]) => {
    if (inputValue.length == 0) {
      return inputValue;
    }
    if (typeof inputValue[0] === 'string') {
      return (<string[]>[...inputValue]).sort(Text.comparer);
    }
    return [...inputValue].sort();
  };

  private functionSortBy: RuntimeFunction<[number[] | string[], ExpressionNode], JSONValue> = resolvedArgs => {
    const sortedArray = [...resolvedArgs[0]];
    if (sortedArray.length === 0) {
      return sortedArray;
    }
    const interpreter = this._interpreter;
    const exprefNode = resolvedArgs[1];
    const requiredType = this.getTypeName(interpreter.visit(exprefNode, sortedArray[0]) as JSONValue);
    if (requiredType !== undefined && ![InputArgument.TYPE_NUMBER, InputArgument.TYPE_STRING].includes(requiredType)) {
      throw new Error(`Invalid type: unexpected type (${this.TYPE_NAME_TABLE[requiredType]})`);
    }
    function throwInvalidTypeError(rt: Runtime, item: string | number): never {
      throw new Error(
        `Invalid type: expected (${rt.TYPE_NAME_TABLE[requiredType as InputArgument]}), received ${
          rt.TYPE_NAME_TABLE[rt.getTypeName(item) as InputArgument]
        }`,
      );
    }

    return sortedArray.sort((a, b) => {
      const exprA = interpreter.visit(exprefNode, a) as number | string;
      const exprB = interpreter.visit(exprefNode, b) as number | string;
      if (this.getTypeName(exprA) !== requiredType) {
        throwInvalidTypeError(this, exprA);
      } else if (this.getTypeName(exprB) !== requiredType) {
        throwInvalidTypeError(this, exprB);
      }
      if (requiredType === InputArgument.TYPE_STRING) {
        return Text.comparer(<string>exprA, <string>exprB);
      }
      return <number>exprA - <number>exprB;
    });
  };

  private functionStartsWith: RuntimeFunction<[string, string], boolean> = ([searchable, searchStr]) => {
    return searchable.startsWith(searchStr);
  };

  private functionSum: RuntimeFunction<[number[]], number> = ([inputValue]) => {
    return inputValue.reduce((x, y) => x + y, 0);
  };

  private functionToArray: RuntimeFunction<[JSONValue], JSONArray> = ([inputValue]) => {
    if (this.getTypeName(inputValue) === InputArgument.TYPE_ARRAY) {
      return inputValue as JSONArray;
    }
    return [inputValue];
  };

  private functionToNumber: RuntimeFunction<[JSONValue], number | null> = ([inputValue]) => {
    const typeName = this.getTypeName(inputValue);
    let convertedValue: number;
    if (typeName === InputArgument.TYPE_NUMBER) {
      return inputValue as number;
    }
    if (typeName === InputArgument.TYPE_STRING) {
      convertedValue = +(inputValue as string);
      if (!isNaN(convertedValue)) {
        return convertedValue;
      }
    }
    return null;
  };

  private functionToString: RuntimeFunction<[JSONValue], string> = ([inputValue]) => {
    if (this.getTypeName(inputValue) === InputArgument.TYPE_STRING) {
      return inputValue as string;
    }
    return JSON.stringify(inputValue);
  };

  private functionTrim = this.createTrimFunction(trim);
  private functionTrimLeft = this.createTrimFunction(trimLeft);
  private functionTrimRight = this.createTrimFunction(trimRight);

  private createTrimFunction(
    trimFn: (subject: string, chars?: string) => string,
  ): RuntimeFunction<JSONValue[], string> {
    return resolvedArgs => {
      const subject = resolvedArgs[0] as string;
      const chars = resolvedArgs.length > 1 ? (resolvedArgs[1] as string) : undefined;
      return trimFn(subject, chars);
    };
  }

  private functionType: RuntimeFunction<[JSONValue], string> = ([inputValue]) => {
    switch (this.getTypeName(inputValue)) {
      case InputArgument.TYPE_NUMBER:
        return 'number';
      case InputArgument.TYPE_STRING:
        return 'string';
      case InputArgument.TYPE_ARRAY:
        return 'array';
      case InputArgument.TYPE_OBJECT:
        return 'object';
      case InputArgument.TYPE_BOOLEAN:
        return 'boolean';
      case InputArgument.TYPE_NULL:
        return 'null';
      default:
        throw new Error('invalid-type');
    }
  };

  private functionZip: RuntimeFunction<JSONArrayArray, JSONArray> = array => {
    const length = Math.min(...array.map(arr => arr.length));
    const result = Array(length)
      .fill(null)
      .map((_, index) => array.map(arr => arr[index]));
    return result as unknown as JSONArray;
  };
}
