// Independent wire fixture encoder, also used by the browser test.
export function frame(tick) {
  const bytes = [], str = (tag, s) => { const b = new TextEncoder().encode(s); bytes.push(tag, b.length, ...b); };
  str(10, tick.symbol); bytes.push(21);
  const f = new Uint8Array(4); new DataView(f.buffer).setFloat32(0, tick.price, true); bytes.push(...f, 24);
  let n = BigInt(Math.round(tick.time * 1000)) << 1n;
  do { const b = Number(n & 127n); n >>= 7n; bytes.push(b | (n ? 128 : 0)); } while (n);
  str(34, tick.currency || "USD"); bytes.push(56, tick.hours ?? 1);
  return JSON.stringify({ type: "pricing", message: Buffer.from(bytes).toString("base64") });
}
