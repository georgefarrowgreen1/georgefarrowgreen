// Public routes and allowlisted returns for both historical identity hosts and
// the same service presented at InFlite's canonical /auth and /account paths.
export const identityBase = (where) => /^\/(auth|account)(?=\/|$)/.exec(where.pathname)?.[0] || '';
const PATHS = { '@': '/', chat: '/chats/', weather: '/weather/', fitness: '/fitness/', finance: '/markets/', email: '/mail/', auth: '/auth/', account: '/account/' };
const production = where => /^(?:(?:auth|account)\.)?inflite\.ai$/.test(where.hostname);
export function siteUrlFor(where, sub) {
  if (production(where)) return sub ? 'https://inflite.ai' + (PATHS[sub] || '/') : 'https://georgefarrowgreen.com/';
  const { protocol, hostname, port } = where, p = port ? ':' + port : '', apps = hostname.replace(/^(account|auth)\./, '');
  if (!/^(account|auth)\./.test(hostname)) return sub === '@' ? 'https://inflite.ai/' : sub ? 'https://inflite.ai' + (PATHS[sub] || '/') : 'https://georgefarrowgreen.com/';
  return sub === '@' ? `${protocol}//${apps}${p}/` : sub ? `${protocol}//${sub}.${apps}${p}/` : `${protocol}//${({ 'ifl.test': 'gfg.test' })[apps] || apps}${p}/`;
}
export function returnFor(where, sub, back) {
  const usual = siteUrlFor(where, sub);
  try {
    const u = new URL(back), site = where.hostname.replace(/^(account|auth)\./, ''), home = new URL(siteUrlFor(where, '')).hostname;
    if (u.protocol !== where.protocol || u.port !== where.port || u.search || u.username || u.password) return usual;
    const path = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
    const known = sub === '@' ? [`${site}/`, `next.${site}/`, `os.${site}/`] : sub === '' ? [`${home}/`] : [`${sub}.${site}/`, `${site}${PATHS[sub] || '/'}`, `next.${site}${PATHS[sub] || '/'}`, `os.${site}${PATHS[sub] || '/'}`, ...(sub === 'chat' && home === site ? [`${site}/pigeon/`] : [])];
    if (sub === "email") known.push(`${site}/mail/standalone/`);
    if (!known.includes(u.hostname + path)) return usual;
    if (production(where) && sub === "email" && u.hostname === "inflite.ai" && path === "/mail/standalone/") return "https://inflite.ai/mail/standalone/";
    return production(where) && sub ? usual : u.origin + u.pathname;
  } catch { return usual; }
}
