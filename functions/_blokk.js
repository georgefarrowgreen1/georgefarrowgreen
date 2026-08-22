// Publishes exactly one page out of blokk/: the browser demo, behind a
// password.
//
// wrangler.toml sets pages_build_output_dir = ".", so the whole repo root
// ships as static assets. blokk/ is source, and stays unreadable — only the
// demo is surfaced, at /blokk. Everything else under /blokk/* still 404s,
// including the demo's own asset path, so there is one public URL for it and
// the gate below cannot be walked around by asking for the file directly.
//
// The demo is the right surface to publish: blokk/demo/index.html inlines the
// engine and talks to nothing, whereas blokk/web/index.html drives eight
// /api/v1/* endpoints on the Mac and would render a dead shell here.
// It has no relative src/href of its own, so serving it from /blokk rather
// than its own directory breaks no links.

const DEMO = "/blokk/demo/";   // pretty path — ASSETS wants the directory,
                               // not /blokk/demo/index.html
const COOKIE = "blokk_demo";
const TTL_MS = 1000 * 60 * 60 * 12;          // a demo link, not a login

// Deliberately NOT the site's session cookie or EDIT_PASSWORD. Reusing
// _auth.js here would mean this password minted a token that unlocks the
// owner's edit mode — a demo gate must never be a way into the real site.
const password = (env) => String(env.DEMO_PASSWORD || "test");

const enc = (s) => new TextEncoder().encode(s);

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", enc(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc(data)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Length is not a secret worth protecting here, but a byte-by-byte bail on
// the first wrong character is a habit worth not forming.
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function cookieValue(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// The key is derived from the password, so changing DEMO_PASSWORD invalidates
// every ticket already issued instead of leaving them valid forever.
async function issue(env) {
  const exp = Date.now() + TTL_MS;
  const payload = btoa(String(exp));
  return `${payload}.${await hmac(password(env), payload)}`;
}

async function admitted(request, env) {
  const t = cookieValue(request, COOKIE);
  if (!t) return false;
  const [payload, sig] = t.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, await hmac(password(env), payload))) return false;
  const exp = parseInt(atob(payload), 10);
  return Number.isFinite(exp) && Date.now() < exp;
}

export function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "no-store",
    },
  });
}

const gate = (wrong) => new Response(`<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blokk — demo</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0a0a0b;
    color:#f4f4f5;font:16px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;padding:24px}
  form{width:100%;max-width:340px;background:#141416;border:1px solid #262629;
    border-radius:18px;padding:28px}
  h1{margin:0 0 6px;font-size:19px;letter-spacing:-.01em}
  p{margin:0 0 20px;color:#a1a1aa;font-size:14px}
  label{display:block;font-size:13px;color:#a1a1aa;margin-bottom:7px}
  input{width:100%;padding:11px 13px;border-radius:11px;border:1px solid #313135;
    background:#09090b;color:#f4f4f5;font-size:16px}
  input:focus{outline:2px solid #2f6df6;outline-offset:1px;border-color:transparent}
  button{width:100%;margin-top:14px;padding:11px;border:0;border-radius:11px;
    background:#2f6df6;color:#fff;font-size:15px;font-weight:600;cursor:pointer}
  button:active{transform:scale(.99)}
  .no{margin:14px 0 0;color:#f87171;font-size:13px}
</style>
<form method="POST" action="/blokk">
  <h1>Blokk</h1>
  <p>A private demo. Everything in it is invented.</p>
  <label for="p">Password</label>
  <input id="p" name="password" type="password" autocomplete="current-password"
         autofocus required>
  <button type="submit">Open the demo</button>
  ${wrong ? '<p class="no">That is not it. Try again.</p>' : ""}
</form>`, {
  status: 401,
  headers: {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  },
});

export async function serveDemo(ctx) {
  const { request, env } = ctx;

  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get("password") ?? "");
    if (!safeEqual(given, password(env))) return gate(true);
    return new Response(null, {
      status: 303,                       // 303 so a refresh does not re-POST
      headers: {
        Location: "/blokk",
        "Set-Cookie": `${COOKIE}=${await issue(env)}; HttpOnly; Secure; ` +
          `SameSite=Lax; Path=/blokk; Max-Age=${Math.floor(TTL_MS / 1000)}`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (!(await admitted(request, env))) return gate(false);

  const asset = await env.ASSETS.fetch(new URL(DEMO, request.url));
  // A missing asset must not surface as a 200 with an error page in it.
  if (!asset.ok) return notFound();
  const headers = new Headers(asset.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  // Never let a cache hand the page to someone who has not been through the
  // gate. Vary matters as much as no-store: the response differs by cookie.
  headers.set("Cache-Control", "no-store");
  headers.set("Vary", "Cookie");
  headers.set("X-Robots-Tag", "noindex");
  return new Response(asset.body, { status: 200, headers });
}

// /block was asked for by name; /blokk is the product's spelling and the
// directory here, so it is canonical and the other redirects to it.
export function toCanonical({ request }) {
  const { search } = new URL(request.url);
  return Response.redirect(new URL("/blokk" + search, request.url).toString(), 301);
}
