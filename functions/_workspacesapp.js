import { HttpError, pace } from "./_pigeon.js";
import { signedIn, body, json } from "./_accountapi.js";
import { todayOrigin } from "./_sites.js";
import { readWorkspaces, writeWorkspaces, WORKSPACE_BYTES } from "./_workspaces.js";
const safe = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox; default-src 'none'; frame-ancestors 'none'" };
function route(write) {
  return async ({request, env}) => {
    if (request.headers.get("Origin") !== todayOrigin(env, request) || request.headers.has("Sec-Fetch-Site") && request.headers.get("Sec-Fetch-Site") !== "same-origin") throw new HttpError(403, "That request didn’t come from InFlite.");
    const user = await signedIn(request, env), expected = request.headers.get("X-Inflite-Workspace-Owner");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(expected || "") || expected !== user.id) throw new HttpError(401, "Your account changed. Refresh InFlite before continuing.", "session");
    await pace(env, `workspaces:${user.id}`, 120, 60e3);
    const result = write ? await writeWorkspaces(env, user.id, await body(request, WORKSPACE_BYTES)) : await readWorkspaces(env, user.id), response = json(result);
    for (const [key, value] of Object.entries(safe)) response.headers.set(key, value);
    return response;
  };
}
export const WORKSPACE_ROUTES = { "GET today/workspaces": route(false), "PUT today/workspaces": route(true) };
