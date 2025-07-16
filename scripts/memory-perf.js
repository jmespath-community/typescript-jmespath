const jmespath = require('../dist/lib/src');

// Memory allocation analysis script
function analyzeMemoryUsage() {
  if (typeof global.gc !== 'function') {
    console.log('Run with --expose-gc flag to enable garbage collection');
    return;
  }

  console.log('Memory Allocation Pattern Analysis\n');

  // Test data
  const simpleData = { foo: { bar: 'baz' } };
  const arrayData = {
    items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `item${i}`,
      price: i * 10,
      tags: [`tag${i}`, `category${i % 10}`],
    })),
  };
  const _nestedData = { level1: { level2: { level3: { level4: { value: 42 } } } } };

  function measureMemory(name, fn, iterations = 10000) {
    // Force GC before measurement
    global.gc();
    const startMemory = process.memoryUsage();

    const startTime = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) {
      fn();
    }
    const endTime = process.hrtime.bigint();

    // Force GC after operations
    global.gc();
    const endMemory = process.memoryUsage();

    const memoryDelta = {
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      heapTotal: endMemory.heapTotal - startMemory.heapTotal,
      external: endMemory.external - startMemory.external,
      rss: endMemory.rss - startMemory.rss,
    };

    const timeMs = Number(endTime - startTime) / 1000000;
    const avgTimePerOp = timeMs / iterations;
    const memoryPerOp = memoryDelta.heapUsed / iterations;

    console.log(`${name}:`);
    console.log(`  Time: ${timeMs.toFixed(2)}ms (${avgTimePerOp.toFixed(4)}ms/op)`);
    console.log(`  Memory per operation: ${memoryPerOp.toFixed(2)} bytes`);
    console.log(`  Total heap delta: ${(memoryDelta.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Operations/sec: ${(iterations / (timeMs / 1000)).toFixed(0)}`);
    console.log('');

    return { memoryPerOp, avgTimePerOp, opsPerSec: iterations / (timeMs / 1000) };
  }

  // Parsing memory analysis
  console.log('=== PARSING MEMORY ANALYSIS ===');

  measureMemory('Simple Expression Parse', () => {
    jmespath.compile('foo.bar');
  });

  measureMemory('Complex Expression Parse', () => {
    jmespath.compile('items[?price > `500`].name');
  });

  measureMemory('Deep Nesting Parse', () => {
    jmespath.compile('level1.level2.level3.level4.value');
  });

  measureMemory('Function Call Parse', () => {
    jmespath.compile('sort_by(items, &price)');
  });

  // Evaluation memory analysis
  console.log('=== EVALUATION MEMORY ANALYSIS ===');

  measureMemory('Simple Field Access', () => {
    jmespath.search(simpleData, 'foo.bar');
  });

  measureMemory('Array Projection', () => {
    jmespath.search(arrayData, 'items[*].name');
  });

  measureMemory('Filter Projection', () => {
    jmespath.search(arrayData, 'items[?price > `500`].name');
  });

  measureMemory('Function Call', () => {
    jmespath.search(arrayData, 'length(items)');
  });

  measureMemory('Complex Function', () => {
    jmespath.search(arrayData, 'sort_by(items, &price)');
  });

  // Token allocation analysis
  console.log('=== TOKEN ALLOCATION ANALYSIS ===');

  measureMemory('Simple Tokenization', () => {
    jmespath.tokenize('foo.bar');
  });

  measureMemory('Complex Tokenization', () => {
    jmespath.tokenize('items[?price > `500` && contains(tags, `"category1"`)].name');
  });

  // Combined parse + eval analysis
  console.log('=== COMBINED PARSE + EVAL ANALYSIS ===');

  measureMemory('Full Pipeline Simple', () => {
    jmespath.search(simpleData, 'foo.bar');
  });

  measureMemory('Full Pipeline Complex', () => {
    jmespath.search(arrayData, 'items[?price > `500`].name');
  });

  // Pre-compiled vs fresh parse comparison
  console.log('=== PRE-COMPILED VS FRESH PARSE ===');

  const compiledExpr = jmespath.compile('items[?price > `500`].name');

  measureMemory('Fresh Parse + Eval', () => {
    jmespath.search(arrayData, 'items[?price > `500`].name');
  });

  measureMemory('Pre-compiled Eval', () => {
    jmespath.TreeInterpreter.search(compiledExpr, arrayData);
  });
}

analyzeMemoryUsage();
