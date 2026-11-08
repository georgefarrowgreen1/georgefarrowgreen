# InFlite monitoring

The existing five-minute Cloudflare ticker now probes eight signed-out API contracts as well as public version endpoints. It reports to the existing authenticated `/api/status/report` endpoint. Results appear on https://status.inflite.ai under **API health** and **Page performance**, in each app's checks, and in the Incident Desk. No additional account or credentials are needed.

- **API failures:** an unexpected HTTP status, invalid JSON or a changed signed-out response is unhealthy. Chat's expected 401 is healthy only with its expected session error. Bot challenges mean unknown, not an outage. Probes send no account cookies or authorization. The complete response has a ten-second deadline and a 4 KiB body cap.
- **Slow APIs:** a complete response above three seconds is degraded. Five recorded server errors for an app in fifteen minutes also mark its API unhealthy. Slow fallback reports are excluded from the error count. This is an error count, not a traffic-normalized error rate.
- **Performance regressions:** reuse the existing anonymous, daily histograms. Evaluate today's approximate p75 by app and phone/computer against the preceding seven London days. Require 20 current samples per metric/device. Poor Web Vitals trigger a warning; a baseline regression also requires 100 baseline samples, a 1.5× increase, crossing the good boundary, and at least 100 ms change (0.05 for CLS). Devices and metrics are evaluated independently so fast computers cannot hide slow phones. Daily aggregates are not an instantaneous rolling window.
- **Alerts and recovery:** two unhealthy reports open one incident, using the existing Status push/email preferences and subscriptions. Two healthy reports close it. Missing data cannot establish recovery or open a new incident from old failures. Planned app maintenance suppresses related monitor incidents. Monitoring does not change notification preferences.
- **Independent watchdog:** the existing GitHub workflow runs every fifteen minutes. It fails on stale/missing checks, missing credentials, malformed responses or confirmed API/performance incidents. GitHub delivery can run late; Cloudflare's ticker remains the primary five-minute checker.
- **CI budgets:** Chat checks installs the locked test tools so the existing app performance-budget tests run rather than skipping for missing esbuild.

Thresholds and the read-only probe catalogue live in `functions/_monitorlist.js`. State, histories and incidents use the existing Status tables; no new event stream or customer identifiers are collected. The error aggregation uses an index on `pg_bugs(app, at)`.

The monitor checks signed-out contracts and recorded server errors. It does not exercise private Mail operations, real user sign-ins or every authenticated endpoint. Field performance remains “Collecting data” until enough existing visitor samples arrive; missing samples are not called healthy.

Tests: `.tools/tests/unit/monitoring.test.mjs`, `status.test.mjs`, `ticker.test.mjs` and `vitals.test.mjs`. Browser checks: `CHROMIUM=/path/to/chromium node .tools/tests/status-ui.mjs`.
