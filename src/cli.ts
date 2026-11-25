'use strict';

import * as fs from 'node:fs';
import { ParseArgsConfig, parseArgs } from 'node:util';
import pkg from '../package.json';
import jmespath from './index';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function run(): void {
  const args = getArgs();

  if (args.values.help) {
    printHelp();
    process.exit(0);
  }

  if (args.values['expr-file']) {
    if (args.positionals.length > 0) {
      fail('Unexpected extra positional arguments.');
    }
  } else if (args.positionals.length < 1) {
    fail('Must provide a jmespath expression.');
  } else if (args.positionals.length > 1) {
    fail('Unexpected extra positional arguments.');
  }

  const expression = args.values['expr-file']
    ? fs.readFileSync(<string>args.values['expr-file'], { encoding: 'utf8', flag: 'r' })
    : args.positionals[0];

  const compact = <boolean>args.values.compact;

  if (args.values.filename) {
    const inputJSON = fs.readFileSync(<string>args.values.filename, { encoding: 'utf8', flag: 'r' });
    printResult(inputJSON, expression, compact);
    return;
  }

  let inputJSON = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('readable', () => {
    const chunk = process.stdin.read();
    if (chunk !== null) {
      inputJSON += chunk;
    }
  });

  process.stdin.on('end', () => {
    try {
      printResult(inputJSON, expression, compact);
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  });
}

try {
  run();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
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
  if (!inputJSON.trim()) {
    throw new Error('Empty JSON input.');
  }
  const parsedInput = JSON.parse(inputJSON);
  console.log(JSON.stringify(jmespath.search(parsedInput, expression, undefined), null, compact ? 0 : 2));
}
