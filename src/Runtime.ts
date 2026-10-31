import type { ExpressionNode } from './AST.type';
import type { JSONArray, JSONArrayArray, JSONArrayKeyValuePairs, JSONObject, JSONValue, ObjectDict } from './JSON.type';
import type { TreeInterpreter } from './TreeInterpreter';
import { findFirst, findLast, padLeft, padRight, replace, split, trim, trimLeft, trimRight } from './utils/strings';
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

const ARRAY_SUBTYPES: Partial<Record<InputArgument, InputArgument>> = {
  [InputArgument.TYPE_ARRAY_NUMBER]: InputArgument.TYPE_NUMBER,
  [InputArgument.TYPE_ARRAY_OBJECT]: InputArgument.TYPE_OBJECT,
  [InputArgument.TYPE_ARRAY_STRING]: InputArgument.TYPE_STRING,
  [InputArgument.TYPE_ARRAY_ARRAY]: InputArgument.TYPE_ARRAY,
};

const JSON_NUMBER_REGEX = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

const s = (...types: (InputArgument | InputArgument[])[]): InputSignature[] =>
  types.map(t => ({ types: Array.isArray(t) ? t : [t] }));
const opt = (...types: (InputArgument | InputArgument[])[]): InputSignature[] =>
  types.map(t => ({ types: Array.isArray(t) ? t : [t], optional: true }));
const variadic = (...types: (InputArgument | InputArgument[])[]): InputSignature[] =>
  types.map(t => ({ types: Array.isArray(t) ? t : [t], variadic: true }));
const optVariadic = (...types: (InputArgument | InputArgument[])[]): InputSignature[] =>
  types.map(t => ({ types: Array.isArray(t) ? t : [t], variadic: true, optional: true }));

const {
  TYPE_NUMBER: NUM,
  TYPE_ANY: ANY,
  TYPE_STRING: STR,
  TYPE_ARRAY: ARR,
  TYPE_OBJECT: OBJ,
  TYPE_EXPREF: EXP,
  TYPE_ARRAY_NUMBER: ARR_NUM,
  TYPE_ARRAY_STRING: ARR_STR,
  TYPE_ARRAY_ARRAY: ARR_ARR,
} = InputArgument;

export class Runtime implements FunctionRegistry {
  _interpreter: TreeInterpreter;
  _functionTable: FunctionTable;
  private _customFunctions: Set<string> = new Set();
  TYPE_NAME_TABLE = Object.freeze([
    'number',
    'any',
    'string',
    'array',
    'object',
    'boolean',
    'expression',
    'null',
    'Array<number>',
    'Array<string>',
    'Array<object>',
    'Array<Array<any>>',
  ] as const);

  constructor(interpreter: TreeInterpreter) {
    this._interpreter = interpreter;
    this._functionTable = this.buildFunctionTable();
  }

  private buildFunctionTable(): FunctionTable {
    return {
      abs: { _func: ([v]) => Math.abs(v as number), _signature: s(NUM) },
      ceil: { _func: ([v]) => Math.ceil(v as number), _signature: s(NUM) },
      floor: { _func: ([v]) => Math.floor(v as number), _signature: s(NUM) },
      lower: { _func: ([s]) => (s as string).toLowerCase(), _signature: s(STR) },
      upper: { _func: ([s]) => (s as string).toUpperCase(), _signature: s(STR) },
      keys: { _func: ([o]) => Object.keys(o as JSONObject), _signature: s(OBJ) },
      values: { _func: ([o]) => Object.values(o as JSONObject), _signature: s(OBJ) },
      avg: {
        _func: ([arr]) =>
          arr && (arr as number[]).length
            ? (arr as number[]).reduce((a, b) => a + b, 0) / (arr as number[]).length
            : null,
        _signature: s(ARR_NUM),
      },
      contains: { _func: this.functionContains, _signature: s([STR, ARR], ANY) },
      ends_with: { _func: ([str, suf]) => (str as string).endsWith(suf as string), _signature: s(STR, STR) },
      find_first: {
        _func: ([s, sub, st, en]) => findFirst(s as string, sub as string, st as number, en as number),
        _signature: [...s(STR, STR), ...opt(NUM, NUM)],
      },
      find_last: {
        _func: ([s, sub, st, en]) => findLast(s as string, sub as string, st as number, en as number),
        _signature: [...s(STR, STR), ...opt(NUM, NUM)],
      },
      from_items: { _func: this.functionFromItems, _signature: s(ARR_ARR) },
      group_by: { _func: this.functionGroupBy, _signature: s(ARR, EXP) },
      items: { _func: ([o]) => Object.entries(o as JSONObject), _signature: s(OBJ) },
      join: { _func: ([sep, arr]) => (arr as string[]).join(sep as string), _signature: s(STR, ARR_STR) },
      length: {
        _func: ([v]) =>
          typeof v === 'string' ? [...v].length : Array.isArray(v) ? v.length : Object.keys(v as JSONObject).length,
        _signature: s([STR, ARR, OBJ]),
      },
      map: { _func: this.functionMap, _signature: s(EXP, ARR) },
      max: {
        _func: ([v]) => this.findExtreme(v as (string | number)[], cmp => cmp > 0, Math.max),
        _signature: s([ARR_NUM, ARR_STR]),
      },
      max_by: {
        _func: args => this.findExtremeBy(args as [JSONArray, ExpressionNode], cmp => cmp > 0),
        _signature: s(ARR, EXP),
      },
      merge: { _func: args => Object.assign({}, ...args), _signature: optVariadic(OBJ) },
      min: {
        _func: ([v]) => this.findExtreme(v as (string | number)[], cmp => cmp < 0, Math.min),
        _signature: s([ARR_NUM, ARR_STR]),
      },
      min_by: {
        _func: args => this.findExtremeBy(args as [JSONArray, ExpressionNode], cmp => cmp < 0),
        _signature: s(ARR, EXP),
      },
      not_null: {
        _func: args => (args as JSONArray).find(arg => arg !== null) ?? null,
        _signature: variadic(ANY),
      },
      pad_left: {
        _func: ([s, w, p]) => padLeft(s as string, w as number, p as string),
        _signature: [...s(STR, NUM), ...opt(STR)],
      },
      pad_right: {
        _func: ([s, w, p]) => padRight(s as string, w as number, p as string),
        _signature: [...s(STR, NUM), ...opt(STR)],
      },
      replace: {
        _func: ([s, str, by, c]) => replace(s as string, str as string, by as string, c as number),
        _signature: [...s(STR, STR, STR), ...opt(NUM)],
      },
      reverse: {
        _func: ([v]) => (typeof v === 'string' ? [...v].reverse().join('') : [...(v as JSONArray)].reverse()),
        _signature: s([STR, ARR]),
      },
      sort: { _func: this.functionSort, _signature: s([ARR_STR, ARR_NUM]) },
      sort_by: { _func: this.functionSortBy, _signature: s(ARR, EXP) },
      split: {
        _func: ([s, sub, c]) => split(s as string, sub as string, c as number),
        _signature: [...s(STR, STR), ...opt(NUM)],
      },
      starts_with: { _func: ([str, pre]) => (str as string).startsWith(pre as string), _signature: s(STR, STR) },
      sum: { _func: ([arr]) => (arr as number[]).reduce((x, y) => x + y, 0), _signature: s(ARR_NUM) },
      to_array: { _func: ([v]) => (Array.isArray(v) ? v : [v]), _signature: s(ANY) },
      to_number: { _func: this.functionToNumber, _signature: s(ANY) },
      to_string: {
        _func: ([v]) => (typeof v === 'string' ? v : JSON.stringify(v)),
        _signature: s(ANY),
      },
      trim: {
        _func: ([s, c]) => trim(s as string, c as string),
        _signature: [...s(STR), ...opt(STR)],
      },
      trim_left: {
        _func: ([s, c]) => trimLeft(s as string, c as string),
        _signature: [...s(STR), ...opt(STR)],
      },
      trim_right: {
        _func: ([s, c]) => trimRight(s as string, c as string),
        _signature: [...s(STR), ...opt(STR)],
      },
      type: { _func: this.functionType, _signature: s(ANY) },
      zip: { _func: this.functionZip, _signature: variadic(ARR) },
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
    const lastSigIndex = signature.length - 1;
    const isVariadic = signature[lastSigIndex]?.variadic ?? false;

    for (let i = 0; i < args.length; i += 1) {
      const sig = i < signature.length ? signature[i] : isVariadic ? signature[lastSigIndex] : undefined;
      if (!sig) {
        continue;
      }
      const currentSpec = sig.types;
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
    const subtype = ARRAY_SUBTYPES[expected];
    if (subtype !== undefined) {
      if (actual !== InputArgument.TYPE_ARRAY) {
        return false;
      }
      const array = argValue as JSONValue[];
      return array.every(item => {
        const typeName = this.getTypeName(item);
        return typeName === undefined || this.typeMatches(typeName, subtype, item);
      });
    }
    return actual === expected;
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
      return false;
    }

    return null;
  };

  private functionFromItems: RuntimeFunction<[JSONArrayKeyValuePairs], JSONObject> = ([array]) => {
    for (const pair of array) {
      if (pair.length !== 2 || typeof pair[0] !== 'string') {
        throw new Error('invalid value, each array must contain two elements, a pair of string and value');
      }
    }
    return Object.fromEntries(array);
  };

  private functionGroupBy: RuntimeFunction<[JSONArray, ExpressionNode], JSONValue> = ([array, exprefNode]) => {
    const interpreter = this._interpreter;
    if (!interpreter) {
      return {};
    }
    const groups = new Map<string, JSONValue[]>();
    for (const item of array) {
      const raw = interpreter.visit(exprefNode, item) as JSONValue;
      if (raw === null || raw === undefined) {
        continue;
      }
      if (typeof raw !== 'string') {
        const type = this.getTypeName(raw) as InputArgument;
        throw new Error(
          `Invalid type: expected one of (${this.TYPE_NAME_TABLE[InputArgument.TYPE_STRING]}), received ${
            this.TYPE_NAME_TABLE[type]
          }`,
        );
      }
      let group = groups.get(raw);
      if (!group) {
        group = [];
        groups.set(raw, group);
      }
      group.push(item);
    }
    return Object.fromEntries(groups);
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

  private findExtreme(
    inputValue: (string | number)[],
    isBetter: (cmp: number) => boolean,
    mathFn: (...values: number[]) => number,
  ): string | number | null {
    if (!inputValue.length) {
      return null;
    }
    if (this.getTypeName(inputValue[0]) === InputArgument.TYPE_NUMBER) {
      return mathFn(...(inputValue as number[]));
    }
    const elements = inputValue as string[];
    let extreme = elements[0];
    for (let i = 1; i < elements.length; i += 1) {
      if (isBetter(Text.comparer(elements[i], extreme))) {
        extreme = elements[i];
      }
    }
    return extreme;
  }

  private findExtremeBy(resolvedArgs: [JSONArray, ExpressionNode], isBetter: (cmp: number) => boolean): JSONValue {
    const resolvedArray = resolvedArgs[0];
    if (!resolvedArray.length) {
      return null;
    }
    const exprefNode = resolvedArgs[1];
    const interpreter = this._interpreter;
    if (!interpreter) {
      return null;
    }

    const firstKey = interpreter.visit(exprefNode, resolvedArray[0]) as JSONValue;
    const firstType = this.getTypeName(firstKey) as InputArgument;
    if (firstType !== InputArgument.TYPE_NUMBER && firstType !== InputArgument.TYPE_STRING) {
      throw new Error(
        `Invalid type: expected one of (${this.TYPE_NAME_TABLE[InputArgument.TYPE_NUMBER]} | ${
          this.TYPE_NAME_TABLE[InputArgument.TYPE_STRING]
        }), received ${this.TYPE_NAME_TABLE[firstType]}`,
      );
    }

    let extremeRecord: JSONValue = resolvedArray[0];
    let extremeKey = firstKey;

    for (let i = 1; i < resolvedArray.length; i += 1) {
      const currentKey = interpreter.visit(exprefNode, resolvedArray[i]) as JSONValue;
      const currentType = this.getTypeName(currentKey) as InputArgument;
      if (currentType !== firstType) {
        throw new Error(
          `Invalid type: expected (${this.TYPE_NAME_TABLE[firstType]}), received ${this.TYPE_NAME_TABLE[currentType]}`,
        );
      }

      const cmp =
        firstType === InputArgument.TYPE_NUMBER
          ? (currentKey as number) - (extremeKey as number)
          : Text.comparer(currentKey as string, extremeKey as string);

      if (isBetter(cmp)) {
        extremeKey = currentKey;
        extremeRecord = resolvedArray[i];
      }
    }

    return extremeRecord;
  }

  private functionSort: RuntimeFunction<[(string | number)[]], (string | number)[]> = ([inputValue]) =>
    inputValue.length <= 1
      ? inputValue
      : typeof inputValue[0] === 'string'
        ? (<string[]>[...inputValue]).sort(Text.comparer)
        : [...inputValue].sort((a, b) => (a as number) - (b as number));

  private functionSortBy: RuntimeFunction<[number[] | string[], ExpressionNode], JSONValue> = resolvedArgs => {
    const sortedArray = [...resolvedArgs[0]];
    if (sortedArray.length <= 1) {
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

  private functionToNumber: RuntimeFunction<[JSONValue], number | null> = ([inputValue]) => {
    const typeName = this.getTypeName(inputValue);
    if (typeName === InputArgument.TYPE_NUMBER) {
      return inputValue as number;
    }
    if (typeName === InputArgument.TYPE_STRING) {
      const str = inputValue as string;
      if (JSON_NUMBER_REGEX.test(str)) {
        const convertedValue = Number(str);
        if (!isNaN(convertedValue)) {
          return convertedValue;
        }
      }
    }
    return null;
  };

  private functionType: RuntimeFunction<[JSONValue], string> = ([inputValue]) => {
    const type = this.getTypeName(inputValue);
    const name = type !== undefined ? this.TYPE_NAME_TABLE[type] : undefined;
    if (!name) {
      throw new Error('invalid-type');
    }
    return name;
  };

  private functionZip: RuntimeFunction<JSONArrayArray, JSONArray> = array => {
    const length = Math.min(...array.map(arr => arr.length));
    return Array.from({ length }, (_, index) => array.map(arr => arr[index])) as unknown as JSONArray;
  };
}
