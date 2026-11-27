import { Bench } from 'tinybench';
import jmespath from '../dist/index.mjs';

const { searchStream, search } = jmespath;

// Shared by the two memory arms so they measure the same work. The throughput tasks above keep
// their own literals on purpose: their labels are pinned to those expressions.
const MATCH_EXPR = "[?role == 'admin'].score";

async function runStreamBenchmarks() {
  // The memory section below needs the V8 GC handle: heapUsed without a gc() reads
  // uncollected garbage as footprint. Refuse the run instead of printing the throughput
  // table and skipping the section silently.
  if (typeof global.gc !== 'function') {
    console.error(
      'Memory comparison needs a GC handle. Run `npm run perf:stream` (node --expose-gc scripts/stream-perf.js).',
    );
    process.exit(1);
  }

  console.log('Running JMESPath Streaming Benchmarks...\n');

  const itemCount = 50000;
  const sampleItems = Array.from({ length: itemCount }, (_, i) => ({
    id: i,
    name: `user_${i}`,
    role: i % 5 === 0 ? 'admin' : 'user',
    score: (i * 17) % 100,
    active: i % 2 === 0,
  }));

  async function* generateItems() {
    for (let i = 0; i < sampleItems.length; i++) {
      yield sampleItems[i];
    }
  }

  // 1. Throughput Benchmarks
  const bench = new Bench({
    name: 'Streaming evaluation throughput',
    time: 1000,
    warmupTime: 200,
  });

  bench
    .add('Stream#projection [*].name (50k items)', async () => {
      let count = 0;
      for await (const _ of searchStream(generateItems(), '[*].name')) {
        count++;
      }
      return count;
    })
    .add('Stream#filter [?role == "admin"].score (50k items)', async () => {
      let count = 0;
      for await (const _ of searchStream(generateItems(), "[?role == 'admin'].score")) {
        count++;
      }
      return count;
    })
    .add('Stream#early_termination [:500] from 50k items', async () => {
      let count = 0;
      for await (const _ of searchStream(generateItems(), '[:500]')) {
        count++;
      }
      return count;
    });

  await bench.run();
  console.table(bench.table());

  // 2. Memory Footprint Comparison: Buffered search() vs Streaming searchStream().
  // Both arms yield the same output — every matching score in an array — so their heaps are
  // comparable. churn is the growth the loop left behind (heapUsed after the work, before
  // gc(), minus the baseline); retained is what survives gc(), so it is the footprint the
  // label claims. gc() runs on both sides of every arm, never once before the baseline.
  console.log('\n--- Memory Footprint Comparison ---');

  // A single gc() is not a settled heap: the throughput table above leaves young-generation
  // garbage that one collection only partly reclaims. Settle across a macrotask turn on both
  // sides of every reading.
  const settle = async () => {
    global.gc();
    await new Promise(resolve => {
      setImmediate(resolve);
    });
    global.gc();
  };

  const measureArm = async (label, produce) => {
    // Run the arm once and discard the result: the first call also pays for compiling the
    // expression and for one-time allocations on the path, none of which is the footprint.
    await produce();
    await settle();
    const baseline = process.memoryUsage().heapUsed;
    const output = await produce();
    const churn = process.memoryUsage().heapUsed - baseline;
    await settle();
    return { label, output, churn, retained: process.memoryUsage().heapUsed - baseline };
  };

  const buffered = await measureArm('Buffered search()', () => search(sampleItems, MATCH_EXPR));
  const streamed = await measureArm('Streaming searchStream()', async () => {
    const scores = [];
    for await (const score of searchStream(generateItems(), MATCH_EXPR)) {
      scores.push(score);
    }
    return scores;
  });

  const toMb = bytes => (bytes / (1024 * 1024)).toFixed(2);
  for (const arm of [buffered, streamed]) {
    const perItem = Math.round(arm.retained / itemCount);
    console.log(
      `${arm.label.padEnd(24)} retained ${toMb(arm.retained)} MB | churn ${toMb(arm.churn)} MB | ${perItem} B/item`,
    );
  }

  const sameOutput =
    buffered.output.length === streamed.output.length &&
    buffered.output.every((value, index) => value === streamed.output[index]);
  const sum = streamed.output.reduce((total, score) => total + score, 0);
  console.log(
    `${itemCount} items, ${streamed.output.length} matching scores per arm | ` +
      `expr ${MATCH_EXPR} | equal output: ${sameOutput} | sum: ${sum}`,
  );
  // churn depends on when V8 decides to scavenge, which follows the heap size the throughput
  // table left behind. Read it as the cost of running one arm over another, never as a footprint.
  console.log('retained is the footprint; churn is allocation awaiting collection (relative only).');
}

runStreamBenchmarks().catch(console.error);
