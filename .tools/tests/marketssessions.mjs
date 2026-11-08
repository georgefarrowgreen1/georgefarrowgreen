// Browser checks for closed prices and extended-only changes on both Markets surfaces.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { serveKit, KIT } from "./roofkit/serve.mjs";
import { routeMarkets } from "./mocks/mkroof.mjs";
import * as H from "./roofhooks.mjs";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium" });
try {
  for (const standalone of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB" });
    await serveKit(ctx);
    const now = Date.now(), t = Math.floor(now / 1000), st = await routeMarkets(ctx, KIT, { now });
    Object.assign(st.acc.quotes["TSCO.L"], { time: t - 3600, open: { start: t - 25000, end: t - 3500 }, extended: { session: "post", price: 3.15, time: t - 600, chgPct: 0.96 } });
    if (standalone) await ctx.route(`${KIT}/markets/`, (route) => route.fulfill({ contentType: "text/html", body: readFileSync(new URL("../../markets/index.html", import.meta.url), "utf8") }));
    const page = await ctx.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.clock.install({ time: now });
    if (standalone) await page.goto(`${KIT}/markets/`);
    else {
      await page.goto(`${KIT}/?module=/markets/roof/markets.js&apps=weather,markets`);
      await page.waitForFunction(() => window.kit?.ready);
      await page.evaluate(() => window.kit.F.nav.go("/markets/"));
    }
    const row = standalone ? '[data-sym="TSCO.L"]' : H.mkRow("TSCO.L");
    await page.locator(`${row}:visible`).first().click();
    const info = page.locator('[data-session="TSCO.L"]:visible');
    await info.waitFor();
    assert.match(await info.textContent(), /Closed · Last regular-session price/);
    assert.match(await info.textContent(), /After-hours/);
    assert.match(await info.textContent(), /3\.15/);
    const before = await page.locator('[data-px="TSCO.L"]:visible').first().textContent();
    st.acc.quotes["TSCO.L"].extended.price = 3.2;
    st.acc.quotes["TSCO.L"].extended.chgPct = 2.56;
    await page.clock.fastForward(15001);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-session="TSCO.L"]')].some((n) => /3\.20/.test(n.textContent)));
    assert.equal(await page.locator('[data-px="TSCO.L"]:visible').first().textContent(), before);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `/tmp/markets-${standalone ? "standalone" : "roof"}-closed.png` });
    console.log(`PASS ${standalone ? "Standalone" : "Inflite"}: close timestamp, after-hours quote, 15-second extended-only refresh, stable regular price`);
    await ctx.close();
  }
} finally { await browser.close(); }
