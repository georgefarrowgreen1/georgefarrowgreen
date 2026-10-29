// The radar for the rain alerts, read on the server the way the app reads it (weather/rainmap.js radarAt), so a
// notification says what the app would: RainViewer's list of frames and its tiles fetched here, their pixels read
// here (functions/_png.js: there's no canvas on the server), each tile at most once a tick however many places are
// under it, and no more than `most` of them a tick. Where the radar sees (its coverage), which hardly changes, is kept
// between ticks for a few hours. Only RainViewer's own tile server is asked, for frames whose addresses are only that.
//
// RAINVIEWER_URL: tests only (a stand-in for RainViewer, and for its tiles).

import { decode, radarAt } from "../weather/rainmap.js";
import { readPng } from "./_png.js";

const UA = { "User-Agent": "georgefarrowgreen-weather/1.0 (+https://weather.inflite.ai)" };
const API = "https://api.rainviewer.com", TILES = "https://tilecache.rainviewer.com", COVER_KEEP = 6 * 3600e3;
const covers = new Map();       // coverage tiles' codes by address, kept between ticks: { at, codes }

// One tick's radar: { at(lat, lon) → { at, steps } (rainmap.js radarAt), or null with no radar to go on }
export function radarForTick(env, t = Date.now(), { most = 150 } = {}) {
  const test = env.RAINVIEWER_URL, tiles = new Map();
  let frames = null, asked = 0;
  const read = (url, cover) => {
    if (asked >= most) return Promise.resolve(null);
    asked++;
    return fetch(url, { headers: UA, signal: AbortSignal.timeout(10000) })
      .then(async (r) => {
        if (!r.ok) return null;
        const img = await readPng(await r.arrayBuffer(), 512);
        return img && img.width === 512 && img.height === 512 ? (cover ? seen(img.rgba) : decode(img.rgba)) : null;
      })
      .catch(() => null);
  };
  const get = (url) => {
    if (!tiles.has(url)) {
      // (the coverage kept between ticks: RainViewer's, not a test's stand-in's, which changes as the tests need)
      const cover = url.includes("/v2/coverage/"), kept = cover && !test ? covers.get(url) : null;
      tiles.set(url, kept && t - kept.at < COVER_KEEP ? Promise.resolve(kept.codes) : read(url, cover).then((codes) => {
        if (cover && codes && !test) { covers.delete(url); covers.set(url, { at: t, codes }); if (covers.size > 40) covers.delete(covers.keys().next().value); }
        return codes;
      }));
    }
    return tiles.get(url);
  };
  return {
    async at(lat, lon) {
      frames ||= fetch(`${test || API}/public/weather-maps.json`, { headers: { ...UA, Accept: "application/json" }, signal: AbortSignal.timeout(8000) })
        .then((r) => (r.ok ? r.json() : null)).then((rv) => trusted(rv, test)).catch(() => null);
      const rv = await frames;
      return rv ? radarAt(lat, lon, rv, get, t).catch(() => null) : null;
    },
  };
}

// RainViewer's frames, only as they should be: on its own tile server (or the tests' stand-in), each frame's time a
// number and its address only that
function trusted(rv, test) {
  const past = (Array.isArray(rv?.radar?.past) ? rv.radar.past : []).filter((f) => Number.isFinite(f?.time) && typeof f.path === "string" && /^\/v2\/radar\/[\w-]{1,64}$/.test(f.path)).slice(-13);
  return past.length ? { host: test ? rv.host : TILES, radar: { past } } : null;
}
// A coverage tile's pixels → codes as the app's are: 0 where the radar sees (clear), 1 where it doesn't
function seen(rgba) {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 3, o = 0; i < rgba.length; i += 4, o++) out[o] = rgba[i] ? 1 : 0;
  return out;
}
