// How signing in is going, in counts only: per London day, how many sign-ins of each kind worked and how many didn't,
// and what the sign-in page saw go wrong in the browser (a passkey cancelled, one that couldn't be used, offline, no
// WebAssembly). Never who, which account, which address or which device: a day, a kind and a number. Kept 60 days.
// Shown to the site's admin under Insights (functions/_insights.js), so a "sign-in's stuck" turns up as a number.
//   count(env, kind)            one more of a kind today (never fails the request it's counted from)
//   SAID                        the kinds the sign-in page may tell (POST /api/account/signin/said)
//   counts(D, first, last, off) → { kind: [n per day, oldest first] } for London days first..last
import { db, DAY, londonOffset } from "./_pigeon.js";

// (the server's own: a sign-in made, or refused, by way; a code or a hop that came back no good)
export const KINDS = ["ok-password", "ok-passkey", "ok-qr", "bad-password", "bad-passkey", "handback-failed", "hop-failed"];
// (the browser's own, as the sign-in page tells them)
export const SAID = ["passkey-cancelled", "passkey-unusable", "offline", "no-wasm", "error"];
const ALL = new Set([...KINDS, ...SAID]);

export async function count(env, kind, t = Date.now()) {
  if (!ALL.has(kind)) return;
  try {
    const D = await db(env), day = Math.floor((t + londonOffset(t)) / DAY);
    await D.batch([
      D.prepare("INSERT INTO pg_signin_counts (day, kind, n) VALUES (?, ?, 1) ON CONFLICT (day, kind) DO UPDATE SET n = n + 1").bind(day, kind),
      // (now and then, the days past 60 let go)
      ...(Math.random() < 0.02 ? [D.prepare("DELETE FROM pg_signin_counts WHERE day < ?").bind(day - 60)] : []),
    ]);
  } catch (_) { /* a count missed, never a sign-in */ }
}

export async function counts(D, first, last) {
  const { results } = await D.prepare("SELECT day, kind, n FROM pg_signin_counts WHERE day >= ? AND day <= ?").bind(first, last).all();
  const out = {};
  for (const k of ALL) out[k] = Array.from({ length: last - first + 1 }, () => 0);
  for (const r of results || []) if (out[r.kind] && r.day >= first && r.day <= last) out[r.kind][r.day - first] = r.n || 0;
  return out;
}
