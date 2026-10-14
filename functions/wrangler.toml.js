// The repo root is the site's static output (wrangler.toml), so its notes and
// config would otherwise be served as files. They aren't part of the site.
import { notFound } from "./_blokk.js";
export const onRequest = () => notFound();
