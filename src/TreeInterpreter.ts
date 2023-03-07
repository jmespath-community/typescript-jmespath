import { isFalse, strictDeepEqual } from './utils';
import { Runtime } from './Runtime';
import type { ExpressionNode, ExpressionReference, SliceNode } from './AST.type';
import type { JSONArray, JSONObject, JSONValue } from './JSON.type';

export class TreeInterpreter {
  runtime: Runtime;
  private _rootValue: JSONValue | null = null;

  constructor() {
    this.runtime = new Runtime(this);
  }

  search(node: ExpressionNode, value: JSONValue): JSONValue {
    this._rootValue = value;
    return this.visit(node, value) as JSONValue;
  }

  visit(node: ExpressionNode, value: JSONValue | ExpressionNode): JSONValue | ExpressionNode | ExpressionReference {
    switch (node.type) {
      case 'Field':
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return null;
        }
        return value[node.name] ?? null;
      case 'IndexExpression':
      case 'Subexpression':
        return this.visit(node.right, this.visit(node.left, value));
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
          return base;
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
      case 'Comparator': {
        const first = this.visit(node.left, value);
        const second = this.visit(node.right, value);
        switch (node.name) {
          case 'EQ':
            return strictDeepEqual(first, second);
          case 'NE':
            return !strictDeepEqual(first, second);
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
        if (value === null) {
          return null;
        }
        const collected: JSONArray = [];
        for (const child of node.children) {
          collected.push(this.visit(child, value) as JSONValue);
        }
        return collected;
      }
      case 'MultiSelectHash': {
        if (value === null) {
          return null;
        }
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
      const error = new Error('Invalid slice, step cannot be 0');
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
