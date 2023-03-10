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
/* using ES modules */
import { search } from '@jmespath-community/jmespath';


/* using CommonJS modules */
const search = require('@jmespath-community/jmespath').search;


search({foo: {bar: {baz: [0, 1, 2, 3, 4]}}}, "foo.bar.baz[2]")

// OUTPUTS: 2

```

In the example we gave the `search` function input data of
`{foo: {bar: {baz: [0, 1, 2, 3, 4]}}}` as well as the JMESPath
expression `foo.bar.baz[2]`, and the `search` function evaluated
the expression against the input data to produce the result `2`.

The JMESPath language can do *a lot* more than select an element
from a list.  Here are a few more examples:

```javascript
import { search } from '@jmespath-community/jmespath';

/* --- EXAMPLE 1 --- */

let JSON_DOCUMENT = {
  foo: {
    bar: {
      baz: [0, 1, 2, 3, 4]
    }
  }
};

search(JSON_DOCUMENT, "foo.bar");
// OUTPUTS: { baz: [ 0, 1, 2, 3, 4 ] }


/* --- EXAMPLE 2 --- */

JSON_DOCUMENT = {
  "foo": [
    {"first": "a", "last": "b"},
    {"first": "c", "last": "d"}
  ]
};

search(JSON_DOCUMENT, "foo[*].first")
// OUTPUTS: [ 'a', 'c' ]


/* --- EXAMPLE 3 --- */

JSON_DOCUMENT = {
  "foo": [
    {"age": 20},
    {"age": 25},
    {"age": 30},
    {"age": 35},
    {"age": 40}
  ]
}

search(JSON_DOCUMENT, "foo[?age > `30`]");
// OUTPUTS: [ { age: 35 }, { age: 40 } ]
```

### `compile(expression: string): ExpressionNodeTree`

You can precompile all your expressions ready for use later on. the `compile`
function takes a JMESPath expression and returns an abstract syntax tree that
can be used by the TreeInterpreter function

```javascript
import { compile, TreeInterpreter } from '@jmespath-community/jmespath';

const ast = compile('foo.bar');

TreeInterpreter.search(ast, {foo: {bar: 'BAZ'}})
// RETURNS: "BAZ"

```

---
## EXTENSIONS TO ORIGINAL SPEC

1. ### Register you own custom functions

    #### `registerFunction(functionName: string, customFunction: RuntimeFunction, signature: InputSignature[]): void`

    Extend the list of built in JMESpath expressions with your own functions.

    ```javascript
      import {search, registerFunction, TYPE_NUMBER} from '@jmespath-community/jmespath'


      search({ foo: 60, bar: 10 }, 'divide(foo, bar)')
      // THROWS ERROR: Error: Unknown function: divide()

      registerFunction(
        'divide', // FUNCTION NAME
        (resolvedArgs) => {   // CUSTOM FUNCTION
          const [dividend, divisor] = resolvedArgs;
          return dividend / divisor;
        },
        [{ types: [TYPE_NUMBER] }, { types: [TYPE_NUMBER] }] //SIGNATURE
      );

      search({ foo: 60,bar: 10 }, 'divide(foo, bar)');
      // OUTPUTS: 6

    ```

    Optional arguments are supported by setting `{..., optional: true}` in argument signatures


    ```javascript

      registerFunction(
        'divide',
        (resolvedArgs) => {
          const [dividend, divisor] = resolvedArgs;
          return dividend / divisor ?? 1; //OPTIONAL DIVISOR THAT DEFAULTS TO 1
        },
        [{ types: [TYPE_NUMBER] }, { types: [TYPE_NUMBER], optional: true }] //SIGNATURE
      );

      search({ foo: 60, bar: 10 }, 'divide(foo)');
      // OUTPUTS: 60

    ```

2. ### Root value access with `$` symbol

```javascript

search({foo: {bar: 999}, baz: [1, 2, 3]}, '$.baz[*].[@, $.foo.bar]')

// OUTPUTS:
// [ [ 1, 999 ], [ 2, 999 ], [ 3, 999 ] ]
```


## More Resources

The example above only show a small amount of what
a JMESPath expression can do. If you want to take a
tour of the language, the *best* place to go is the
[JMESPath Tutorial](http://jmespath.site/main#tutorial).

One of the best things about JMESPath is that it is
implemented in many different programming languages including
python, ruby, php, lua, etc.  To see a complete list of libraries,
check out the [JMESPath libraries page](http://jmespath.site/main#libraries).

And finally, the full JMESPath specification can be found
on the [JMESPath site](https://jmespath.site/main/#specification).
