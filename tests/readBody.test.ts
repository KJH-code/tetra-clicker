import { describe, expect, it } from 'vitest';
import { readBody } from '../src/engine/readBody';

const body = (chunks: number[][], length: number): Response => new Response(new ReadableStream({
  start(c) { for (const ch of chunks) c.enqueue(new Uint8Array(ch)); c.close(); },
}), { headers: { 'content-length': String(length) } });

describe('engine download', () => {
  it('keeps every byte when the body is longer than Content-Length (a gzipped host)', async () => {
    // The bug: a 3-byte compressed length cut a 6-byte body short.
    const seen: number[] = [];
    const bytes = new Uint8Array(await readBody(body([[1, 2, 3], [4, 5, 6]], 3), (k) => seen.push(k)));
    expect([...bytes]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((k) => k <= 1)).toBe(true);
  });

  it('reports progress through an uncompressed download', async () => {
    const seen: number[] = [];
    const bytes = new Uint8Array(await readBody(body([[1, 2], [3, 4]], 4), (k) => seen.push(k)));
    expect([...bytes]).toEqual([1, 2, 3, 4]);
    expect(seen).toEqual([0.5, 0.99, 1]);
  });
});
