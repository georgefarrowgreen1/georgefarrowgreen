// The repo root is the site's static output (wrangler.worker.jsonc and wrangler.gfg.jsonc), so its notes and
// config would otherwise be served as files. They aren't part of the site.
import { notFound } from "./_app.js";
export const onRequest = () => notFound();
