// Stop obsolete Git-triggered builds without removing deployments, domains or data.
// Run inside Actions, where the Cloudflare credential is already stored.
import { appendFileSync } from 'node:fs';

const ACCOUNT = 'f46d2f74d4ff55f60a82305531b4c060';
const PROJECT = 'georgefarrowgreen';
const OWNER = 'georgefarrowgreen1';
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}`;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not configured; no settings changed.');
if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT)
  throw new Error('The configured account differs from the legacy project account; no settings changed.');

async function api(path, method = 'GET', body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    // Return only fixed identifiers and error codes, never a response containing configuration or secrets.
    const codes = (data.errors || []).map(e => e.code).join(',');
    throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status}, codes ${codes || 'none'}. Check the token's project permissions.`);
  }
  return data.result;
}
function report(message) {
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
}
function disabled(project) {
  const c = project.source?.config;
  return c?.production_deployments_enabled === false && c?.preview_deployment_setting === 'none';
}

// Read the exact project before any mutation. Never print deployment_configs (contains secrets).
const path = `/pages/projects/${PROJECT}`;
const project = await api(path);
const source = project.source;
if (project.name !== PROJECT || source?.type !== 'github' ||
    source.config?.owner?.toLowerCase() !== OWNER || source.config?.repo_name !== PROJECT)
  throw new Error('The project is not linked to the expected GitHub repository; no settings changed.');
report(`Verified the legacy project belongs to ${OWNER}/${PROJECT}.`);

// Confirm both replacement Workers have active deployments before disabling the old build triggers.
for (const worker of ['inflite-apps', 'gfg']) {
  const result = await api(`/workers/scripts/${worker}/deployments`);
  if (!result.deployments?.some(d => d.versions?.some(v => v.percentage > 0)))
    throw new Error(`${worker} has no active deployment; no settings changed.`);
  report(`Verified ${worker} has an active deployment.`);
}

if (disabled(project)) {
  report('Automatic production and preview builds are already disabled. No settings changed.');
} else {
  await api(path, 'PATCH', { source: { type: 'github', config: {
    production_deployments_enabled: false,
    preview_deployment_setting: 'none',
  } } });
  const current = await api(path);
  if (!disabled(current)) throw new Error('The update was submitted, but read-back did not confirm both build triggers are off. Inspect the dashboard.');
  report('Confirmed: automatic production builds are disabled and preview builds are set to none.');
}
report('Existing deployments, custom domains, bindings, secrets and all Worker settings were left intact.');
