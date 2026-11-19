export function diagnosticsOrigin(request) {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null && site !== "same-origin") return false;
  // Middleware only supplies this flag to an authenticated service proxy.
  if (request.headers.get("X-Hub-Ok") === "1") return true;
  const origin = request.headers.get("Origin");
  // A same-origin beacon can omit Origin or send null under no-referrer.
  if (origin === null || origin === "null") return site === "same-origin";
  return origin === new URL(request.url).origin;
}
