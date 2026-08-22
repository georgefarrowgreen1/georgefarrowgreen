import { serveDemo, notFound } from "../_blokk.js";

// /blokk/ serves the demo; everything deeper is source and stays 404.
// The bare /blokk is handled by functions/blokk.js — both are declared so
// this does not depend on whether [[path]] matches an empty segment.
export async function onRequest(ctx) {
  const { pathname } = new URL(ctx.request.url);
  if (pathname === "/blokk" || pathname === "/blokk/") return serveDemo(ctx);
  return notFound();
}
