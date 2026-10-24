import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import jmespath from '../src';

const { compileQuery, searchStream } = jmespath;

describe('searchStream', () => {
  const sampleUsers = [
    { id: 1, name: 'Alice', role: 'admin', score: 95, active: true },
    { id: 2, name: 'Bob', role: 'user', score: 70, active: false },
    { id: 3, name: 'Charlie', role: 'admin', score: 88, active: true },
    { id: 4, name: 'Dana', role: 'user', score: 60, active: true },
  ];

  async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T, void, unknown> {
    for (const item of items) {
      yield item;
    }
  }

  async function collectStream<T>(generator: AsyncIterable<T>): Promise<T[]> {
    const results: T[] = [];
    for await (const item of generator) {
      results.push(item);
    }
    return results;
  }

  describe('Basic projection and filter streaming', () => {
    it('should stream wildcard projection [*].name', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('should stream identity wildcard [*]', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*]'));
      expect(results).toEqual(sampleUsers);
    });

    it('should stream filter projection [?role == `admin`].name', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, "[?role == 'admin'].name"));
      expect(results).toEqual(['Alice', 'Charlie']);
    });

    it('should stream filter projection [?role == `admin`] yielding entire matching records', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, "[?role == 'admin']"));
      expect(results).toEqual([sampleUsers[0], sampleUsers[2]]);
    });

    it('should stream top-level field extraction per record', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, 'name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('should stream subexpressions on nested records', async () => {
      const nested = [
        { user: { profile: { email: 'alice@example.com' } } },
        { user: { profile: { email: 'bob@example.com' } } },
        { user: null },
      ];
      const source = createAsyncGenerator(nested);
      const results = await collectStream(searchStream(source, 'user.profile.email'));
      expect(results).toEqual(['alice@example.com', 'bob@example.com']);
    });
  });

  describe('Dual signature support', () => {
    it('supports (source, expression) argument order', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('supports (expression, source) argument order', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream('[*].name', source));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('supports precompiled AST ExpressionNode in both argument orders', async () => {
      const ast = jmespath.compile('[*].name');
      const source1 = createAsyncGenerator(sampleUsers);
      const results1 = await collectStream(searchStream(source1, ast));
      expect(results1).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);

      const source2 = createAsyncGenerator(sampleUsers);
      const results2 = await collectStream(searchStream(ast, source2));
      expect(results2).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('throws TypeError if expression is missing or not a string', async () => {
      // @ts-expect-error testing invalid signature
      await expect(collectStream(searchStream(123, 456))).rejects.toThrow(TypeError);
    });

    it('throws TypeError if source is invalid', async () => {
      // @ts-expect-error testing invalid source
      await expect(collectStream(searchStream('[*].name', 123))).rejects.toThrow(TypeError);
    });
  });

  describe('Stream source variety (WHATWG, Node, Iterable)', () => {
    it('consumes WHATWG ReadableStream', async () => {
      const readableStream = new ReadableStream({
        start(controller) {
          for (const user of sampleUsers) {
            controller.enqueue(user);
          }
          controller.close();
        },
      });

      const results = await collectStream(searchStream(readableStream, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('consumes Node.js stream.Readable', async () => {
      const nodeStream = Readable.from(sampleUsers);
      const results = await collectStream(searchStream(nodeStream, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('consumes synchronous Iterable (array)', async () => {
      const results = await collectStream(searchStream(sampleUsers, "[?role == 'admin'].name"));
      expect(results).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('compileQuery.searchStream integration', () => {
    it('evaluates searchStream via compiled query instance', async () => {
      const query = compileQuery<string>("[?role == 'admin'].name");
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(query.searchStream(source));
      expect(results).toEqual(['Alice', 'Charlie']);
    });
  });

  describe('NDJSON / JSON lines chunk parsing', () => {
    it('parses multi-line NDJSON string chunks automatically', async () => {
      const ndjsonChunks = ['{"id": 1, "name": "Alice"}\n{"id": 2, "name": "Bob"}\n', '{"id": 3, "name": "Charlie"}\n'];
      const source = createAsyncGenerator(ndjsonChunks);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('handles lines split across chunk boundaries', async () => {
      const splitChunks = ['{"id": 1, "name": "Al', 'ice"}\n{"id": 2, "name": "', 'Bob"}\n'];
      const source = createAsyncGenerator(splitChunks);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob']);
    });

    it('handles Uint8Array chunks via TextDecoder', async () => {
      const encoder = new TextEncoder();
      const byteChunks = [encoder.encode('{"id": 1, "name": "Alice"}\n'), encoder.encode('{"id": 2, "name": "Bob"}\n')];
      const source = createAsyncGenerator(byteChunks);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob']);
    });

    it('passes raw strings when parseJson is false', async () => {
      const stringChunks = ['foo', 'bar', 'baz'];
      const source = createAsyncGenerator(stringChunks);
      const results = await collectStream(searchStream(source, '@', { parseJson: false }));
      expect(results).toEqual(['foo', 'bar', 'baz']);
    });
  });

  describe('Array chunk flattening', () => {
    it('flattens array chunks by default', async () => {
      const batches = [
        [sampleUsers[0], sampleUsers[1]],
        [sampleUsers[2], sampleUsers[3]],
      ];
      const source = createAsyncGenerator(batches);
      const results = await collectStream(searchStream(source, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('preserves array chunks when flattenChunks is false', async () => {
      const batches = [
        [{ id: 1 }, { id: 2 }],
        [{ id: 3 }, { id: 4 }],
      ];
      const source = createAsyncGenerator(batches);
      const results = await collectStream(searchStream(source, '@', { flattenChunks: false }));
      expect(results).toEqual(batches);
    });
  });

  describe('Slicing and early termination', () => {
    it('evaluates top-level slice [:2] and stops early', async () => {
      let yieldedCount = 0;
      async function* infiniteUsers() {
        for (const user of sampleUsers) {
          yieldedCount++;
          yield user;
        }
      }

      const results = await collectStream(searchStream(infiniteUsers(), '[:2]'));
      expect(results).toEqual([sampleUsers[0], sampleUsers[1]]);
      expect(yieldedCount).toBe(2);
    });

    it('supports slice with step [:4:2]', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[:4:2]'));
      expect(results).toEqual([sampleUsers[0], sampleUsers[2]]);
    });

    it('supports limit option for early termination', async () => {
      let count = 0;
      async function* countGenerator() {
        for (let i = 0; i < 100; i++) {
          count++;
          yield { num: i };
        }
      }

      const results = await collectStream(searchStream(countGenerator(), '[*].num', { limit: 3 }));
      expect(results).toEqual([0, 1, 2]);
      expect(count).toBe(3);
    });

    it('calls iterator return() when consumer breaks early', async () => {
      let returnCalled = false;
      const customIterable: AsyncIterable<{ num: number }> = {
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              return { done: i >= 10, value: { num: i++ } };
            },
            async return() {
              returnCalled = true;
              return { done: true, value: undefined };
            },
          };
        },
      };

      for await (const item of searchStream(customIterable, '[*].num')) {
        if (item === 1) {
          break;
        }
      }

      expect(returnCalled).toBe(true);
    });
  });

  describe('Pipes and terminal aggregations', () => {
    it('streams through multi-stage pipe [?active] | [*].name', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[?active] | [*].name'));
      expect(results).toEqual(['Alice', 'Charlie', 'Dana']);
    });

    it('evaluates terminal aggregation sum(@)', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*].score | sum(@)'));
      expect(results).toEqual([95 + 70 + 88 + 60]);
    });

    it('evaluates terminal sort(@)', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*].name | sort(@)'));
      expect(results).toEqual([['Alice', 'Bob', 'Charlie', 'Dana']]);
    });

    it('evaluates top-level length(@) on stream', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, 'length(@)'));
      expect(results).toEqual([4]);
    });
  });

  describe('Security options', () => {
    it('enforces maxOutputSize on streamed results', async () => {
      const source = createAsyncGenerator(sampleUsers);
      await expect(collectStream(searchStream(source, '[*].name', { maxOutputSize: 2 }))).rejects.toThrow(
        'Output size exceeds maximum allowed size of 2',
      );
    });

    it('enforces timeoutMs during streaming', async () => {
      async function* slowGenerator() {
        for (const user of sampleUsers) {
          await new Promise(r => setTimeout(r, 20));
          yield user;
        }
      }

      await expect(collectStream(searchStream(slowGenerator(), '[*].name', { timeoutMs: 15 }))).rejects.toThrow(
        'Query execution timed out after 15ms',
      );
    });

    it('enforces disallowedFunctions during stream evaluation', async () => {
      const source = createAsyncGenerator(sampleUsers);
      await expect(
        collectStream(searchStream(source, 'sort_by(@, &score)', { disallowedFunctions: ['sort_by'] })),
      ).rejects.toThrow("Function 'sort_by' is disallowed");

      const source2 = createAsyncGenerator(sampleUsers);
      await expect(
        collectStream(searchStream(source2, "[?contains(name, 'A')].name", { disallowedFunctions: ['contains'] })),
      ).rejects.toThrow("Function 'contains' is disallowed");
    });

    it('enforces maxOutputSize on terminal non-streamable pipe stage', async () => {
      const source = createAsyncGenerator(sampleUsers);
      await expect(
        collectStream(searchStream(source, '[*] | sort_by(@, &score)', { maxOutputSize: 2 })),
      ).rejects.toThrow('Output size exceeds maximum allowed size of 2');
    });

    it('enforces maxOutputSize on non-streamable root node', async () => {
      const source = createAsyncGenerator(sampleUsers);
      await expect(collectStream(searchStream(source, 'sort(@)', { maxOutputSize: 2 }))).rejects.toThrow(
        'Output size exceeds maximum allowed size of 2',
      );
    });
  });

  describe('Edge cases and fallbacks', () => {
    it('returns empty generator when source is null or undefined', async () => {
      // @ts-expect-error null source test
      const results = await collectStream(searchStream(null, '[*].name'));
      expect(results).toEqual([]);
    });

    it('supports streams with getReader fallback', async () => {
      let index = 0;
      const mockReaderStream = {
        getReader() {
          return {
            async read() {
              if (index < sampleUsers.length) {
                return { done: false, value: sampleUsers[index++] };
              }
              return { done: true, value: undefined };
            },
            releaseLock() {},
          };
        },
      };

      const results = await collectStream(searchStream(mockReaderStream as unknown as ReadableStream, '[*].name'));
      expect(results).toEqual(['Alice', 'Bob', 'Charlie', 'Dana']);
    });

    it('parses boolean, null, and number literals in NDJSON', async () => {
      const ndjson = 'true\nfalse\nnull\n42\n';
      const source = createAsyncGenerator([ndjson]);
      const results = await collectStream(searchStream(source, '@'));
      expect(results).toEqual([true, false, null, 42]);
    });

    it('throws SyntaxError when parseJson is true with malformed JSON', async () => {
      const source = createAsyncGenerator(['{invalid json}\n']);
      await expect(collectStream(searchStream(source, '@', { parseJson: true }))).rejects.toThrow(SyntaxError);
    });

    it('evaluates projection with non-field expression', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[*].to_string(score)'));
      expect(results).toEqual(['95', '70', '88', '60']);
    });

    it('evaluates filter projection with non-field expression', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[?active].to_string(score)'));
      expect(results).toEqual(['95', '88', '60']);
    });

    it('evaluates negative slice by accumulating stream elements', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[-2:]'));
      expect(results).toEqual([sampleUsers[2], sampleUsers[3]]);
    });

    it('ignores field extraction on primitive items', async () => {
      const source = createAsyncGenerator([1, 'string', null]);
      const results = await collectStream(searchStream(source, 'name'));
      expect(results).toEqual([]);
    });

    it('evaluates index expression on individual records', async () => {
      const records = [{ items: ['a', 'b'] }, { items: ['c', 'd'] }];
      const source = createAsyncGenerator(records);
      const results = await collectStream(searchStream(source, 'items[0]'));
      expect(results).toEqual(['a', 'c']);
    });

    it('evaluates slice projection [:2].name', async () => {
      const source = createAsyncGenerator(sampleUsers);
      const results = await collectStream(searchStream(source, '[:2].name'));
      expect(results).toEqual(['Alice', 'Bob']);
    });

    it('evaluates general multiselect hash expression on stream', async () => {
      const source = createAsyncGenerator(sampleUsers.slice(0, 2));
      const results = await collectStream(searchStream(source, '{ userName: name, userScore: score }'));
      expect(results).toEqual([
        { userName: 'Alice', userScore: 95 },
        { userName: 'Bob', userScore: 70 },
      ]);
    });
  });
});
