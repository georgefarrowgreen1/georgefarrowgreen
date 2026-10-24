// Argon2id in the background (crypto.js fromPassword): a password's stretching worked out here, off the page, so the
// page keeps moving while it is (it takes a phone half a second or more). Asked { id, opts }, it answers { id, out }
// (the 64 bytes), or { id, err }, and the page works it out itself instead.
import * as hw from "./argon2.js";

const argon2id = hw?.argon2id || hw?.default?.argon2id || globalThis.hashwasm?.argon2id;
self.onmessage = async (e) => {
  const { id, opts } = e.data || {};
  try {
    const out = await argon2id(opts);
    self.postMessage({ id, out }, [out.buffer]);
  } catch (err) { self.postMessage({ id, err: String(err?.message || err) }); }
};
