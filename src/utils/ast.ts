import type { ExpressionNode, FunctionNode } from '../AST.type';
import type { Options } from '../Parser.type';

const CHILD_KEYS = ['left', 'right', 'condition', 'child', 'operand', 'trueExpr', 'falseExpr', 'expression'] as const;

export function countNodes(node: ExpressionNode): number {
  let count = 1;
  const n = node as Record<string, unknown>;
  for (const key of CHILD_KEYS) {
    const child = n[key];
    if (child && typeof child === 'object') {
      count += countNodes(child as ExpressionNode);
    }
  }
  if (Array.isArray(n.children)) {
    for (const c of n.children) {
      if (c && typeof c === 'object') {
        if ((c as Record<string, unknown>).type === 'KeyValuePair') {
          count += 1;
          const val = (c as Record<string, unknown>).value;
          if (val) {
            count += countNodes(val as ExpressionNode);
          }
        } else {
          count += countNodes(c as ExpressionNode);
        }
      }
    }
  }
  if (Array.isArray(n.bindings)) {
    for (const b of n.bindings) {
      if (b && typeof b === 'object') {
        count += 1;
        const ref = (b as Record<string, unknown>).reference;
        if (ref) {
          count += countNodes(ref as ExpressionNode);
        }
      }
    }
  }
  return count;
}

export function findDisallowedFunction(node: ExpressionNode, options: Options): string | null {
  if (node.type === 'Function') {
    const fnNode = node as FunctionNode;
    if (options.allowedFunctions && !options.allowedFunctions.includes(fnNode.name)) {
      return `Function '${fnNode.name}' is not allowed`;
    }
    if (options.disallowedFunctions && options.disallowedFunctions.includes(fnNode.name)) {
      return `Function '${fnNode.name}' is disallowed`;
    }
  }
  const n = node as Record<string, unknown>;
  for (const key of CHILD_KEYS) {
    const child = n[key];
    if (child && typeof child === 'object') {
      const err = findDisallowedFunction(child as ExpressionNode, options);
      if (err) {
        return err;
      }
    }
  }
  if (Array.isArray(n.children)) {
    for (const c of n.children) {
      if (c && typeof c === 'object') {
        const target =
          (c as Record<string, unknown>).type === 'KeyValuePair'
            ? ((c as Record<string, unknown>).value as ExpressionNode)
            : (c as ExpressionNode);
        if (target) {
          const err = findDisallowedFunction(target, options);
          if (err) {
            return err;
          }
        }
      }
    }
  }
  if (Array.isArray(n.bindings)) {
    for (const b of n.bindings) {
      if (b && typeof b === 'object') {
        const ref = (b as Record<string, unknown>).reference as ExpressionNode;
        if (ref) {
          const err = findDisallowedFunction(ref, options);
          if (err) {
            return err;
          }
        }
      }
    }
  }
  return null;
}
