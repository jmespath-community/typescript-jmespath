#! /usr/bin/env node

'use strict';

const jmespath = require('../dist/jmespath.umd.min');
const { parseArgs } = require('node:util');
const fs = require('fs');

const args = getArgs();


if (args.values.help) {
  printHelp();
  process.exit(0);
}

if (!args.values['expr-file'] && args.positionals.length < 1) {
  console.log('Must provide a jmespath expression.');
  process.exit(1);
}


var expression = '';
if (args.values['expr-file']) {
  expression = fs.readFileSync(args.values['expr-file'], { encoding: 'utf8', flag: 'r' });
} else {
  expression = args.positionals[0];
}


var inputJSON = '';
if (args?.values?.filename) {
  inputJSON = fs.readFileSync(args.values.filename, { encoding: 'utf8', flag: 'r' });
  printResult(inputJSON, expression, args.values.compact);

} else {

  process.stdin.setEncoding('utf-8');
  process.stdin.on('readable', function () {
    var chunk = process.stdin.read();
    if (chunk !== null) {
      inputJSON += chunk;
    }
  });

  process.stdin.on('end', function () {
    printResult(inputJSON, expression, args.values.compact);
  });
}


function getArgs() {
  const options = {
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
    }
  };

  return parseArgs({ options, allowPositionals: true });
}

function printHelp() {
  const pkg = require('../package.json');
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

function printResult(inputJSON, expression, compact = false) {
  try {
    var parsedInput = JSON.parse(inputJSON);
    console.log(JSON.stringify(jmespath.search(parsedInput, expression, null, compact), null, compact ? 0 : 2));
  } catch (e) {
    console.error('Error parsing JSON input:', e.message);
    process.exit(1);
  }
}
