'use strict';

import * as fs from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ParseArgsConfig, parseArgs } from 'node:util';
import pkg from '../package.json';
import jmespath from './index';

export interface CliIO {
  args?: string[];
  stdin?: Readable;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  exit?: (code: number) => never | void;
}

export function runCli(io: CliIO = {}): void {
  const stdout = io.stdout ?? ((text: string) => console.log(text));
  const stderr = io.stderr ?? ((text: string) => console.error(text));
  const exit =
    io.exit ??
    ((code: number): never => {
      process.exit(code);
    });

  let exited = false;
  const finish = (code: number): void => {
    if (!exited) {
      exited = true;
      exit(code);
    }
  };

  const fail = (message: string): void => {
    stderr(message);
    finish(1);
  };

  try {
    const args = getArgs(io.args);

    if (args.values.help) {
      stdout(getHelpText());
      finish(0);
      return;
    }

    if (args.values['expr-file']) {
      if (args.positionals.length > 0) {
        fail('Unexpected extra positional arguments.');
        return;
      }
    } else if (args.positionals.length < 1) {
      fail('Must provide a jmespath expression.');
      return;
    } else if (args.positionals.length > 1) {
      fail('Unexpected extra positional arguments.');
      return;
    }

    const expression = args.values['expr-file']
      ? fs.readFileSync(<string>args.values['expr-file'], { encoding: 'utf8', flag: 'r' })
      : args.positionals[0];

    const compact = <boolean>args.values.compact;

    if (args.values.filename) {
      const inputJSON = fs.readFileSync(<string>args.values.filename, { encoding: 'utf8', flag: 'r' });
      stdout(evaluateResult(inputJSON, expression, compact));
      return;
    }

    const stdin = io.stdin ?? process.stdin;
    let inputJSON = '';
    stdin.setEncoding('utf-8');
    stdin.on('readable', () => {
      const chunk = stdin.read();
      if (chunk !== null) {
        inputJSON += chunk;
      }
    });

    stdin.on('end', () => {
      try {
        stdout(evaluateResult(inputJSON, expression, compact));
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function isMainEntry(): boolean {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  runCli();
}

function getArgs(rawArgs?: string[]) {
  const config: ParseArgsConfig = {
    args: rawArgs,
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

function getHelpText(): string {
  return `
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
      `;
}

function evaluateResult(inputJSON: string, expression: string, compact = false): string {
  if (!inputJSON.trim()) {
    throw new Error('Empty JSON input.');
  }
  const parsedInput = JSON.parse(inputJSON);
  return JSON.stringify(jmespath.search(parsedInput, expression, undefined), null, compact ? 0 : 2);
}
