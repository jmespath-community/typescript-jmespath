import { Bench } from 'tinybench';
import jmespath from '../dist/index.mjs';

const { searchStream, search } = jmespath;

async function runStreamBenchmarks() {
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

  // 2. Memory Footprint Comparison: Buffered search() vs Streaming searchStream()
  if (typeof global.gc === 'function') {
    console.log('\n--- Memory Footprint Comparison (50k items) ---');

    global.gc();
    const memBeforeBuffer = process.memoryUsage().heapUsed;
    const _bufferedResult = search(sampleItems, "[?role == 'admin'].score");
    const memAfterBuffer = process.memoryUsage().heapUsed;
    const bufferDeltaMb = (memAfterBuffer - memBeforeBuffer) / (1024 * 1024);

    global.gc();
    const memBeforeStream = process.memoryUsage().heapUsed;
    let streamSum = 0;
    for await (const score of searchStream(generateItems(), "[?role == 'admin'].score")) {
      streamSum += score;
    }
    const memAfterStream = process.memoryUsage().heapUsed;
    const streamDeltaMb = (memAfterStream - memBeforeStream) / (1024 * 1024);

    console.log(`Buffered search() heap delta: ${bufferDeltaMb.toFixed(2)} MB`);
    console.log(`Streaming searchStream() heap delta: ${streamDeltaMb.toFixed(2)} MB (sum: ${streamSum})`);
  }
}

runStreamBenchmarks().catch(console.error);
