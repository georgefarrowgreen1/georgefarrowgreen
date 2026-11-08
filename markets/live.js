// Experimental public Yahoo pricing stream: no account token or API key is sent.
// Only symbols leave the app. HTTP quotes remain the fallback and provide chart/session metadata.
const URL = "wss://streamer.finance.yahoo.com/?version=2";
const SYMBOL = /^[A-Z0-9^][A-Z0-9.=^-]{0,19}$/;
const US = new Set(["Nasdaq", "NYSE", "NYSE American", "NYSE Arca"]);
export const eligible = (q) => q?.kind === "crypto" || q?.type === "CRYPTOCURRENCY" || (US.has(q?.ex) && !/\.L$/.test(q.symbol || "") && ["share", "fund"].includes(q.kind));

// Read the small subset of Yahoo's PricingData protobuf needed for quotes; unknown fields are skipped.
// Wire schema reference: https://github.com/ranaroussi/yfinance/blob/main/yfinance/pricing.proto
export function decodePrice(message) {
  try {
    if (typeof message !== "string" || message.length > 16384) return null;
    const j = JSON.parse(message);
    if (j.type !== "pricing" || typeof j.message !== "string") return null;
    const bytes = Uint8Array.from(atob(j.message), (c) => c.charCodeAt(0)), view = new DataView(bytes.buffer), out = { hours: 0 };
    let i = 0;
    const varint = () => {
      let n = 0n;
      for (let k = 0; k < 10 && i < bytes.length; k++) { const b = bytes[i++]; n |= BigInt(b & 127) << BigInt(k * 7); if (!(b & 128)) return n; }
      throw Error("Invalid varint");
    };
    while (i < bytes.length) {
      const tag = Number(varint()), field = tag >>> 3, wire = tag & 7;
      if (!field) return null;
      if (wire === 0) {
        const n = varint();
        if (field === 3) out.time = Number((n >> 1n) ^ -(n & 1n)) / 1000;
        if (field === 7) out.hours = Number(n);
      } else if (wire === 2) {
        const len = Number(varint()); if (len > bytes.length - i) return null;
        if (field === 1 || field === 4) out[field === 1 ? "symbol" : "currency"] = new TextDecoder().decode(bytes.subarray(i, i + len));
        i += len;
      } else if (wire === 5) { if (i + 4 > bytes.length) return null; if (field === 2) out.price = view.getFloat32(i, true); i += 4; }
      else if (wire === 1) i += 8;
      else return null;
    }
    return i === bytes.length && SYMBOL.test(out.symbol || "") && Number.isFinite(out.price) && out.price > 0 && Number.isFinite(out.time) && out.time > 0 ? out : null;
  } catch (_) { return null; }
}

// A message's own exchange timestamp determines freshness. Receipt time cannot make a delayed quote live.
export function applyTick(q, tick, now = Date.now()) {
  if (!q || !eligible(q) || tick?.symbol !== q.symbol || !Number.isFinite(tick.time) || tick.time * 1000 < now - 90000 || tick.time * 1000 > now + 10000 || !(tick.price > 0) || !Number.isFinite(tick.price)) return q;
  const minor = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" };
  const cur = minor[tick.currency] || tick.currency;
  if (!cur || cur !== q.cur) return q;
  const price = tick.price * (minor[tick.currency] ? 0.01 : 1), crypto = q.kind === "crypto" || q.type === "CRYPTOCURRENCY";
  if (crypto || tick.hours === 1) {
    if (tick.time < Math.max(q.time || 0, q.extended?.time || 0) || (!crypto && q.open && (tick.time < q.open.start || tick.time >= q.open.end))) return q;
    return { ...q, price, time: tick.time, chg: q.prev ? price - q.prev : null, chgPct: q.prev ? (price / q.prev - 1) * 100 : null,
      stale: false, live: { source: "Yahoo Finance", at: now }, extended: null };
  }
  if (![0, 2].includes(tick.hours) || tick.time <= Math.max(q.time || 0, q.extended?.time || 0)) return q;
  return { ...q, extended: { session: tick.hours === 0 ? "pre" : "post", price, time: tick.time,
    chg: q.price != null ? price - q.price : null, chgPct: q.price ? (price / q.price - 1) * 100 : null, live: { source: "Yahoo Finance", at: now } } };
}

// One connection while this view is visible and opted in; bounded reconnects, batched paints, clean account teardown.
export function priceStream({ quotes, symbols, update, enabled, visible, Socket = globalThis.WebSocket, timers = globalThis, now = Date.now }) {
  let socket = null, retry = 0, heartbeat = 0, handshake = 0, flush = 0, attempt = 0, stopped = true, subscribed = new Set();
  const latest = new Map(), pending = new Set();
  const active = () => !stopped && enabled() && visible();
  const wanted = () => [...new Set(symbols())].filter((s) => SYMBOL.test(s) && eligible(quotes()[s])).slice(0, 64);
  function send() {
    if (socket?.readyState !== 1) return;
    const list = wanted(), removed = [...subscribed].filter((s) => !list.includes(s));
    for (const s of removed) latest.delete(s);
    try {
      if (removed.length) socket.send(JSON.stringify({ unsubscribe: removed }));
      if (list.length) socket.send(JSON.stringify({ subscribe: list }));
    } catch (_) { try { socket.close(); } catch (_) {} return; }
    subscribed = new Set(list);
  }
  function connect() {
    retry = 0;
    if (!active() || !Socket || !wanted().length) return;
    let ws;
    try { ws = new Socket(URL); socket = ws; } catch (_) { reconnect(); return; }
    handshake = timers.setTimeout(() => { if (socket === ws) { try { ws.close(); } catch (_) {} } }, 12000);
    ws.onopen = () => { timers.clearTimeout(handshake); handshake = 0; if (socket !== ws || !active()) return; send(); heartbeat = timers.setInterval(send, 15000); };
    ws.onmessage = (event) => {
      if (socket !== ws || !active()) return;
      const tick = decodePrice(event.data);
      if (!tick || !subscribed.has(tick.symbol)) return;
      const q = quotes()[tick.symbol];
      if (applyTick(q, tick, now()) === q) return;
      const prev = latest.get(tick.symbol);
      if (prev && prev.time > tick.time) return;
      attempt = 0; latest.set(tick.symbol, tick); pending.add(tick.symbol);
      if (!flush) flush = timers.setTimeout(() => {
        flush = 0; if (!active()) { pending.clear(); return; }
        const changed = {};
        for (const sym of pending) { const old = quotes()[sym], q = applyTick(old, latest.get(sym), now()); if (q !== old) changed[sym] = q; }
        pending.clear(); if (Object.keys(changed).length) update(changed);
      }, 250);
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onclose = () => { if (socket !== ws) return; socket = null; timers.clearTimeout(handshake); handshake = 0; timers.clearInterval(heartbeat); heartbeat = 0; reconnect(); };
  }
  function reconnect() { if (active() && !retry) retry = timers.setTimeout(connect, Math.min(60000, 2000 * 2 ** Math.min(attempt++, 5))); }
  function stop() {
    stopped = true; timers.clearTimeout(retry); timers.clearTimeout(flush); timers.clearTimeout(handshake); timers.clearInterval(heartbeat);
    retry = flush = heartbeat = handshake = 0; pending.clear(); latest.clear(); subscribed.clear(); attempt = 0;
    const ws = socket; socket = null; if (ws) { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch (_) {} }
  }
  return {
    sync() { if (!enabled() || !visible() || !wanted().length) { stop(); return; } stopped = false; if (socket?.readyState === 1) send(); else if (!socket && !retry) connect(); },
    merge(incoming) { return Object.fromEntries(Object.entries(incoming || {}).map(([s, q]) => [s, latest.has(s) && active() ? applyTick(q, latest.get(s), now()) : q])); },
    stop,
  };
}
