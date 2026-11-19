// The site's home page (index.html, app.js) as it's sent: its words (functions/_content.js) already in it, so search
// engines and link previews read what the page says, not the defaults it's written with. The page takes them from
// there (asking again only when it's come back from the browser's history, which may keep an older copy, or when they
// couldn't be read here: the page is marked data-words only when they're in it), and its owner edits them there. Its
// scripts and styles are stamped with what's in them (?v=), so a browser never runs a new page with an old copy of any.
import { galleryCollections } from "./_gallery.js";
import { getList } from "./api/background.js";
import { getContent } from "./_content.js";
import { assets } from "./_min.js";
import { HOME_FILES, HOME_STAMPS } from "./_minfresh.js";
import { homeSite, siteOf } from "./_sites.js";
import { hop } from "./_hop.js";

// Link preview readers fetch public metadata without an interactive account session.
// Some stop when the first redirect leaves the shared origin.
const previewReader = /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|Discordbot|LinkedInBot|TelegramBot|Applebot|GoogleMessages|SkypeUriPreview|Iframely/i;
const isPage = (url) => url.pathname === "/" || url.pathname === "/index.html";
// Public visits render immediately. /api/me fills in a recognised home session in place.
// Follow the account handoff when arriving from InFlite; the hop still verifies the session.
export async function homeArrival(ctx, url) {
  if (ctx.request.method !== "GET" || url.hostname !== homeSite(ctx.env) || !isPage(url) ||
    url.searchParams.get("__ifl_account") === "checked" || previewReader.test(ctx.request.headers.get("User-Agent") || "")) return null;
  const referrer = ctx.request.headers.get("Referer");
  if (!referrer || !URL.canParse(referrer)) return null;
  const from = new URL(referrer);
  if (!["https:", "http:"].includes(from.protocol) || siteOf(from.hostname, ctx.env) !== "apps") return null;
  const to = new URL(url); to.searchParams.set("__ifl_account", "checked");
  const start = new URL("/api/hop/start", url); start.searchParams.set("to", to.href);
  // The hop validates the session. An expired cookie follows the same preflight as a guest.
  // For a current session its destination is already this page, so render it immediately.
  try {
    const response = await hop(new Request(start, ctx.request), ctx.env, "start");
    return response.headers.get("Location") === to.href ? null : response;
  } catch {
    // The public bio can still render when account lookup is unavailable.
    return null;
  }
}

const stampOf = async (body) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
// Local builds without embedded fingerprints recheck the files at most once a minute.
let memo = { at: 0, v: null };
async function stamps(ctx, url) {
  if (HOME_STAMPS) return HOME_STAMPS;
  if (memo.v && Date.now() - memo.at < 60e3) return memo.v;
  const out = {};
  await Promise.all(HOME_FILES.map(async (f) => {
    const r = await assets(ctx.env).fetch(new Request(new URL(`/${f}`, url))).catch(() => null);
    if (r?.ok) out[f] = await stampOf(await r.arrayBuffer());
  }));
  if (Object.keys(out).length === HOME_FILES.length) memo = { at: Date.now(), v: out };
  return out;
}

function documentHeaders(res) {
  res.headers.delete("content-length");
  res.headers.delete("etag");
  res.headers.delete("last-modified");
  res.headers.set("Cache-Control", "no-cache");
  return res;
}

function stampAssets(versions) {
  const stamp = (name) => ({ element(el) {
    const path = el.getAttribute(name).split("?")[0], version = versions[path.replace(/^\//, "")];
    if (version) el.setAttribute(name, `${path}?v=${version}`);
  } });
  return new HTMLRewriter().on('link[rel="stylesheet"][href]', stamp("href")).on('script[src]', stamp("src"));
}

export async function homePage(ctx, url, res) {
  const method = ctx.request.method;
  if (method !== "GET" && method !== "HEAD") return res;
  // the script and styles, asked for by the stamp the page gave them: kept for good, as that address only ever means
  // this copy (asked for any other way, or by a stamp that isn't this copy's, they're checked each time)
  const f = url.pathname.slice(1);
  if (HOME_FILES.includes(f) && (res.status === 200 || res.status === 304)) {
    const want = url.searchParams.get("v"), v = want ? (await stamps(ctx, url))[f] : null;
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", want && want === v ? "public, max-age=31536000, immutable" : "no-cache");
    return out;
  }
  const home = isPage(url);
  const known = home || ["/contact/", "/contact/index.html", "/404", "/404.html"].includes(url.pathname);
  const html = response => (response.headers.get("content-type") || "").includes("text/html");
  // A validator for the static template says nothing about current gallery data or asset versions.
  if (res.status === 304 && (known || html(res))) {
    const headers = new Headers(ctx.request.headers);
    headers.delete("if-none-match"); headers.delete("if-modified-since");
    const template = await ctx.env.ASSETS.fetch(new Request(ctx.request, { headers }));
    if (!known && template.status !== 404) return res;
    res = template;
  }
  if (!html(res) || !(res.status === 404 || (known && res.status === 200))) return res;
  if (method === "HEAD") return documentHeaders(new Response(null, res));
  if (!home || res.status === 404) return documentHeaders(stampAssets(await stamps(ctx, url)).transform(res));
  const [c, versions, photos] = await Promise.all([getContent(ctx.env).catch(() => null), stamps(ctx, url), getList(ctx.env).catch(() => null)]);
  const groups = photos && galleryCollections(photos);
  const text = (k) => ({ element: (el) => { if (c) el.setInnerContent(c[k]); } });
  const attr = (k) => ({ element: (el) => { if (c) el.setAttribute("content", c[k]); } });
  const rewriter = stampAssets(versions)
    .on("html", { element: (el) => { if (c) el.setAttribute("data-words", ""); } })
    .on("[data-c=role]", text("role")).on("[data-c=name]", text("name")).on("[data-c=bio]", text("bio"))
    .on("title", { element: (el) => { if (c) el.setInnerContent(c.name); } })
    // (the Person block, as the page writes it too: put in as it is, being a script's, with each "<" written as \u003c
    // so nothing in the words can end the script early)
    .on("#ld-person", { element: (el) => { if (c) el.setInnerContent(JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: c.name, description: c.bio,
      url: "https://georgefarrowgreen.com/", sameAs: ["https://instagram.com/georgefarrowgreen"] }).replace(/</g, "\\u003c"), { html: true }); } })
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', attr("bio"))
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:site_name"]', attr("name"));
  if (groups) {
    for (const [index, group] of groups.entries()) {
      const frame = group[0];
      const selector = `[data-scene="${index}"]`;
      rewriter.on(selector, { element(el) {
        if (!frame) { el.setAttribute("hidden", ""); el.setAttribute("aria-pressed", "false"); return; }
        if (group.length > 1) el.setAttribute("data-collection", encodeURIComponent(JSON.stringify(group)));
        el.setAttribute("data-label", frame.label);
        el.setAttribute("aria-label", "Expand " + frame.label + " photograph");
      } });
      if (!frame) {
        rewriter.on(selector + " img", { element(el) { el.removeAttribute("src"); } });
        continue;
      }
      rewriter.on(selector + " img", { element(el) {
        el.setAttribute("src", frame.src); el.setAttribute("alt", frame.alt);
        el.setAttribute("data-focus", frame.position);
      } });
    }
    const first = groups.findIndex(group => group.length);
    rewriter.on(`[data-scene="${first < 0 ? 2 : first}"]`, { element(el) { el.setAttribute("aria-pressed", "true"); } });
  }
  return documentHeaders(rewriter.transform(res));
}
