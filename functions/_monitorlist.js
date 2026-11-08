// Read-only, signed-out contracts. No cookies, tokens, customer data or writes.
export const API_PROBES = [
  { app: "today", name: "Today API", probe: "https://inflite.ai/api/session", field: "signedIn", value: false },
  { app: "chat", name: "Chat API", probe: "https://chat.inflite.ai/api/pigeon/sync", status: 401, field: "field", value: "session" },
  { app: "weather", name: "Weather API", probe: "https://weather.inflite.ai/api/weather/me", field: "signedIn", value: false },
  { app: "fitness", name: "Fitness API", probe: "https://fitness.inflite.ai/api/fitness/me", field: "signedIn", value: false },
  { app: "markets", name: "Markets API", probe: "https://finance.inflite.ai/api/markets/me", field: "signedIn", value: false },
  { app: "mail", name: "Mail API", probe: "https://email.inflite.ai/api/session", field: "access", value: "signin" },
  { app: "account", name: "Account API", probe: "https://account.inflite.ai/api/account/me", field: "signedIn", value: false },
  { app: "auth", name: "Sign-in API", probe: "https://auth.inflite.ai/api/account/me", field: "signedIn", value: false },
].map((s) => ({ ...s, id: `api-${s.app}`, status: s.status || 200 }));

export const MONITORS = API_PROBES.flatMap((s) => [
  { id: s.id, name: s.name, for: [s.app], monitor: "api" },
  { id: `perf-${s.app}`, name: `${s.name.replace(/ API$/, "")} performance`, for: [s.app], monitor: "performance" },
]);
export const MONITOR_IDS = new Set(MONITORS.map((s) => s.id));
export const MONITOR_POLICY = {
  apiSlowMs: 3000, errorWindowMinutes: 15, errorCount: 5,
  minCurrentSamples: 20, minBaselineSamples: 100, baselineDays: 7, regressionRatio: 1.5,
  // Web Vitals' poor/good boundaries, in ms except CLS (a score).
  metrics: { ttfb: [800, 1800], fcp: [1800, 3000], lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] },
};
