#! /usr/bin/env node
const jmespath = require('../dist/lib/index');

process.stdin.setEncoding('utf-8');


if (process.argv.length < 2) {
    console.log("Must provide a jmespath expression.");
    process.exit(1);
}
var inputJSON = "";

process.stdin.on('readable', function() {
    var chunk = process.stdin.read();
    if (chunk !== null) {
        inputJSON += chunk;
    }
});

process.stdin.on('end', function() {
    var parsedInput = JSON.parse(inputJSON);
    const ast = jmespath.compile(process.argv[2]);
    console.log(JSON.stringify(ast));
    console.log(JSON.stringify(jmespath.search(parsedInput, process.argv[2])));
});
