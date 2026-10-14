/* ---------- where InFlight lives ----------
   InFlight is moving from georgefarrowgreen.com/pigeon to its own address,
   chat.georgefarrowgreen.com (served at the root there). Its own address is a
   separate origin from the rest of the site, so nothing on the homepage ever
   shares storage with anyone's keys.

   Until MOVED is on, the new address works but nothing points to it. Once on:
   links in emails go there, and the old address hands each phone across
   (functions/_move.js): it sends anything still waiting, unlocks the key
   with the person's password or passkey, and carries it, the sign-in and the
   phone's own settings over sealed with a key the server never sees.

   For a local test of the move, PIGEON_APP_HOST, PIGEON_MOVED_FROM and
   PIGEON_APP_ORIGIN stand in for the real addresses. */
export const OLD_HOST = "georgefarrowgreen.com", APP_HOST = "chat.georgefarrowgreen.com";
export const MOVED = false;
// the host that serves InFlight at its root
export const appHost = (env) => env?.PIGEON_APP_HOST || APP_HOST;
export const isAppHost = (url, env) => new URL(url).hostname === appHost(env);
// the host it has moved from (null until it has)
export const movedFrom = (env) => env?.PIGEON_MOVED_FROM || (MOVED ? OLD_HOST : null);
export const appOrigin = (env) => env?.PIGEON_APP_ORIGIN || `https://${APP_HOST}`;
// passkeys belong to georgefarrowgreen.com, so the same ones work at either address
export const rpIdOf = (hostname) => (/(^|\.)georgefarrowgreen\.com$/.test(hostname) ? OLD_HOST : hostname);
