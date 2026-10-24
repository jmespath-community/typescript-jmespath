import type { ExpressionNode, FunctionNode } from '../AST.type';
import type { Options } from '../Parser.type';

export function countNodes(node: ExpressionNode): number {
  let count = 1;
  const n = node as Record<string, unknown>;
  if (n.left) {
    count += countNodes(n.left as ExpressionNode);
  }
  if (n.right) {
    count += countNodes(n.right as ExpressionNode);
  }
  if (n.condition) {
    count += countNodes(n.condition as ExpressionNode);
  }
  if (n.child) {
    count += countNodes(n.child as ExpressionNode);
  }
  if (n.operand) {
    count += countNodes(n.operand as ExpressionNode);
  }
  if (n.trueExpr) {
    count += countNodes(n.trueExpr as ExpressionNode);
  }
  if (n.falseExpr) {
    count += countNodes(n.falseExpr as ExpressionNode);
  }
  if (n.expression) {
    count += countNodes(n.expression as ExpressionNode);
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
  if (n.left) {
    const err = findDisallowedFunction(n.left as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.right) {
    const err = findDisallowedFunction(n.right as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.condition) {
    const err = findDisallowedFunction(n.condition as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.child) {
    const err = findDisallowedFunction(n.child as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.operand) {
    const err = findDisallowedFunction(n.operand as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.trueExpr) {
    const err = findDisallowedFunction(n.trueExpr as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.falseExpr) {
    const err = findDisallowedFunction(n.falseExpr as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (n.expression) {
    const err = findDisallowedFunction(n.expression as ExpressionNode, options);
    if (err) {
      return err;
    }
  }
  if (Array.isArray(n.children)) {
    for (const c of n.children) {
      if (c && typeof c === 'object') {
        if ((c as Record<string, unknown>).type === 'KeyValuePair') {
          const val = (c as Record<string, unknown>).value;
          if (val) {
            const err = findDisallowedFunction(val as ExpressionNode, options);
            if (err) {
              return err;
            }
          }
        } else {
          const err = findDisallowedFunction(c as ExpressionNode, options);
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
        const ref = (b as Record<string, unknown>).reference;
        if (ref) {
          const err = findDisallowedFunction(ref as ExpressionNode, options);
          if (err) {
            return err;
          }
        }
      }
    }
  }
  return null;
}
