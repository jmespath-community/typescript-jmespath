![Build](https://github.com/jmespath-community/typescript-jmespath/actions/workflows/nodejs.yml/badge.svg?branch=main)

# @jmespath-community/jmespath

@jmespath-community/jmespath is a **TypeScript** implementation of the [JMESPath](https://jmespath.site/) spec.

JMESPath is a query language for JSON. It will take a JSON document
as input and transform it into another JSON document
given a JMESPath expression.

## INSTALLATION

```
npm install @jmespath-community/jmespath
```

## USAGE

### `search(data: JSONValue, expression: string): JSONValue`

```javascript
import { search } from "@jmespath-community/jmespath";

search({ foo: { bar: { baz: [0, 1, 2, 3, 4] } } }, "foo.bar.baz[2]");

// OUTPUTS: 2
```

In the example we gave the `search` function input data of
`{foo: {bar: {baz: [0, 1, 2, 3, 4]}}}` as well as the JMESPath
expression `foo.bar.baz[2]`, and the `search` function evaluated
the expression against the input data to produce the result `2`.

The JMESPath language can do _a lot_ more than select an element
from a list. Here are a few more examples:

```javascript
import { search } from "@jmespath-community/jmespath";

/* --- EXAMPLE 1 --- */

let JSON_DOCUMENT = {
  foo: {
    bar: {
      baz: [0, 1, 2, 3, 4],
    },
  },
};

search(JSON_DOCUMENT, "foo.bar");
// OUTPUTS: { baz: [ 0, 1, 2, 3, 4 ] }

/* --- EXAMPLE 2 --- */

JSON_DOCUMENT = {
  foo: [
    { first: "a", last: "b" },
    { first: "c", last: "d" },
  ],
};

search(JSON_DOCUMENT, "foo[*].first");
// OUTPUTS: [ 'a', 'c' ]

/* --- EXAMPLE 3 --- */

JSON_DOCUMENT = {
  foo: [{ age: 20 }, { age: 25 }, { age: 30 }, { age: 35 }, { age: 40 }],
};

search(JSON_DOCUMENT, "foo[?age > `30`]");
// OUTPUTS: [ { age: 35 }, { age: 40 } ]
```

### `compile(expression: string): ExpressionNodeTree`

You can precompile all your expressions ready for use later on. The `compile`
function takes a JMESPath expression and returns an abstract syntax tree that
can be used by the TreeInterpreter function

```javascript
import { compile, TreeInterpreter } from "@jmespath-community/jmespath";

const ast = compile("foo.bar");

TreeInterpreter.search(ast, { foo: { bar: "BAZ" } });
// RETURNS: "BAZ"
```

---

## EXTENSIONS TO ORIGINAL SPEC

1. ### Register your own custom functions

   #### Enhanced Function Registry API

   The library provides both backward-compatible and enhanced APIs for registering custom functions with improved developer experience, type safety, and flexible override behavior.

   ##### Basic Usage (Backward Compatible)

   ```javascript
   import { search, registerFunction, TYPE_NUMBER } from "@jmespath-community/jmespath";

   search({ foo: 60, bar: 10 }, "divide(foo, bar)");
   // THROWS ERROR: Error: Unknown function: divide()

   registerFunction(
     "divide", // FUNCTION NAME
     (resolvedArgs) => {
       // CUSTOM FUNCTION
       const [dividend, divisor] = resolvedArgs;
       return dividend / divisor;
     },
     [{ types: [TYPE_NUMBER] }, { types: [TYPE_NUMBER] }], //SIGNATURE
   );

   search({ foo: 60, bar: 10 }, "divide(foo, bar)");
   // OUTPUTS: 6
   ```

   ##### Enhanced Registry API with Type Safety

   ```typescript
   import { register, search, TYPE_NUMBER } from "@jmespath-community/jmespath";

   // TypeScript prevents registering built-in functions at compile time
   // register('sum', myFunc, signature); // TypeScript error!

   // Enhanced registration with better error handling
   const result = register('multiply', ([a, b]) => a * b, [
     { types: [TYPE_NUMBER] },
     { types: [TYPE_NUMBER] }
   ]);

   if (result.success) {
     console.log(result.message); // "Function multiply() registered successfully"
   } else {
     console.error(result.message); // Detailed error information
   }
   ```

   ##### Override Existing Functions

   ```javascript
   import { registerFunction, register } from "@jmespath-community/jmespath";

   // Option 1: Using registerFunction with options
   registerFunction('myFunc', () => 'first', []);
   registerFunction('myFunc', () => 'second', [], { override: true, warn: true });
   // Console: "Warning: Overriding existing function: myFunc()"

   // Option 2: Using enhanced register API
   const result = register('myFunc', () => 'third', [], { override: true });
   console.log(result.message); // "Function myFunc() overridden successfully"
   ```

   ##### Registry Management

   ```javascript
   import {
     isRegistered,
     getRegisteredFunctions,
     getCustomFunctions,
     unregisterFunction,
     clearCustomFunctions
   } from "@jmespath-community/jmespath";

   // Check if function exists
   console.log(isRegistered('sum')); // true (built-in)
   console.log(isRegistered('myFunc')); // true (if registered)

   // Get all registered functions
   const allFunctions = getRegisteredFunctions();
   console.log(allFunctions); // ['abs', 'avg', 'ceil', ..., 'myFunc']

   // Get only custom functions
   const customFunctions = getCustomFunctions();
   console.log(customFunctions); // ['myFunc', 'divide', ...]

   // Unregister custom function (built-ins cannot be unregistered)
   const removed = unregisterFunction('myFunc');
   console.log(removed); // true if successful

   // Clear all custom functions
   clearCustomFunctions();
   console.log(getCustomFunctions()); // []
   ```

   ##### Optional Arguments

   Optional arguments are supported by setting `{..., optional: true}` in argument signatures

   ```javascript
   registerFunction(
     "divide",
     (resolvedArgs) => {
       const [dividend, divisor] = resolvedArgs;
       return dividend / (divisor ?? 1); //OPTIONAL DIVISOR THAT DEFAULTS TO 1
     },
     [{ types: [TYPE_NUMBER] }, { types: [TYPE_NUMBER], optional: true }], //SIGNATURE
   );

   search({ foo: 60, bar: 10 }, "divide(foo)");
   // OUTPUTS: 60
   ```

2. ### Root value access with `$` symbol

```javascript
search({ foo: { bar: 999 }, baz: [1, 2, 3] }, "$.baz[*].[@, $.foo.bar]");

// OUTPUTS:
// [ [ 1, 999 ], [ 2, 999 ], [ 3, 999 ] ]
```

## More Resources

The example above only show a small amount of what
a JMESPath expression can do. If you want to take a
tour of the language, the _best_ place to go is the
[JMESPath Tutorial](http://jmespath.site/main#tutorial).

One of the best things about JMESPath is that it is
implemented in many different programming languages including
python, ruby, php, lua, etc. To see a complete list of libraries,
check out the [JMESPath libraries page](http://jmespath.site/main#libraries).

And finally, the full JMESPath specification can be found
on the [JMESPath site](https://jmespath.site/main/#specification).

## Experimental Features

### Ternary Operations (`? :`)

**Supported Version:** 1.1.6

Experimental support for [ternary operations](https://github.com/jmespath-community/jmespath.spec/discussions/179) has been added, allowing for conditional logic within your JMESPath expressions. The syntax is `condition ? value_if_true : value_if_false`.

- **Condition:** The expression before the `?`. JMESPath determines truthiness based on the evaluated value:
  - `true` is truthy.
  - Any non-empty object, array, or string is truthy.
  - Any non-zero number is truthy.
  - `false`, `null`, empty objects `{}`, empty arrays `[]`, and empty strings `''` are falsy.
- **Value if true:** The expression between the `?` and `:`. This is evaluated and returned if the condition is truthy.
- **Value if false:** The expression after the `:`. This is evaluated and returned if the condition is falsy.

**Examples:**

Basic usage:

```javascript
search({ is_active: true, user: "Alice" }, "is_active ? user : 'Guest'");
// OUTPUTS: "Alice"

search({ is_active: false, user: "Bob" }, "is_active ? user : 'Guest'");
// OUTPUTS: "Guest"
```

Truthiness with different types:

```javascript
search({ data: [1, 2] }, "data ? 'has_data' : 'no_data'");
// OUTPUTS: "has_data"

search({ data: [] }, "data ? 'has_data' : 'no_data'");
// OUTPUTS: "no_data"

search({ count: 5 }, "count ? 'count_present' : 'no_count'");
// OUTPUTS: "count_present"

search({ count: 0 }, "count ? 'count_present' : 'no_count'");
// OUTPUTS: "no_count"
```

Nested Ternaries:

```javascript
search({ a: true, b: false, val1: 10, val2: 20, val3: 30 }, "a ? (b ? val1 : val2) : val3");
// OUTPUTS: 20
```

This feature is currently experimental and its syntax or behavior might change in future releases.
