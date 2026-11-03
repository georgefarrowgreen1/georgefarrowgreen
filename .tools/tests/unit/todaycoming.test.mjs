// Today's Coming Up (functions/_todaycoming.js upcomingFor, Today First spec §7.6), pure: the rain with its heaviest
// hour, each market you hold closing (London and New York), today's rides, calls agreed in Chat, rides offered within
// three days (explicit, kept, from habit and not kept, agreed and not yet added), pigeons landing; sorted; nothing
// past, nothing more than a day ahead but those offers; a ride not in by its cap; a card to send only on the rain and the
// ride; and no Chat place in any row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { upcomingFor } from "../../../functions/_todaycoming.js";
import { withForDay } from "../../../functions/_todaycards.js";

const FIX = (n) => JSON.parse(readFileSync(new URL(`../mocks/today/${n}.json`, import.meta.url), "utf8"));
const H = 3600e3, DAY = 24 * H, at = (h, m = 0, d = 2) => Date.UTC(2026, 10, d, h, m);
const TZ = "Europe/London";
const id = (n) => `b1c2d3e4-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const LEO = id(3), MIRA = id(12), NIA = id(14);
const offer = (o) => ({ id: "x", start: at(10, 0, 5), stop: at(11, 0, 5), sport: "ride", wid: "free-ride", name: "Ride", secs: 3600, who: "", role: "today", far: false, dry: true, state: "yes", taken: false, withId: null, ...o });
const RIDE = { start: at(16, 45), stop: at(18), name: "Endurance 75", sport: "ride", offerId: null, who: null, arrival: null, cap: at(18, 45), sub: "light rain at first", share: "My ride today: Endurance 75 at 16:45.", sendCard: "RIDECARD" };
const CALL = { id: "9c1d2e3f-4a5b-4c6d-8e7f-8091a2b3c4d5", kind: "call", start: at(18, 30), stop: at(19), tz: TZ, withId: MIRA, who: "Mira", role: "asked" };

// the demo's morning: the fixture's cards, with the Markets card's hours held apart as the card holds them
function cards(phase = "morning", hours = [{ where: "London", open: at(8), close: at(16, 30) }]) {
  const c = FIX(`cards.${phase}`).cards;
  withForDay(c.markets, { hours, held: [{ sym: "TSCO.L", name: "Tesco", pct: 1.2, day: "2026-11-02", where: "London" }, { sym: "RR.L", name: "Rolls-Royce", pct: -0.8, day: "2026-11-02", where: "London" },
    { sym: "AAPL", name: "Apple", pct: -2.1, day: "2026-11-02", where: "New York" }], alerts: [] });
  return c;
}
const extra = (x = {}) => ({ tz: TZ, rides: [RIDE], offers: [offer({ id: "habit" }), offer({ id: "leo", role: "answered", who: "Leo", withId: LEO, state: "new" })], times: [CALL], hide: [], tomorrow: null, ...x });

test("the demo's morning: the rain with its heaviest hour, London's close, the ride, Nia's pigeon, Mira's call, Thursday's two rides; soonest first", () => {
  const rows = upcomingFor(cards(), extra(), at(7));
  assert.deepEqual(rows.map((r) => [new Date(r.at).toISOString().slice(5, 16), r.app, r.title, r.sub, r.href, r.id]), [
    ["11-02T15:00", "weather", "Rain reaches London", "Heaviest around 17:00", "/weather/#radar", "rain"],
    ["11-02T16:30", "markets", "London closes", "Opens at 08:00", "/markets/#today", "close"],
    ["11-02T16:45", "fitness", "Ride: Endurance 75", "Light rain at first", "/fitness/#today", "ride"],
    ["11-02T17:20", "chat", "Pigeon from Nia lands", "On its way since 06:10", `/chats/#open=${NIA}`, `pigeon:${NIA}`],
    ["11-02T18:30", "chat", "Call with Mira", "Agreed in Chat", `/chats/#open=${MIRA}`, `time:${CALL.id}`],
    ["11-05T10:00", "fitness", "Ride", "From habit, dry", "/fitness/#day=2026-11-05", "offer:habit"],
    ["11-05T10:00", "fitness", "Ride with Leo", "Dry for both", "/fitness/#day=2026-11-05", "offer:leo"],
  ]);
  // (a card to send only on the rain and the ride)
  const withCard = rows.filter((r) => "sendCard" in r).map((r) => r.id);
  assert.deepEqual(withCard, ["rain", "ride"]);
  assert.equal(rows[0].share, cards().weather.share); assert.equal(rows[0].sendCard, cards().weather.sendCard);
  assert.equal(rows[2].share, RIDE.share); assert.equal(rows[2].sendCard, "RIDECARD");
  // (no Chat place anywhere: the pigeon's from Edinburgh, and its row doesn't say so)
  assert.ok(!JSON.stringify(rows).includes("Edinburgh"));
});

test("the close: the biggest mover in each market you hold so far, London's and New York's; none once it's closed", () => {
  const both = [{ where: "London", open: at(8), close: at(16, 30) }, { where: "New York", open: at(14, 30), close: at(21) }];
  const rows = upcomingFor(cards("midday", both), extra({ rides: [], offers: [], times: [] }), at(15));
  const closes = rows.filter((r) => r.app === "markets").map((r) => [r.title, r.sub, r.id]);
  assert.deepEqual(closes, [["London closes", "Tesco +1.2% so far", "close"], ["New York closes", "Apple −2.1% so far", "close:new-york"]]);
  assert.deepEqual(upcomingFor(cards("midday", both), extra(), at(17)).filter((r) => r.app === "markets").map((r) => r.title), ["New York closes"], "London's gone by 17:00");
  // (a card with only its JSON: London's close from closesAt, its mover from top and low)
  const plain = FIX("cards.midday").cards;
  assert.deepEqual(upcomingFor(plain, extra({ rides: [] }), at(13)).find((r) => r.app === "markets")?.sub, "Tesco +1.2% so far");
});

test("rides: explicit today; offered within three days, each said for what it is (habit added, kept, suggested; agreed, added)", () => {
  const offers = [
    offer({ id: "h-added" }), offer({ id: "h-kept", taken: true, start: at(9, 0, 4), stop: at(10, 0, 4) }), offer({ id: "h-new", state: "new", dry: false, start: at(8, 0, 3), stop: at(9, 0, 3) }),
    offer({ id: "a-new", role: "asked", who: "Leo", state: "new", dry: false, start: at(12, 0, 4), stop: at(13, 0, 4) }), offer({ id: "a-yes", role: "answered", who: "Sam", state: "yes", taken: true, start: at(14, 0, 4), stop: at(15, 0, 4) }),
    // (too far, gone, pending, undone, and today's own explicit ride, which is the ride's row)
    offer({ id: "far", start: at(10, 0, 6), stop: at(11, 0, 6) }), offer({ id: "no", state: "no" }), offer({ id: "pend", state: "pending" }), offer({ id: "undone" }), offer({ id: "mine", start: at(16, 45), stop: at(18) }),
  ];
  const rows = upcomingFor({}, extra({ rides: [{ ...RIDE, offerId: "mine" }], offers, times: [], hide: ["undone"] }), at(7));
  assert.deepEqual(rows.map((r) => [r.id, r.title, r.sub]), [
    ["ride", "Ride: Endurance 75", "Light rain at first"],
    ["offer:h-new", "Ride", "Suggested, from habit"],
    ["offer:h-kept", "Ride", "Kept, from habit"],
    ["offer:a-new", "Ride with Leo", "Agreed in Chat"],
    ["offer:a-yes", "Ride with Sam", "In Fitness, dry for both"],
    ["offer:h-added", "Ride", "From habit, dry"],
  ]);
  // (a ride with a friend today: its own title)
  assert.equal(upcomingFor({}, extra({ rides: [{ ...RIDE, who: "Leo" }], offers: [], times: [] }), at(7))[0].title, "Ride with Leo");
});

test("passed rows go; nothing more than a day ahead (but the offers); a ride not in by its cap says so and stays", () => {
  const ex = extra({ times: [CALL, { ...CALL, id: "tomorrow-call", start: at(8, 0, 3), stop: at(8, 30, 3) }, { ...CALL, id: "later", start: at(18, 0, 3), stop: at(18, 30, 3) }] });
  let rows = upcomingFor(cards(), ex, at(17, 30));
  assert.ok(!rows.some((r) => r.at <= at(17, 30) && r.sub !== "Not in yet"), "nothing passed");
  assert.deepEqual(rows.filter((r) => r.app === "chat").map((r) => r.id), [`time:${CALL.id}`, "time:tomorrow-call"], "08:00 tomorrow within the day; 18:00 tomorrow isn't, at 17:30");
  assert.ok(!rows.some((r) => r.id === "ride"), "the ride, under way, isn't coming up");
  rows = upcomingFor(cards(), ex, at(18, 50));
  const notIn = rows.find((r) => r.id === "ride");
  assert.deepEqual([notIn?.sub, notIn?.at, notIn?.href, "sendCard" in (notIn || {})], ["Not in yet", RIDE.start, "/fitness/#activities", false], "past its cap, nothing in");
  rows = upcomingFor(cards(), extra({ rides: [{ ...RIDE, arrival: at(18, 1) }] }), at(18, 50));
  assert.ok(!rows.some((r) => r.id === "ride"), "in: no row");
  // (sorted throughout)
  assert.deepEqual(rows.map((r) => r.at), [...rows.map((r) => r.at)].sort((a, b) => a - b));
});

test("pigeons: with pigeons on only, each landing, never where from; the evening's tomorrow first", () => {
  const c = cards();
  c.chat = { ...c.chat, inbound: [...c.chat.inbound, { ...c.chat.inbound[0], landsAt: at(19), sentAt: at(7) }] };
  let rows = upcomingFor(c, extra({ rides: [], offers: [], times: [] }), at(7, 30)).filter((r) => r.app === "chat");
  assert.deepEqual(rows.map((r) => [r.id, r.sub]), [[`pigeon:${NIA}`, "On its way since 06:10"], [`pigeon:${NIA}:${at(19)}`, "On its way since 07:00"]]);
  c.chat.pigeons = false;
  assert.equal(upcomingFor(c, extra({ rides: [], offers: [], times: [] }), at(7, 30)).filter((r) => r.app === "chat").length, 0);
  const eve = FIX("cards.evening").cards, tomorrow = { at: at(7, 0, 3), day: "2026-11-03", said: "dry and still", good: "run" };
  rows = upcomingFor(eve, extra({ rides: [], times: [], tomorrow }), at(21));
  assert.deepEqual(rows[0], { at: at(7, 0, 3), app: "weather", title: "Dry and still", sub: "A good morning for a run", href: "/weather/#day=2026-11-03", id: "tomorrow" });
  assert.equal(upcomingFor(eve, extra({ rides: [], times: [], tomorrow: { ...tomorrow, good: null } }), at(21))[0].sub, "At 07:00");
});

test("no cards, no rows; and the clock is never read", () => {
  const real = Date.now;
  Date.now = () => { throw new Error("the clock was read"); };
  try {
    assert.deepEqual(upcomingFor({}, {}, at(7)), []);
    assert.deepEqual(upcomingFor(null, null, at(7)), []);
    upcomingFor(cards(), extra(), at(7));
  } finally { Date.now = real; }
});
