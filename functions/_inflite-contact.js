import { body, json } from "./_accountapi.js";
import { clientIp, clientNet, EMAIL_RE, hex, HttpError, limit } from "./_pigeon.js";
import { saveMessage } from "./_messages.js";

const invalid = () => json({ error: "Invalid contact message." }, 400);
const busy = () => json({ error: "Contact is unavailable." }, 503);
const DAY = 86400000;
const noControls = /[\u0000-\u001f\u007f]/u;
const noBodyControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

async function countNetwork(env, request) {
  // The existing limiter needs stable keys within a window, not the network address itself.
  const encode = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encode.encode(env.HUB_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const networkKey = async network => hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encode.encode("inflite-contact:" + network))));
  await limit(env, "ifl-contact:hour:" + await networkKey(clientIp(request)), 5, DAY / 24);
  await limit(env, "ifl-contact:day:" + await networkKey(clientNet(request)), 10, DAY);
  await limit(env, "ifl-contact:store", 150, DAY);
}

// The middleware strips any unauthenticated hub headers before dispatch.
export async function infliteContact({ request, env }) {
  if (new URL(request.url).origin !== "https://account.inflite.ai" || request.headers.get("X-Hub-Ok") !== "1") return json({ error: "Not found." }, 404);
  if (request.method !== "POST") return json({ error: "Method unavailable." }, 405);
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "Use JSON." }, 415);
  if (!env.DB || !env.HUB_KEY || !request.headers.get("X-Hub-IP")) return busy();
  let input;
  try { input = await body(request, 24 * 1024); } catch (error) {
    return error?.status === 413 ? json({ error: "Message too large." }, 413) : invalid();
  }
  if (Object.keys(input).some(key => !["name", "email", "message", "website"].includes(key)) ||
      (input.website !== undefined && input.website !== "") ||
      !["name", "email", "message"].every(key => typeof input[key] === "string")) return invalid();
  const name = input.name.trim(), email = input.email.trim(), message = input.message.trim();
  if (!name || name.length > 100 || noControls.test(name) || email.length > 254 || !EMAIL_RE.test(email) ||
      !message || message.length > 4000 || noBodyControls.test(message)) return invalid();

  try {
    await countNetwork(env, request);
    await saveMessage(env, { name, email, body: message });
    return json({ ok: true }, 201);
  } catch (error) {
    if (error instanceof HttpError && error.status === 429) return json({ error: "Please try again later." }, 429);
    return busy();
  }
}
