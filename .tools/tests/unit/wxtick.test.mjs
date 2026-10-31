// Weather's notification tick (functions/_wxpush.js): which places it looks at, what it may ask Open-Meteo for, whose
// official warnings it asks for, and what's kept of the warnings told of (weather/alerts.js warningAlert).
import { test } from "node:test";
import assert from "node:assert/strict";
import { toLook, allowance, warningsFor } from "../../../functions/_wxpush.js";
import { warningAlert } from "../../../weather/alerts.js";
import { makeFormat } from "../../../weather/format.js";

const H = 3600e3, NOON = Date.UTC(2026, 9, 20, 12);          // (noon at tz_off 0: no one's quiet hours)

test("the places a tick looks at: briefings due first, then the rest in a different order each time, so none is left out for good", () => {
  const row = (i, o = {}) => ({ id: `r${i}`, lat: 50 + i / 100, lon: 0, rain: 1, brief: 0, warn: 0, tz_off: 0, ...o });
  const subs = Array.from({ length: 400 }, (_, i) => row(i));
  // two briefings due, last in the table; rain in its quiet hours, and warnings alone (neither looked at); a place whose
  // clock isn't known yet (looked at)
  subs.push(row(400, { rain: 0, brief: 1, brief_at: "12:00" }), row(401, { rain: 0, brief: 1, brief_at: "11:30" }), row(402, { tz_off: 12 * 3600 }), row(403, { rain: 0, warn: 1 }), row(404, { rain: 0, warn: 1, tz_off: null }));
  const all = toLook(subs, NOON, Infinity).map((s) => s.id);
  assert.equal(all.length, 403); assert.ok(all.includes("r404") && !all.includes("r402") && !all.includes("r403"));
  const one = toLook(subs, NOON);
  assert.equal(one.length, 200);
  assert.deepEqual(one.slice(0, 2).map((s) => s.id).sort(), ["r400", "r401"], "the briefings due first, wherever they are in the table");
  const late = (list) => list.filter((s) => +s.id.slice(1) >= 200 && +s.id.slice(1) < 400).length;
  assert.ok(late(one) > 50, `not only the first 200 in the table (${late(one)} later ones)`);
  const seen = new Set(one);
  for (let n = 0; n < 4; n++) toLook(subs, NOON).forEach((s) => seen.add(s));
  assert.ok(late([...seen]) > 150, `within a few ticks, nearly every later one (${late([...seen])} of 200)`);
});

// A place with only warnings or panels on is looked at once a night too, as 03:00 comes there (its clock as last known:
// the first ten minutes, two ticks at most), so the forecast says its clock again: right after the clocks change in
// spring and autumn
test("the places a tick looks at: those with only warnings or panels, once a night, so their clock's kept right when it changes", () => {
  const row = (id, o) => ({ id, lat: 51.5, lon: 0, rain: 0, brief: 0, warn: 0, solar: null, ...o });
  // 03:05 there, by its clock as kept (UTC−8:55 at noon UTC); 03:30; 02:00; and noon
  const at = (off) => ({ tz_off: Math.round(off * 3600) });
  const subs = [row("warn-3", { warn: 1, ...at(-8 - 55 / 60) }), row("sun-3", { solar: "{}", ...at(-8 - 55 / 60) }), row("warn-330", { warn: 1, ...at(-8.5) }), row("warn-2", { warn: 1, ...at(-10) }),
    row("warn-12", { warn: 1, ...at(0) }), row("rain-3", { rain: 1, ...at(-8 - 55 / 60) }), row("none-3", { ...at(-8 - 55 / 60) })];
  assert.deepEqual(toLook(subs, NOON, Infinity).map((s) => s.id).sort(), ["sun-3", "warn-3"], "warnings or panels alone, at 03:05 there; not later in the hour, at 02:00 or noon, nor rain alerts alone, in their quiet hours");
});

test("Open-Meteo's allowance: all that's kept at first, then 8,000 a day between the ticks however often they come", () => {
  assert.equal(allowance(null, NOON), 500);
  assert.equal(allowance({ n: 0, at: NOON }, NOON), 0, "spent, and asked again at once: nothing");
  assert.ok(Math.abs(allowance({ n: 0, at: NOON }, NOON + 5 * 60e3) - 8000 / 288) < 1e-9, "five minutes later: a 288th of the day's");
  assert.equal(allowance({ n: 10, at: NOON }, NOON + 24 * H), 500, "never more kept than an hour and a half's");
  assert.equal(allowance({ n: 10, at: NOON + 60e3 }, NOON), 10, "a clock a little behind earns nothing");
  assert.equal(allowance({ n: "x" }, NOON), 500, "what's kept not as it should be: as at first");
  // (a tick spending all it may: what's kept, up to a tick's 55)
  const spend = (left, t) => { const have = allowance(left, t), cost = Math.floor(Math.min(have, 55)); return [cost, { n: have - cost, at: t }]; };
  // a day of ticks every two and a half minutes (the ticker's and GitHub's, and the site's traffic's), each spending all
  // it may: about 8,000 between them (and the 500 kept at first), not 55 each
  let left = null, spent = 0;
  for (let t = NOON; t < NOON + 24 * H; t += 150e3) { const [cost, now] = spend(left, t); spent += cost; left = now; }
  assert.ok(spent > 8400 && spent <= 8500, String(spent));
  // a quiet night (nothing asked since 22:00), then a morning's briefings every 5 minutes, as many as there's room for:
  // the whole of a tick's 55 for over an hour, from what the night kept, then the day's share
  left = { n: 0, at: NOON - 9 * H }; const morning = [];
  for (let t = NOON; t < NOON + 3 * H; t += 5 * 60e3) { const [cost, now] = spend(left, t); morning.push(cost); left = now; }
  assert.ok(morning.slice(0, 15).every((c) => c === 55), morning.join(" "));
  assert.ok(morning.slice(-6).every((c) => c >= 27 && c <= 28), morning.join(" "));
  const sum = morning.reduce((a, c) => a + c, 0);
  assert.ok(sum > 1450 && sum <= 1500, `about 500 and three hours' share (${sum})`);
});

test("official warnings: each place asked once, a few at a time, at most 150 a tick and only while there's time; the rest on later ticks", async () => {
  const subs = [];
  for (let i = 0; i < 300; i++) subs.push({ lat: 50 + i / 100, lon: 0, warn: 1, tz_off: 0 }, { lat: 50 + i / 100, lon: 0, warn: 1, tz_off: 3600 });   // (two phones at each place)
  subs.push({ lat: 1, lon: 1, warn: 1, tz_off: null }, { lat: 2, lon: 2, warn: 0, rain: 1, tz_off: 0 });
  let now = 0, most = 0, asked = [];
  const look = async (s) => { asked.push(`${s.lat},${s.lon}`); most = Math.max(most, ++now); await new Promise((r) => setTimeout(r, 1)); now--; if (s.lat === 9) throw new Error("down"); return [{ id: "w" }]; };
  const got = await warningsFor(subs, look, Date.now());
  assert.equal(got.size, 150); assert.equal(new Set(asked).size, asked.length, "each place once, however many phones are there");
  assert.equal(most, 6, "six at a time");
  // (a place whose feed is slow holds up only its own: the rest are asked meanwhile)
  let slow = true, meanwhile = 0;
  const lag = async () => { if (slow) { slow = false; await new Promise((r) => setTimeout(r, 40)); slow = null; return []; } if (slow === false) meanwhile++; await new Promise((r) => setTimeout(r, 1)); return []; };
  await warningsFor(subs, lag, Date.now());
  assert.ok(meanwhile > 20, `others asked while the slow one was (${meanwhile})`);
  assert.ok(!got.has("1,1") && !got.has("2,2"), "not before the place's clock is known, nor where they're not on");
  const seen = new Set(got.keys());
  for (let n = 0; n < 4; n++) (await warningsFor(subs, look, Date.now())).forEach((_, k) => seen.add(k));
  assert.ok(seen.size > 260, `within a few ticks, nearly every place (${seen.size} of 300)`);
  // (begun late in the tick, the forecasts and phones having taken their time: still ten seconds of their own)
  assert.equal((await warningsFor(subs, look, Date.now() - 21e3)).size, 150, "begun 21 seconds into the tick: still asked");
  // none begun once the tick's had its 20 seconds, or they've had their 10, if that's later (each lookup a second, by a
  // clock of the test's own)
  const real = Date.now;
  try {
    let clock = 1e6;
    Date.now = () => clock;
    const second = async () => { clock += 1000; return []; };
    assert.equal((await warningsFor(subs, second, clock)).size, 20, "begun as the tick began: 20 seconds");
    assert.equal((await warningsFor(subs, second, clock - 15e3)).size, 10, "begun 15 seconds in: 10 seconds of their own");
    assert.equal((await warningsFor(subs, second, clock - 4e3)).size, 16, "begun 4 seconds in: the rest of the tick's 20");
    // (and none begun after the tick's own end: the one the site's traffic starts, with its 30 seconds in all)
    assert.equal((await warningsFor(subs, second, clock - 15e3, 150, Math.random, clock + 6e3)).size, 6, "the tick ending 6 seconds on: 6 seconds, not 10");
  } finally { Date.now = real; }
  assert.equal((await warningsFor([{ lat: 9, lon: 0, warn: 1, tz_off: 0 }], look, Date.now())).get("9,0"), null, "not to be had: null (nothing's taken as told)");
});

test("a warning with no end time, told of: what's kept of it isn't rewritten every tick, and it's kept half a day at least once it's gone", () => {
  const f = makeFormat({}), iso = (t) => new Date(t).toISOString();
  const flood = (t) => ({ id: "ea-061FWF23Cambridge-3", level: 3, event: "Flood Warning", via: "EA", issuer: "Environment Agency", onset: iso(NOON - 24 * H), expires: null, open: true, checked: iso(t) });
  let told = warningAlert([flood(NOON)], null, NOON, NOON, f, 0, "Cambridge").told, writes = 0;
  for (let t = NOON + 5 * 60e3; t < NOON + 24 * H; t += 5 * 60e3) {
    const r = warningAlert([flood(t)], told, t, t, f, 0, "Cambridge");
    assert.equal(r.alert, null);
    assert.ok(r.told["ea-061FWF23Cambridge-3"][2] >= t + 12 * H, "kept at least half a day on");
    if (JSON.stringify(r.told) !== JSON.stringify(told)) writes++;
    told = r.told;
  }
  assert.ok(writes <= 4, `kept anew only every 6 hours, not every tick (${writes} times in a day)`);
  // no longer listed: still remembered half a day on, so it isn't told again if it's listed again
  const back = NOON + 24 * H + 11 * H;
  assert.equal(warningAlert([flood(back)], warningAlert([], told, back - H, back - H, f).told, back, back, f, 0, "Cambridge").alert, null);
});
