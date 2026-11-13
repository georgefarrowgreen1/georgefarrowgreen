# Full Files integration fixture

Run from the Apps repository, beside the Root checkout:

```
node --test --test-reporter=tap .tools/tests/files-integration.test.cjs
WEB_UI_BROWSER=webkit node --test --test-reporter=tap .tools/tests/files-integration.test.cjs
```

Use the repository-pinned Playwright 1.62.1 with its matching WebKit. Chromium defaults to `/usr/bin/chromium` when available. The fixture requires OpenSSL and local server/browser permissions. It does not use a production account or contact a production service.

The tests boot the real Root page and Frame/controller, Files Explorer/view/service/Drive client, all five actual app modules, and the actual Root Files proxy. Browser Files fetch/XHR/native downloads traverse a private local HTTPS server through a CONNECT proxy restricted to `os.inflite.ai:443`; the production hostname and response CSP are preserved. A temporary self-signed certificate is trusted only in the test browser. The browser sends its own real Secure HttpOnly cookie and raw upload bytes. Unknown network requests, CSP violations, page errors, and unhandled rejections fail the tests.

Real account cookie sessions, Files routes, SQL transactions and object storage run in a local Miniflare Worker with D1/R2/KV, reusing the security suite's seed/interleaving harness without registering its unit cases. Root's service-binding Request crosses a Node/workerd boundary as headers plus raw bytes; this transport currently buffers each request, so the independent Files security suite remains responsible for workerd stream-size/cancellation behavior. Account/bootstrap/weather/market/Mail transports and Chat Worker RPC retain the existing all-app integration fixtures. No app pane, domain adapter, editor, chart, Drive client, Files service, Explorer or backend Files implementation is stubbed.

The suite covers binary round trips and authenticated native downloads; create/rename/move/delete; server pagination beyond100; private POST search and revision invalidation; native Back/reload location safety; real optimistic write conflicts;320px focus/keyboard-sized forms and literal untrusted-text previews; captured-folder uploads surviving navigation; native XHR cancellation and reservation reclamation; actual Root account replacement retiring old previews/actions/uploads; genuine Fitness GPX/FIT exports; Mail metadata-only indexing and native attachment handoff; and hidden-Chat metadata retirement with one retained unsent draft.

The final matrix also swaps only the real browser account cookie while retaining the old Frame owner, proving the server rejects both old-owner reads and writes against the replacement account. A committed-reservation/withheld-acknowledgement case proves Cancel replays the exact idempotent reservation and reclaims its metadata/quota without publishing content.

Six real desktop/phone layout states per engine and their raw AXE reports are written under `$FILES_SCREENSHOTS/<engine>/` (default `/tmp/inflite-files-20261111/all-app-qa/<engine>/`). All functional cases require an empty product CSP/rejection/error log. The capture case separately records AXE's own inline-CSS support probes (at most two `style-src-elem inline` events per scan); it asserts no product CSP violations before or between scans and does not relax the response policy. Raw AXE results retain Root's existing critical `meta-viewport` issue: the application owner explicitly retained its historical viewport zoom clamp for this release. No other accessibility violation or horizontal control/page overflow is accepted.

Chromium emits the six PNGs. WebKit runs the same six live layout/AXE states and emits their JSON report, while deliberately avoiding its screenshot driver: Playwright WebKit injects an inline `body {}` animation-sync stylesheet even with caret hiding disabled, which the unchanged product CSP correctly refuses. AXE uses `preload:false` so it measures browser-loaded styles without fetching incorrectly rebased relative stylesheet imports.

Each preferred theme is initialized in its own browser context, so the audit measures its real first paint and subsequent viewport/modal changes without mixing WebKit media-emulation repaint state. The independent dynamic-theme audit also passes once visible inherited text colors have converged to the current body color.
