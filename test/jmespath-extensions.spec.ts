import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RegistrationResult } from '../src';
import jmespath, {
  clearCustomFunctions,
  getCustomFunctions,
  getRegisteredFunctions,
  isRegistered,
  register,
  registerFunction,
  search,
  unregisterFunction,
} from '../src';
import { JSONObject } from '../src/JSON.type';

describe('registerFunction', () => {
  it('register a customFunction', () => {
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'divide(foo, bar)',
      ),
    ).toThrow('Unknown function: divide()');
    jmespath.registerFunction(
      'divide',
      resolvedArgs => {
        const [dividend, divisor] = resolvedArgs;
        return (dividend as number) / (divisor as number);
      },
      [{ types: [jmespath.TYPE_NUMBER] }, { types: [jmespath.TYPE_NUMBER] }],
    );
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'divide(foo, bar)',
      ),
    ).not.toThrow();
    expect(
      search(
        {
          foo: 60,
          bar: 10,
        },
        'divide(foo, bar)',
      ),
    ).toEqual(6);
  });
  it("won't register a customFunction if one already exists", () => {
    expect(() =>
      registerFunction('sum', () => {
        /* EMPTY FUNCTION */
        return 'empty';
      }, []),
    ).toThrow('Function already defined: sum()');
  });
  it('alerts too few arguments', () => {
    registerFunction('tooFewArgs', () => {
      /* EMPTY FUNCTION */
      return 'empty';
    }, [{ types: [jmespath.TYPE_ANY] }, { types: [jmespath.TYPE_NUMBER], optional: true }]);
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'tooFewArgs()',
      ),
    ).toThrow('Invalid arity: tooFewArgs() takes 1 arguments but received 0');
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'tooFewArgs(foo, @)',
      ),
    ).toThrow('Invalid type: tooFewArgs() expected argument 2 to be type (number) but received type object instead.');
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'tooFewArgs(foo, `2`, @)',
      ),
    ).toThrow('Invalid arity: tooFewArgs() takes 1 arguments but received 3');
  });
  it('alerts too many arguments', () => {
    registerFunction('tooManyArgs', () => {
      /* EMPTY FUNCTION */
      return 'empty';
    }, []);
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'tooManyArgs(foo)',
      ),
    ).toThrow('Invalid arity: tooManyArgs() takes 0 argument but received 1');
  });

  it('alerts optional variadic arguments', () => {
    registerFunction('optionalVariadic', () => {
      /* EMPTY FUNCTION */
      return 'empty';
    }, [{ types: [jmespath.TYPE_ANY], optional: true, variadic: true }]);
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'optionalVariadic(foo)',
      ),
    ).not.toThrow();
  });

  it('alerts variadic is always last argument', () => {
    expect(() =>
      registerFunction('variadicAlwaysLast', () => {
        /* EMPTY FUNCTION */
        return 'empty';
      }, [
        { types: [jmespath.TYPE_ANY], variadic: true },
        { types: [jmespath.TYPE_ANY], optional: true },
      ]),
    ).toThrow("Invalid arity: variadicAlwaysLast() 'variadic' argument 1 must occur last");
  });

  it('accounts for optional arguments', () => {
    registerFunction(
      'optionalArgs',
      ([first, second, third]) => {
        return {
          // biome-ignore lint/suspicious/noExplicitAny: Test function with any types
          first: first as any,
          // biome-ignore lint/suspicious/noExplicitAny: Test function with any types
          second: (second as any) ?? 'default[2]',
          // biome-ignore lint/suspicious/noExplicitAny: Test function with any types
          third: (third as any) ?? 'default[3]',
        };
      },
      [{ types: [jmespath.TYPE_ANY] }, { types: [jmespath.TYPE_ANY], optional: true }],
    );
    expect(
      search(
        {
          foo: 60,
          bar: 10,
        },
        'optionalArgs(foo)',
      ),
    ).toEqual({ first: 60, second: 'default[2]', third: 'default[3]' });
    expect(
      search(
        {
          foo: 60,
          bar: 10,
        },
        'optionalArgs(foo, bar)',
      ),
    ).toEqual({ first: 60, second: 10, third: 'default[3]' });
    expect(() =>
      search(
        {
          foo: 60,
          bar: 10,
        },
        'optionalArgs(foo, bar, [foo, bar])',
      ),
    ).toThrow('Invalid arity: optionalArgs() takes 1 arguments but received 3');
  });
});

describe('root', () => {
  it('$ should give access to the root value', () => {
    const value = <JSONObject>search({ foo: { bar: 1 } }, 'foo.{ value: $.foo.bar }');
    expect(value).not.toBe(null);
    expect(value?.['value']).toBe(1);
  });
  it('$ should give access to the root value after pipe', () => {
    const value = search({ foo: { bar: 1 } }, 'foo | $.foo.bar');
    expect(value).toEqual(1);
  });
  it('$ should give access in expressions', () => {
    const value = search([{ foo: { bar: 1 } }, { foo: { bar: 99 } }], 'map(&foo.{boo: bar, root: $}, @)');
    expect(value).toEqual([
      { boo: 1, root: [{ foo: { bar: 1 } }, { foo: { bar: 99 } }] },
      { boo: 99, root: [{ foo: { bar: 1 } }, { foo: { bar: 99 } }] },
    ]);
  });
  it('$ can be used in parallel', () => {
    const value = search([{ foo: { bar: 1 } }, { foo: { bar: 99 } }], '[$[0].foo.bar, $[1].foo.bar]');
    expect(value).toEqual([1, 99]);
  });
});

describe('Enhanced Registry API', () => {
  // Clean up custom functions before and after each test
  beforeEach(() => {
    clearCustomFunctions();
  });

  afterEach(() => {
    clearCustomFunctions();
  });

  describe('register() function', () => {
    it('should register a new function successfully', () => {
      const result = register('multiply', ([a, b]) => (a as number) * (b as number), [
        { types: [jmespath.TYPE_NUMBER] },
        { types: [jmespath.TYPE_NUMBER] },
      ]);

      expect(result.success).toBe(true);
      expect(result.message).toContain('multiply() registered successfully');
      expect(isRegistered('multiply')).toBe(true);
    });

    it('should prevent registering built-in functions at compile time', () => {
      // This test verifies TypeScript compile-time checking
      // The following line should cause a TypeScript error if uncommented:
      // register('sum', ([a, b]) => a + b, [{ types: [jmespath.TYPE_NUMBER] }]);

      // We can test runtime behavior by bypassing TypeScript
      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime behavior
      const result = (register as (name: string, func: any, sig: any) => RegistrationResult)(
        'sum',
        // biome-ignore lint/suspicious/noExplicitAny: Testing runtime behavior
        ([a, b]: any[]) => (a as number) + (b as number),
        [{ types: [jmespath.TYPE_NUMBER] }],
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('already-exists');
      }
    });

    it('should return error when function already exists without override', () => {
      register('testFunc', () => 'first', []);
      const result = register('testFunc', () => 'second', []);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('already-exists');
        expect(result.message).toContain('Use { override: true } to replace it');
      }
    });

    it('should allow overriding with override option', () => {
      register('testFunc', () => 'first', []);
      const result = register('testFunc', () => 'second', [], { override: true });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('overridden successfully');
      }
    });

    it('should emit warning when overriding with warn option', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      register('testFunc', () => 'first', []);
      register('testFunc', () => 'second', [], { override: true, warn: true });

      expect(consoleSpy).toHaveBeenCalledWith('Warning: Overriding existing function: testFunc()');
      consoleSpy.mockRestore();
    });

    it('should validate function name', () => {
      const result = register('', () => 'test', []);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('invalid-name');
      }
    });

    it('should validate function signature', () => {
      const result = register('testFunc', () => 'test', [
        { types: [jmespath.TYPE_ANY], variadic: true },
        { types: [jmespath.TYPE_ANY] }, // Invalid: variadic must be last
      ]);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe('invalid-signature');
      }
    });
  });

  describe('registerFunction() backward compatibility', () => {
    it('should maintain backward compatibility', () => {
      expect(() => {
        registerFunction('oldStyle', ([a, b]) => (a as number) + (b as number), [
          { types: [jmespath.TYPE_NUMBER] },
          { types: [jmespath.TYPE_NUMBER] },
        ]);
      }).not.toThrow();

      expect(search({ a: 5, b: 3 }, 'oldStyle(a, b)')).toBe(8);
    });

    it('should support new options in registerFunction', () => {
      registerFunction('testFunc', () => 'first', []);

      expect(() => {
        registerFunction('testFunc', () => 'second', [], { override: true });
      }).not.toThrow();
    });

    it('should throw error for duplicate registration without override', () => {
      registerFunction('testFunc', () => 'first', []);

      expect(() => {
        registerFunction('testFunc', () => 'second', []);
      }).toThrow('Function already defined: testFunc()');
    });
  });

  describe('unregisterFunction()', () => {
    it('should unregister custom functions', () => {
      register('testFunc', () => 'test', []);
      expect(isRegistered('testFunc')).toBe(true);

      const result = unregisterFunction('testFunc');
      expect(result).toBe(true);
      expect(isRegistered('testFunc')).toBe(false);
    });

    it('should not unregister built-in functions', () => {
      // TypeScript should prevent this at compile time:
      // unregisterFunction('sum');

      // Test runtime behavior
      // biome-ignore lint/suspicious/noExplicitAny: Testing runtime behavior
      const result = (unregisterFunction as any)('sum');
      expect(result).toBe(false);
      expect(isRegistered('sum')).toBe(true);
    });

    it('should return false for non-existent functions', () => {
      const result = unregisterFunction('nonExistent');
      expect(result).toBe(false);
    });
  });

  describe('isRegistered()', () => {
    it('should return true for built-in functions', () => {
      expect(isRegistered('sum')).toBe(true);
      expect(isRegistered('length')).toBe(true);
      expect(isRegistered('map')).toBe(true);
    });

    it('should return true for custom functions', () => {
      register('customFunc', () => 'test', []);
      expect(isRegistered('customFunc')).toBe(true);
    });

    it('should return false for non-existent functions', () => {
      expect(isRegistered('nonExistent')).toBe(false);
    });
  });

  describe('getRegisteredFunctions()', () => {
    it('should return all registered functions including built-ins', () => {
      const functions = getRegisteredFunctions();

      // Should include built-in functions
      expect(functions).toContain('sum');
      expect(functions).toContain('length');
      expect(functions).toContain('map');

      // Should be a reasonable number of functions
      expect(functions.length).toBeGreaterThan(30);
    });

    it('should include custom functions', () => {
      register('customFunc1', () => 'test1', []);
      register('customFunc2', () => 'test2', []);

      const functions = getRegisteredFunctions();
      expect(functions).toContain('customFunc1');
      expect(functions).toContain('customFunc2');
    });
  });

  describe('getCustomFunctions()', () => {
    it('should return only custom functions', () => {
      const customFunctions = getCustomFunctions();
      expect(customFunctions).toEqual([]);

      register('customFunc1', () => 'test1', []);
      register('customFunc2', () => 'test2', []);

      const updatedCustomFunctions = getCustomFunctions();
      expect(updatedCustomFunctions).toEqual(['customFunc1', 'customFunc2']);
      expect(updatedCustomFunctions).not.toContain('sum');
      expect(updatedCustomFunctions).not.toContain('length');
    });
  });

  describe('clearCustomFunctions()', () => {
    it('should remove all custom functions but keep built-ins', () => {
      register('customFunc1', () => 'test1', []);
      register('customFunc2', () => 'test2', []);

      expect(getCustomFunctions()).toHaveLength(2);
      expect(isRegistered('sum')).toBe(true);

      clearCustomFunctions();

      expect(getCustomFunctions()).toHaveLength(0);
      expect(isRegistered('customFunc1')).toBe(false);
      expect(isRegistered('customFunc2')).toBe(false);
      expect(isRegistered('sum')).toBe(true); // Built-in should remain
    });
  });
});
