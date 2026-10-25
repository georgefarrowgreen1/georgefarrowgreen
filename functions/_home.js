// The site's home page (index.html, app.js) as it's sent: its words (functions/_content.js) already in it, so search
// engines and link previews read what the page says, not the defaults it's written with. The page takes them from
// there (asking again only when it's come back from the browser's history, which may keep an older copy, or when they
// couldn't be read here: the page is marked data-words only when they're in it), and its owner edits them there. Its
// scripts and styles are stamped with what's in them (?v=), so a browser never runs a new page with an old copy of any.
import { getContent } from "./_content.js";

const isPage = (url) => url.pathname === "/" || url.pathname === "/index.html";
const STAMPED = ["styles.css", "app.js", "404.js", "signedin.js"];
const stampOf = async (body) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
// (worked out once a minute by each copy of the server, not for every visit: the files only change with a deploy)
let memo = { at: 0, v: null };
async function stamps(ctx, url) {
  if (memo.v && Date.now() - memo.at < 60e3) return memo.v;
  const out = {};
  await Promise.all(STAMPED.map(async (f) => {
    const r = await ctx.env.ASSETS.fetch(new Request(new URL(`/${f}`, url))).catch(() => null);
    if (r?.ok) out[f] = await stampOf(await r.arrayBuffer());
  }));
  if (Object.keys(out).length === STAMPED.length) memo = { at: Date.now(), v: out };
  return out;
}

export async function homePage(ctx, url, res) {
  // the script and styles, asked for by the stamp the page gave them: kept for good, as that address only ever means
  // this copy (asked for any other way, or by a stamp that isn't this copy's, they're checked each time)
  const f = url.pathname.slice(1);
  if (STAMPED.includes(f) && ctx.request.method === "GET" && res.status === 200) {
    const want = url.searchParams.get("v"), v = want ? (await stamps(ctx, url))[f] : null;
    const out = new Response(res.body, res);
    out.headers.set("Cache-Control", want && want === v ? "public, max-age=31536000, immutable" : "no-cache");
    return out;
  }
  // the page for an address that isn't one (404.html), with its styles and script stamped the same way: asked for
  // plain, they can be kept for hours on the way, and the page then drawn with an older copy of either
  if (res.status === 404 && ctx.request.method === "GET" && (res.headers.get("content-type") || "").includes("text/html")) {
    const v = await stamps(ctx, url);
    const stamp = (name) => ({ element: (el) => { const f = (el.getAttribute(name) || "").split("?")[0].replace(/^\//, ""); if (v[f]) el.setAttribute(name, `/${f}?v=${v[f]}`); } });
    const out = new HTMLRewriter().on('link[rel="stylesheet"][href^="/styles.css"]', stamp("href")).on('script[src^="/404.js"]', stamp("src")).transform(res);
    out.headers.delete("content-length"); out.headers.delete("etag");
    out.headers.set("Cache-Control", "no-cache");
    return out;
  }
  if (!isPage(url) || ctx.request.method !== "GET" || res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const [c, v] = await Promise.all([getContent(ctx.env).catch(() => null), stamps(ctx, url)]);
  const text = (k) => ({ element: (el) => { if (c) el.setInnerContent(c[k]); } });
  const attr = (k) => ({ element: (el) => { if (c) el.setAttribute("content", c[k]); } });
  const stamp = (name) => ({ element: (el) => { const f = (el.getAttribute(name) || "").split("?")[0]; if (v[f]) el.setAttribute(name, `${f}?v=${v[f]}`); } });
  const out = new HTMLRewriter()
    .on("html", { element: (el) => { if (c) el.setAttribute("data-words", ""); } })
    .on("[data-c=role]", text("role")).on("[data-c=name]", text("name")).on("[data-c=bio]", text("bio"))
    .on("title", { element: (el) => { if (c) el.setInnerContent(c.name); } })
    // (the Person block, as the page writes it too: put in as it is, being a script's, with each "<" written as \u003c
    // so nothing in the words can end the script early)
    .on("#ld-person", { element: (el) => { if (c) el.setInnerContent(JSON.stringify({ "@context": "https://schema.org", "@type": "Person", name: c.name, description: c.bio,
      url: "https://georgefarrowgreen.com/", sameAs: ["https://instagram.com/georgefarrowgreen"] }).replace(/</g, "\\u003c"), { html: true }); } })
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', attr("bio"))
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:site_name"]', attr("name"))
    .on('link[rel="stylesheet"][href^="styles.css"]', stamp("href")).on('script[src^="app.js"], script[src^="signedin.js"]', stamp("src"))
    .transform(res);
  out.headers.delete("content-length"); out.headers.delete("etag");
  out.headers.set("Cache-Control", "no-cache");
  return out;
}
