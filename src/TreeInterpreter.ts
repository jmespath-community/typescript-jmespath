import { Token } from './Lexer.type';
import { Runtime } from './Runtime';
import { ScopeChain } from './Scope';
import { add, div, divide, ensureNumbers, isFalse, mod, mul, strictDeepEqual, sub } from './utils';

import type { ExpressionNode, ExpressionReference, SliceNode } from './AST.type';
import type { JSONArray, JSONObject, JSONValue } from './JSON.type';
import { ScopeEntry } from './Parser.type';

export class TreeInterpreter {
  runtime: Runtime;
  private _rootValue: JSONValue | null = null;
  private _scope: ScopeChain;

  constructor() {
    this.runtime = new Runtime(this);
    this._scope = new ScopeChain();
  }

  withScope(scope: ScopeEntry): TreeInterpreter {
    const interpreter = new TreeInterpreter();
    interpreter._rootValue = this._rootValue;
    interpreter._scope = this._scope.withScope(scope);
    return interpreter;
  }

  search(node: ExpressionNode, value: JSONValue): JSONValue {
    this._rootValue = value;
    this._scope = new ScopeChain();
    return this.visit(node, value) as JSONValue;
  }

  visit(node: ExpressionNode, value: JSONValue | ExpressionNode): JSONValue | ExpressionNode | ExpressionReference {
    switch (node.type) {
      case 'Field':
        const identifier = node.name;
        let result: JSONValue = null;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result = value[identifier] ?? null;
        }
        return result;
      case 'LetExpression': {
        const { bindings, expression } = node;
        let scope = {};
        bindings.forEach(binding => {
          const reference = this.visit(binding, value) as JSONObject;
          scope = {
            ...scope,
            ...reference,
          };
        });
        return this.withScope(scope).visit(expression, value);
      }
      case 'Binding': {
        const { variable, reference } = node;
        const result = this.visit(reference, value);
        return { [variable]: result } as JSONObject;
      }
      case 'Variable': {
        const variable = node.name;
        const result = this._scope.getValue(variable) ?? null;
        if (result === null || result === undefined) {
          throw new Error(`Error referencing undefined variable ${variable}`);
        }
        return result;
      }
      case 'IndexExpression':
        return this.visit(node.right, this.visit(node.left, value));
      case 'Subexpression': {
        const result = this.visit(node.left, value);
        return (result != null && this.visit(node.right, result)) || null;
      }
      case 'Index': {
        if (!Array.isArray(value)) {
          return null;
        }
        const index = node.value < 0 ? value.length + node.value : node.value;
        return value[index] ?? null;
      }
      case 'Slice': {
        if (!Array.isArray(value) && typeof value !== 'string') {
          return null;
        }
        const { start, stop, step } = this.computeSliceParams(value.length, node);
        if (typeof value === 'string') {
          // string slices is implemented by slicing
          // the corresponding array of codepoints and
          // converting the result back to a string
          const chars = [...value];
          const sliced = this.slice(chars, start, stop, step);
          return sliced.join('');
        } else {
          return this.slice(value, start, stop, step);
        }
      }
      case 'Projection': {
        const { left, right } = node;

        // projections typically operate on arrays
        // string slicing produces a 'Projection' whose
        // first child is an 'IndexExpression' whose
        // second child is an 'Slice'

        // we allow execution of the left index-expression
        // to return a string only if the AST has this
        // specific shape

        let allowString = false;
        if (left.type === 'IndexExpression' && left.right.type === 'Slice') {
          allowString = true;
        }

        const base = this.visit(left, value);
        if (allowString && typeof base === 'string') {
          // a projection is really a sub-expression in disguise
          // we must evaluate the right hand expression
          return this.visit(right, base) as JSONValue;
        }

        if (!Array.isArray(base)) {
          return null;
        }
        const collected: JSONArray = [];
        for (const elem of base) {
          const current = this.visit(right, elem) as JSONValue;
          if (current !== null) {
            collected.push(current);
          }
        }
        return collected as JSONValue;
      }
      case 'ValueProjection': {
        const { left, right } = node;

        const base = this.visit(left, value);
        if (base === null || typeof base !== 'object' || Array.isArray(base)) {
          return null;
        }
        const collected: JSONArray = [];
        const values = Object.values(base);
        for (const elem of values) {
          const current = this.visit(right, elem) as JSONValue;
          if (current !== null) {
            collected.push(current);
          }
        }
        return collected;
      }
      case 'FilterProjection': {
        const { left, right, condition } = node;

        const base = this.visit(left, value);
        if (!Array.isArray(base)) {
          return null;
        }

        const results: JSONArray = [];
        for (const elem of base) {
          const matched = this.visit(condition, elem);
          if (isFalse(matched)) {
            continue;
          }
          const result = this.visit(right, elem) as JSONValue;
          if (result !== null) {
            results.push(result);
          }
        }
        return results;
      }
      case 'Arithmetic': {
        const first = this.visit(node.left, value) as JSONValue;
        const second = this.visit(node.right, value) as JSONValue;
        switch (node.operator) {
          case Token.TOK_PLUS:
            return add(first, second);

          case Token.TOK_MINUS:
            return sub(first, second);

          case Token.TOK_MULTIPLY:
          case Token.TOK_STAR:
            return mul(first, second);

          case Token.TOK_DIVIDE:
            return divide(first, second);

          case Token.TOK_MODULO:
            return mod(first, second);

          case Token.TOK_DIV:
            return div(first, second);

          default:
            throw new Error(`Syntax error: unknown arithmetic operator: ${node.operator}`);
        }
      }
      case 'Unary': {
        const operand = this.visit(node.operand, value) as JSONValue;
        switch (node.operator) {
          case Token.TOK_PLUS:
            ensureNumbers(operand);
            return operand as number;

          case Token.TOK_MINUS:
            ensureNumbers(operand);
            return -(operand as number);

          default:
            throw new Error(`Syntax error: unknown arithmetic operator: ${node.operator}`);
        }
      }
      case 'Comparator': {
        const first = this.visit(node.left, value);
        const second = this.visit(node.right, value);

        // equality is an exact match

        switch (node.name) {
          case 'EQ':
            return strictDeepEqual(first, second);
          case 'NE':
            return !strictDeepEqual(first, second);
        }

        // ordering operators are only valid for numbers

        if (typeof first !== 'number' || typeof second !== 'number') {
          return null;
        }

        switch (node.name) {
          case 'GT':
            return (first as number) > (second as number);
          case 'GTE':
            return (first as number) >= (second as number);
          case 'LT':
            return (first as number) < (second as number);
          case 'LTE':
            return (first as number) <= (second as number);
        }
      }
      case 'Flatten': {
        const original = this.visit(node.child, value);
        return Array.isArray(original) ? original.flat() : null;
      }
      case 'Root':
        return this._rootValue;
      case 'MultiSelectList': {
        const collected: JSONArray = [];
        for (const child of node.children) {
          collected.push(this.visit(child, value) as JSONValue);
        }
        return collected;
      }
      case 'MultiSelectHash': {
        const collected: JSONObject = {};
        for (const child of node.children) {
          collected[child.name] = this.visit(child.value, value) as JSONValue;
        }
        return collected;
      }
      case 'OrExpression': {
        const result = this.visit(node.left, value);
        if (isFalse(result)) {
          return this.visit(node.right, value);
        }
        return result;
      }
      case 'AndExpression': {
        const result = this.visit(node.left, value);
        if (isFalse(result)) {
          return result;
        }
        return this.visit(node.right, value);
      }
      case 'NotExpression':
        return isFalse(this.visit(node.child, value));
      case 'Literal':
        return node.value;
      case 'Pipe':
        return this.visit(node.right, this.visit(node.left, value));
      case 'Function': {
        const args: JSONArray = [];
        for (const child of node.children) {
          args.push(this.visit(child, value) as JSONValue);
        }
        return this.runtime.callFunction(node.name, args);
      }
      case 'ExpressionReference':
        return {
          expref: true,
          ...node.child,
        };
      case 'Current':
      case 'Identity':
        return value;
    }
  }

  computeSliceParams(arrayLength: number, sliceNode: SliceNode): { start: number; stop: number; step: number } {
    let { start, stop, step } = sliceNode;

    if (step === null) {
      step = 1;
    } else if (step === 0) {
      const error = new Error('Invalid value: slice step cannot be 0');
      error.name = 'RuntimeError';
      throw error;
    }

    start = start === null ? (step < 0 ? arrayLength - 1 : 0) : this.capSliceRange(arrayLength, start, step);
    stop = stop === null ? (step < 0 ? -1 : arrayLength) : this.capSliceRange(arrayLength, stop, step);

    return { start, stop, step };
  }

  capSliceRange(arrayLength: number, actualValue: number, step: number): number {
    let nextActualValue = actualValue;
    if (nextActualValue < 0) {
      nextActualValue += arrayLength;
      if (nextActualValue < 0) {
        nextActualValue = step < 0 ? -1 : 0;
      }
    } else if (nextActualValue >= arrayLength) {
      nextActualValue = step < 0 ? arrayLength - 1 : arrayLength;
    }
    return nextActualValue;
  }

  slice(collection: JSONArray, start: number, end: number, step: number): JSONArray {
    const result = [];
    if (step > 0) {
      for (let i = start; i < end; i += step) {
        result.push(collection[i]);
      }
    } else {
      for (let i = start; i > end; i += step) {
        result.push(collection[i]);
      }
    }
    return result;
  }
}

export const TreeInterpreterInstance = new TreeInterpreter();
export default TreeInterpreterInstance;
