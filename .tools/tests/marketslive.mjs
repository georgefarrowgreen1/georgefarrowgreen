// Run keyless streaming through both real Markets UIs, without contacting a third party.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serveKit, KIT } from "./roofkit/serve.mjs";
import { routeMarkets } from "./mocks/mkroof.mjs";
import { frame } from "./unit/fixtures/marketslive.mjs";
import * as H from "./roofhooks.mjs";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium" });
try {
  for (const standalone of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
    await serveKit(ctx);
    const now = Date.now(), st = await routeMarkets(ctx, KIT, { now });
    let socket, subscriptions = [], connections = 0;
    await ctx.routeWebSocket("wss://streamer.finance.yahoo.com/**", (ws) => {
      socket = ws; connections++;
      ws.onMessage((data) => { const j = JSON.parse(data); if (j.subscribe) subscriptions = j.subscribe; });
    });
    if (standalone) await ctx.route(`${KIT}/markets/`, (r) => r.fulfill({ contentType: "text/html", body: readFileSync(new URL("../../markets/index.html", import.meta.url), "utf8") }));
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: now });
    if (standalone) await page.goto(`${KIT}/markets/`);
    else {
      await page.goto(`${KIT}/?module=/markets/roof/markets.js&apps=weather,markets`);
      await page.waitForFunction(() => window.kit?.ready);
      await page.evaluate(() => window.kit.F.nav.go("/markets/"));
    }
    const row = standalone ? '[data-sym="AAPL"]' : H.mkRow("AAPL");
    await page.locator(`${row}:visible`).first().waitFor();
    assert.equal(connections, 0, "no third-party connection until opted in");
    // Turn on the account-scoped device preference, then let the normal lifecycle sync it.
    if (!standalone) {
      await page.evaluate(() => window.kit.F.nav.go("/markets/#about"));
      await page.getByRole("switch", { name: "Live prices (experimental)" }).click();
      assert.equal(await page.getByRole("switch", { name: "Live prices (experimental)" }).getAttribute("aria-checked"), "true");
      await page.locator(H.SHEET_CLOSE).last().click();
    } else await page.evaluate((id) => localStorage.setItem(`markets:live:${id}`, "true"), st.acc.id);
    await page.clock.fastForward(15001);
    await page.waitForFunction(() => true);
    for (let i = 0; i < 30 && !subscriptions.includes("AAPL"); i++) await page.waitForTimeout(100);
    assert.ok(subscriptions.includes("AAPL"));
    assert.ok(!subscriptions.includes("TSCO.L"), "delayed London shares stay on polling");
    await page.locator(`${row}:visible`).first().click();
    const info = page.locator('[data-session="AAPL"]:visible'); await info.waitFor();
    const time = (await page.evaluate(() => Date.now())) / 1000;
    socket.send(frame({ symbol: "AAPL", price: 195, time, currency: "USD", hours: 1 }));
    await page.clock.fastForward(300);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-px="AAPL"]')].some((n) => n.textContent.includes("195")));
    assert.match(await info.textContent(), /Live quote · Yahoo Finance/);
    assert.equal(await page.locator('[data-dg="AAPL"]:visible').last().evaluate((n) => n.classList.contains("up-t")), true, "gain turns positive with the streamed price");
    assert.match(await page.locator('[data-gain-pct="AAPL"]:visible').textContent(), /30\.0/, "since-bought return updates too");
    await page.clock.fastForward(15000);
    assert.match(await page.locator('[data-px="AAPL"]:visible').first().textContent(), /195/, "polling cannot overwrite the newer streamed price");
    socket.send(frame({ symbol: "AAPL", price: 999, time: time - 1200, currency: "USD", hours: 1 }));
    await page.clock.fastForward(300);
    assert.doesNotMatch(await page.locator('[data-px="AAPL"]:visible').first().textContent(), /999/);
    await page.screenshot({ path: `/tmp/markets-live-${standalone ? "standalone" : "roof"}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS ${standalone ? "Standalone" : "Inflite"}: opt-in only, US subscription, live paint, old-poll protection, delayed tick rejection`);
    await ctx.close();
  }
} finally { await browser.close(); }
