// What status.inflite.ai shows (functions/_status.js), and what the ticker checks for it (workers/ticker/index.js, which
// imports this): each address as a phone reaches it, and each scheduled job by the path the ticker asks for. Nothing
// here but the list, so the ticker can carry it without the rest of the site.
//   id: what it's kept under. group: where the page shows it. probe: what the ticker asks for (GET, ten seconds).
//   app: the version it's on, where it's this Worker's own (functions/_version.js).
export const STATUS_SERVICES = [
  { id: "today", name: "Today", group: "apps", address: "inflite.ai", probe: "https://inflite.ai/version" },
  { id: "chat", name: "Chat", group: "apps", address: "chat.inflite.ai", probe: "https://chat.inflite.ai/version", app: "chat" },
  { id: "weather", name: "Weather", group: "apps", address: "weather.inflite.ai", probe: "https://weather.inflite.ai/version", app: "weather" },
  { id: "fitness", name: "Fitness", group: "apps", address: "fitness.inflite.ai", probe: "https://fitness.inflite.ai/version", app: "fitness" },
  { id: "markets", name: "Markets", group: "apps", address: "finance.inflite.ai", probe: "https://finance.inflite.ai/version", app: "markets" },
  { id: "mail", name: "Mail", group: "apps", address: "email.inflite.ai", probe: "https://email.inflite.ai/version" },
  { id: "auth", name: "Signing in", group: "account", address: "auth.inflite.ai", probe: "https://auth.inflite.ai/version", app: "account" },
  { id: "account", name: "Account", group: "account", address: "account.inflite.ai", probe: "https://account.inflite.ai/version", app: "account" },
  { id: "home", name: "Home page", group: "home", address: "georgefarrowgreen.com", probe: "https://georgefarrowgreen.com/" },
];
// (the ticker's jobs, every five minutes, by the path it asks for)
export const STATUS_JOBS = [
  { id: "notify", name: "Chat notifications", path: "/api/pigeon/notify-tick" },
  { id: "wxtick", name: "Weather alerts", path: "/api/weather/tick" },
  { id: "garmin", name: "Garmin sync", path: "/api/fitness/garmin-tick" },
  { id: "mkttick", name: "Market alerts", path: "/api/markets/tick" },
  { id: "morning", name: "Morning notification", path: "/api/today/tick" },
];
// (slower than this, and it's "slow")
export const SLOW_MS = 3000;
// (what the apps rely on outside InFlite, checked from inside each time: for: the apps each one's part of)
export const STATUS_DEPS = [
  { id: "dep-weather", name: "Weather API", for: ["weather", "today"] },
  { id: "dep-prices", name: "Market API", for: ["markets"] },
  { id: "dep-garmin", name: "Garmin API", for: ["fitness"] },
  { id: "dep-email", name: "Email API", for: ["auth", "account"] },
];
// (the job each app's checks include)
export const APP_JOB = { chat: "notify", weather: "wxtick", fitness: "garmin", markets: "mkttick", today: "morning" };
// (what an app's banner is about, as the shared menu asks for it: its own address, its job, what it relies on; the hub, everything)
export const APP_SVCS = {
  chat: ["chat", "notify"], chats: ["chat", "notify"], weather: ["weather", "wxtick", "dep-weather"], fitness: ["fitness", "garmin", "dep-garmin"],
  markets: ["markets", "mkttick", "dep-prices"], finance: ["markets", "mkttick", "dep-prices"], mail: ["mail"], email: ["mail"],
  account: ["account", "auth", "dep-email"], auth: ["auth", "dep-email"], home: ["home"],
};
