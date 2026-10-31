// A response body read in chunks, for a loading bar. Content-Length is only
// a guide for the bar: a host that compresses (GitHub Pages gzips .wasm)
// sends the compressed length while the body arrives decompressed and
// longer, so every byte is kept whatever the header says.
export async function readBody(response: Response, onProgress: (k: number) => void): Promise<ArrayBuffer> {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const bytes = await response.arrayBuffer();
    onProgress(1);
    return bytes;
  }
  const chunks: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    got += value.length;
    if (total > 0) onProgress(Math.min(0.99, got / total));
  }
  const out = new Uint8Array(got);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  onProgress(1);
  return out.buffer;
}
