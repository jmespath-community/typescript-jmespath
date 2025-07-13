#! /usr/bin/env node

'use strict';

import { ParseArgsConfig, parseArgs } from 'node:util';
import * as fs from 'fs';
import pkg from '../package.json';
import jmespath, { JSONValue } from '../src';

const args = getArgs();

if (args.values.help) {
  printHelp();
  process.exit(0);
}

if (!args.values['expr-file'] && args.positionals.length < 1) {
  console.log('Must provide a jmespath expression.');
  process.exit(1);
}

let expression = '';
if (args.values['expr-file']) {
  expression = fs.readFileSync(<string>args.values['expr-file'], { encoding: 'utf8', flag: 'r' });
} else {
  expression = args.positionals[0];
}

let inputJSON = '';
if (args?.values?.filename) {
  inputJSON = fs.readFileSync(<string>args.values.filename, { encoding: 'utf8', flag: 'r' });
  printResult(inputJSON, expression, <boolean>args.values.compact);
} else {
  process.stdin.setEncoding('utf-8');
  process.stdin.on('readable', function () {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      inputJSON += chunk;
    }
  });

  process.stdin.on('end', function () {
    printResult(inputJSON, expression, <boolean>args.values.compact);
  });
}

function getArgs() {
  const config: ParseArgsConfig = {
    options: {
      compact: {
        type: 'boolean',
        short: 'c',
        default: false,
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false,
      },
      filename: {
        type: 'string',
        short: 'f',
      },
      'expr-file': {
        type: 'string',
        short: 'e',
      },
    },
    allowPositionals: true,
  };

  return parseArgs(config);
}

function printHelp(): void {
  console.log(`
    NAME:
    jp - jp [<options>] <expression>

      USAGE:
      jp [global options] command [command options] [arguments...]

      VERSION:
      ${pkg.name}@${pkg.version}

      OPTIONS:
      --compact, -c                Produce compact JSON output that omits nonessential whitespace.
      --filename value, -f value   Read input JSON from a file instead of stdin.
      --expr-file value, -e value  Read JMESPath expression from the specified file.
      --help, -h                   Show help
      `);
}

function printResult(inputJSON: string, expression: string, compact = false) {
  let parsedInput: JSONValue | null = null;

  try {
    parsedInput = JSON.parse(inputJSON);
  } catch (e) {
    throw e;
  }

  try {
    console.log(JSON.stringify(jmespath.search(parsedInput, expression, undefined), null, compact ? 0 : 2));
  } catch (e) {
    throw e;
  }
}
