// The site's home page (index.html, app.js) as it's sent: its words (functions/_content.js) already in it, so search
// engines and link previews read what the page says, not the defaults it's written with. The page fills them in
// again when it loads (and its owner edits them there).
import { getContent } from "./_content.js";

const isPage = (url) => url.pathname === "/" || url.pathname === "/index.html";

export async function homePage(ctx, url, res) {
  if (!isPage(url) || ctx.request.method !== "GET" || res.status !== 200 || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const c = await getContent(ctx.env).catch(() => null);
  if (!c) return res;
  const text = (k) => ({ element: (el) => { el.setInnerContent(c[k]); } });
  const attr = (v) => ({ element: (el) => { el.setAttribute("content", v); } });
  return new HTMLRewriter()
    .on("[data-c=role]", text("role")).on("[data-c=name]", text("name")).on("[data-c=bio]", text("bio"))
    .on("title", { element: (el) => { el.setInnerContent(c.name); } })
    .on('meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]', attr(c.bio))
    .on('meta[property="og:title"], meta[name="twitter:title"], meta[property="og:site_name"]', attr(c.name))
    .transform(res);
}
