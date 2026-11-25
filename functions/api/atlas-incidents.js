import { atlasServiceStatus, currentAtlasAdmin } from "../_atlas-service.js";
import { atlasIncidentEvidence } from "../_status.js";

const reply = (value, status = 200) => Response.json(value, {
  status,
  headers: { "Cache-Control": "private, no-store", "Content-Security-Policy": "default-src 'none'" },
});

export async function onRequest({ request, env }) {
  const refused = atlasServiceStatus(request, env);
  if (refused) return reply({ error: "unavailable" }, refused);
  const id = new URL(request.url).searchParams.get("incident");
  if (id !== null && !/^[a-z0-9-]{1,48}$/.test(id)) return reply({ error: "invalid_incident" }, 400);
  try {
    const admin = await currentAtlasAdmin(env);
    if (!admin) return reply({ error: "admin_required" }, 403);
    return reply({ owner: String(admin.id), incidents: await atlasIncidentEvidence(env, id) });
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
