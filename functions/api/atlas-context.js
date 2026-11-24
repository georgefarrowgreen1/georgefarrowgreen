import { atlasServiceStatus, atlasOwner } from "../_atlas-service.js";
import { db } from "../_pigeon.js";
import { todayPrefs, morningTz } from "../_today.js";
import { cardsFor } from "../_todaycards.js";
import { todayLinks } from "../_sites.js";

const MAX_INPUT = 1024, MAX_OUTPUT = 32768;
const HEADERS = {
  "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
};
const fail = (status, code, error) => Response.json({ code, error }, { status, headers: HEADERS });

async function inputOf(request) {
  if (Number(request.headers.get("Content-Length")) > MAX_INPUT) return { status: 413 };
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("Content-Type") || "")) return { status: 415 };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400 };
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0, raw = "", finished = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { finished = true; break; }
      size += value.byteLength;
      if (size > MAX_INPUT) return { status: 413 };
      raw += decoder.decode(value, { stream: true });
    }
    return { body: JSON.parse(raw + decoder.decode()) };
  } catch { return { status: 400 }; }
  finally {
    if (!finished) reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Only an explicitly enabled Fitness schedule calls this route. The caller
// supplies its stored owner ID; this endpoint rechecks today's admin identity
// and reads that same account's current summary without saving a user session.
export async function onRequest({ request, env, waitUntil }) {
  const status = atlasServiceStatus(request, env);
  if (status) return fail(status, "atlas_context_unavailable", "Atlas context is not available for this request.");
  const input = await inputOf(request), body = input.body;
  if (input.status) return fail(input.status, "atlas_context_invalid", "Send a small JSON request with an owner and the Fitness scope.");
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "owner" && key !== "scope")
      || typeof body.owner !== "string" || !body.owner || body.owner.length > 128 || body.scope !== "fitness")
    return fail(400, "atlas_context_invalid", "Only the Fitness scope is supported.");
  try {
    if (!(await atlasOwner(env, body.owner))) return fail(403, "atlas_context_forbidden", "This account cannot use Atlas context.");
    const source = await db(env), primary = source.withSession ? source.withSession("first-primary") : source;
    const user = await primary.prepare("SELECT id,notify_prefs FROM pg_users WHERE id=? AND delete_at IS NULL").bind(body.owner).first();
    if (!user || user.id !== body.owner) return fail(403, "atlas_context_forbidden", "This account cannot use Atlas context.");
    const prefs = await todayPrefs(env, user.id);
    const contextEnv = typeof waitUntil === "function" ? { ...env, waitUntil: promise => waitUntil(promise) } : env;
    // No Authorization, Cookie, client-location or request body reaches a card
    // provider. Only the same owner and timezone used by today/cards are passed.
    const result = await cardsFor(contextEnv, user, { only: ["fitness"], request: null, purpose: "page", tz: morningTz(user, prefs), links: todayLinks(env, null) });
    const fitness = result?.cards?.fitness;
    if (fitness?.state === "empty") return fail(404, "fitness_context_empty", "Open Fitness to create a current summary before using it in a schedule.");
    if (!fitness || fitness.state !== "ok") return fail(503, "fitness_context_unavailable", "The Fitness summary could not be loaded. Try again later.");
    const output = JSON.stringify({ fitness });
    if (new TextEncoder().encode(output).byteLength > MAX_OUTPUT) return fail(503, "fitness_context_unavailable", "The Fitness summary is too large to include in this request.");
    return new Response(output, { headers: { ...HEADERS, "Content-Type": "application/json; charset=utf-8" } });
  } catch {
    // A database or provider exception may contain private content. This API
    // neither logs the raw exception nor returns it to its caller.
    return fail(503, "fitness_context_unavailable", "The Fitness summary could not be loaded. Try again later.");
  }
}
