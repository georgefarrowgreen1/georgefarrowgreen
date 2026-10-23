// The site's home page (index.html, app.js) as it's sent: its words (functions/_content.js) already in it, so search
// engines and link previews read what the page says, not the defaults it's written with. The page fills them in
// again when it loads (and its owner edits them there). Its script and styles are stamped with what's in them (?v=),
// so a browser never runs a new page with an old copy of either.
import { getContent } from "./_content.js";

const isPage = (url) => url.pathname === "/" || url.pathname === "/index.html";
const STAMPED = ["styles.css", "app.js"];
const stampOf = async (body) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", body))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
async function stamps(ctx, url) {
  const out = {};
  await Promise.all(STAMPED.map(async (f) => {
    const r = await ctx.env.ASSETS.fetch(new Request(new URL(`/${f}`, url))).catch(() => null);
    if (r?.ok) out[f] = await stampOf(await r.arrayBuffer());
  }));
  return out;
}

export async function homePage(ctx, url, res) {
  if (!isPage(url) || ctx.request.method !== "GET" || res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const [c, v] = await Promise.all([getContent(ctx.env).catch(() => null), stamps(ctx, url)]);
  const text = (k) => ({ element: (el) => { if (c) el.setInnerContent(c[k]); } });
  const attr = (k) => ({ element: (el) => { if (c) el.setAttribute("content", c[k]); } });
  const stamp = (name) => ({ element: (el) => { const f = (el.getAttribute(name) || "").split("?")[0]; if (v[f]) el.setAttribute(name, `${f}?v=${v[f]}`); } });
  const out = new HTMLRewriter()
    .on("[data-c=role]", text("role")).on("[data-c=name]", text("name")).on("[data-c=bio]", text("bio"))
    .on("title", { element: (el) => { if (c) el.setInnerContent(c.name); } })
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', attr("bio"))
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:site_name"]', attr("name"))
    .on('link[rel="stylesheet"][href^="styles.css"]', stamp("href")).on('script[src^="app.js"]', stamp("src"))
    .transform(res);
  out.headers.delete("content-length"); out.headers.delete("etag");
  out.headers.set("Cache-Control", "no-cache");
  return out;
}
