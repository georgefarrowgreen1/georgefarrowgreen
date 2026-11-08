// One opening request, then fresh fixes while Weather is visible. Manual retries always work;
// automatic checks never reopen a dismissed/denied permission prompt.
export function locationRequester(nav = () => globalThis.navigator, now = Date.now) {
  let pending = false, asked = false, denied = false, lastAt = -Infinity;
  return async function request(automatic = false) {
    const n = nav();
    if (!n?.geolocation || pending) return null;
    if (automatic && now() - lastAt < 60e3) return null;
    pending = true;
    try {
      let state;
      try { state = (await n.permissions?.query({ name: "geolocation" }))?.state; } catch (_) {}
      if (automatic && (state === "denied" || (asked && state !== "granted" && (denied || state === "prompt")))) return null;
      asked = true; lastAt = now();
      const position = await new Promise((ok, no) => n.geolocation.getCurrentPosition(ok, no, {
        enableHighAccuracy: false, timeout: 12000, maximumAge: 60e3,
      }));
      denied = false;
      return position;
    } catch (e) {
      if (e?.code === 1) denied = true;
      throw e;
    } finally { pending = false; }
  };
}
export const requestLocation = locationRequester();
