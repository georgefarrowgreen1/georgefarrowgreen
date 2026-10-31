// Markets' income, worked out (markets/income.js): one-off dividends told from the usual, a year of a payer's dividends
// to expect again, how dependable a payer has been, what a year's income could come to, the UK's tax year, a spreadsheet that's safe to open; and what the evening wrap
// says about dividends (functions/_markets.js wrapIncome).
import { test } from "node:test";
import assert from "node:assert/strict";
import { marked, health, project, taxYearOf, csv, yearDivs, yearOn } from "../../../markets/income.js";
import { wrapIncome } from "../../../functions/_markets.js";

const DAY = 86400, at = (iso) => Date.parse(iso) / 1000;
// (a payer's dividends: [ISO day, amount] each)
const divs = (list) => list.map(([d, amount]) => ({ t: at(d), amount }));

test("a one-off is told from the usual: a payout many times the rest, not a final twice its interim", () => {
  const halves = divs([["2023-03-01", 5], ["2023-09-01", 25], ["2024-03-01", 5], ["2024-09-01", 25], ["2025-03-01", 5], ["2025-09-01", 26]]);
  assert.deepEqual(marked(halves).map((d) => d.special), [false, false, false, false, false, false], "an interim and a final five times it: both usual");
  const withSpecial = divs([["2024-04-01", 10], ["2024-10-01", 20], ["2025-04-01", 10], ["2025-05-14", 60], ["2025-10-01", 21]]);
  assert.deepEqual(marked(withSpecial).map((d) => d.special), [false, false, false, true, false], "60 among 10s and 20s: a one-off");
  const quarterly = divs([["2024-01-05", 10], ["2024-04-05", 10], ["2024-07-05", 10], ["2024-10-05", 10], ["2024-12-20", 30], ["2025-01-05", 10.5], ["2025-04-05", 10.5]]);
  assert.equal(marked(quarterly).filter((d) => d.special).length, 1, "a quarterly payer's extra, three times the rest");
  assert.deepEqual(marked(divs([["2025-04-01", 4], ["2025-10-01", 40]])).map((d) => d.special), [false, false], "two alone: too few to say what's usual");
});

test("a year of a payer's dividends, by how often it pays: not missed when it's late, nor counted twice when it's early", () => {
  const days = (list) => list.map((d) => new Date(d.t * 1000).toISOString().slice(0, 10));
  // (once a year, its day moving from 3 October to 9 October: between the two, it's still a payer)
  const annual = divs([["2022-10-05", 20], ["2023-10-04", 21], ["2024-10-02", 22], ["2025-10-03", 23]]);
  assert.deepEqual(days(yearDivs(annual, at("2026-10-06"))), ["2025-10-03"], "a year and three days on, its payment's still the year's");
  assert.deepEqual(days(yearDivs(annual, at("2027-01-10"))), [], "a payment over a year and two months gone: it's stopped");
  // (four a year, and this year's coming a little earlier: five in the last 365 days, four of them the year's)
  const early = divs([["2024-11-20", 5], ["2025-02-20", 5], ["2025-05-20", 5], ["2025-08-20", 5], ["2025-11-01", 5.2], ["2026-01-30", 5.2], ["2026-04-30", 5.2], ["2026-07-30", 5.2], ["2026-10-28", 5.2]]);
  const e = yearDivs(early, at("2026-10-30"));
  assert.deepEqual(days(e), ["2026-01-30", "2026-04-30", "2026-07-30", "2026-10-28"]);
  // (and a little later: three in the last 365 days, and the fourth just before them)
  const late = divs([["2024-10-01", 5], ["2025-01-02", 5], ["2025-04-01", 5], ["2025-07-01", 5], ["2025-10-27", 5], ["2026-01-28", 5], ["2026-04-28", 5], ["2026-07-28", 5]]);
  assert.equal(yearDivs(late, at("2026-10-30")).length, 4, "the one 368 days ago counts: the next is due any day");
  // (an interim and a final, unevenly apart: two a year, never four)
  const halves = divs([["2023-05-10", 20], ["2023-08-10", 10], ["2024-05-10", 21], ["2024-08-10", 10.5], ["2025-05-10", 22], ["2025-08-10", 11]]);
  assert.deepEqual(days(yearDivs(halves, at("2025-12-01"))), ["2025-05-10", "2025-08-10"]);
  assert.deepEqual(days(yearDivs(halves, at("2026-05-20"))), ["2025-05-10", "2025-08-10"], "the interim ten days later than last year's: still the year's");
  assert.deepEqual(days(yearDivs(halves, at("2026-09-01"))), ["2025-08-10"], "no interim this year, last year's gone over a year and two months");
  // (a one-off in the year: beside the usual, said apart by income())
  const special = divs([["2024-04-01", 10], ["2024-10-01", 20], ["2025-04-01", 10], ["2025-05-14", 60], ["2025-10-01", 21]]);
  assert.deepEqual(days(yearDivs(special, at("2025-11-01"))), ["2025-04-01", "2025-05-14", "2025-10-01"]);
  assert.deepEqual(yearDivs([], at("2026-10-30")), []);
});

test("how dependable a payer has been: raised, held, cut, and five years' growth", () => {
  const now = at("2026-10-30");
  // (a dividend raised each year, two a year, from 2017)
  const rising = []; for (let y = 2017; y <= 2026; y++) { const a = 10 * 1.06 ** (y - 2017); rising.push([`${y}-03-10`, a / 3], [`${y}-09-10`, (2 * a) / 3]); }
  const r = health(divs(rising), now);
  assert.equal(r.raised, 7, "raised every year from 2019 to 2025 (2017 is where the history starts)");
  assert.equal(r.cut, null);
  assert.ok(Math.abs(r.growth - 0.06) < 0.002, `growing about 6% a year (${r.growth})`);
  // (held flat, then cut by half in 2023, then flat again)
  const cutList = []; for (let y = 2016; y <= 2026; y++) { const a = y >= 2023 ? 5 : 10; cutList.push([`${y}-05-01`, a], [`${y}-11-01`, a]); }
  const c = health(divs(cutList), now);
  assert.equal(c.cut, 2023); assert.equal(c.raised, 0); assert.equal(c.held, 2, "no cut in 2024 or 2025");
  // (a payment that slips from December into January isn't a cut and a raise)
  const slip = divs([["2020-03-01", 10], ["2020-06-01", 10], ["2020-09-01", 10], ["2020-12-01", 10], ["2021-03-01", 10], ["2021-06-01", 10], ["2021-09-01", 10], ["2021-12-01", 10],
    ["2022-03-01", 10], ["2022-06-01", 10], ["2022-09-01", 10], ["2023-01-03", 10], ["2023-03-01", 10], ["2023-06-01", 10], ["2023-09-01", 10], ["2023-12-01", 10],
    ["2024-03-01", 10], ["2024-06-01", 10], ["2024-09-01", 10], ["2024-12-01", 10], ["2025-03-01", 10], ["2025-06-01", 10], ["2025-09-01", 10], ["2025-12-01", 10]]);
  assert.equal(health(slip, now).cut, null, "three in 2022 and five in 2023: not compared");
  assert.equal(health([], now), null, "nothing paid: nothing to say");
  assert.equal(health(divs([["2025-05-01", 3]]), now).growth, null, "too short a history for five years' growth");
});

test("what a year's income could come to: reinvested, taken as cash, and the year a goal's reached", () => {
  const flat = project({ worth: 10000, yield: 0.04, growth: 0, add: 0, reinvest: false });
  assert.equal(flat.income.length, 21); assert.equal(flat.income[0], 400); assert.equal(flat.income[20], 400, "taken as cash, with no growth: the same each year");
  assert.equal(Math.round(flat.cash), 8000, "twenty years of £400");
  const re = project({ worth: 10000, yield: 0.04, growth: 0, reinvest: true, goal: 800 });
  assert.ok(Math.abs(re.income[1] - 416) < 1e-9, "a year's dividends buy 4% more"); assert.equal(re.reach, 18, "£800 a year once it's doubled: 1.04^18 ≥ 2");
  assert.equal(project({ worth: 7290, yield: 0.009, growth: 0.05, goal: 100000 }).reach, null, "out of reach within sixty years");
  assert.equal(project({ worth: 20000, yield: 0.05, growth: 0, goal: 600 }).reach, 0, "there already");
  const adding = project({ worth: 0, yield: 0.04, growth: 0, add: 100, reinvest: false });
  assert.equal(adding.income[1], 48, "£1,200 put in over a year, at 4%");
});

test("the UK's tax year: 6 April to 5 April, by London's days", () => {
  assert.equal(taxYearOf(Date.parse("2026-10-30T12:00:00Z")).name, "2026–27");
  assert.equal(taxYearOf(Date.parse("2026-04-05T22:59:00Z")).name, "2025–26", "11.59pm on 5 April, London (BST): still the old year");
  assert.equal(taxYearOf(Date.parse("2026-04-05T23:00:00Z")).name, "2026–27", "midnight in London: the new one");
  const ty = taxYearOf(Date.parse("2027-01-15T12:00:00Z"));
  assert.equal(ty.start, 2026); assert.equal(new Date(ty.from).toISOString(), "2026-04-05T23:00:00.000Z"); assert.equal(new Date(ty.to).toISOString(), "2027-04-05T23:00:00.000Z");
  assert.equal(taxYearOf(Date.parse("2000-01-01T00:00:00Z")).name, "1999–00");
});

test("a dividend to come a year on from this month: said with its year, so its day isn't read as one that's been", () => {
  const now = new Date(2026, 9, 31);
  assert.equal(yearOn(new Date(2027, 9, 1), now), true, "on 31 October, last 1 October's expected again: 1 Oct 2027");
  assert.equal(yearOn(new Date(2027, 8, 30), now), false, "next September: no year needed");
  assert.equal(yearOn(new Date(2026, 10, 20), now), false);
  assert.equal(yearOn(new Date(2027, 0, 5), new Date(2026, 0, 31)), true, "January's a year on, from January");
});

test("a spreadsheet that opens safely: quoted where it must be, and no formulas from names", () => {
  assert.equal(csv([["Holding", "Amount"], ["Shell plc", 12.5], ['Say "hi", Ltd', 3], ["=HYPERLINK(1)", 1], ["-x", null]]),
    'Holding,Amount\r\nShell plc,12.5\r\n"Say ""hi"", Ltd",3\r\n\'=HYPERLINK(1),1\r\n\'-x,\r\n');
  assert.equal(csv([[-5]]), "-5\r\n", "a negative number's still a number");
});

test("the evening wrap: what went ex-dividend today, and on a month's first weekday, last month's and the tax year's", () => {
  const held = [{ symbol: "JAM.L", name: "JPMorgan American", x: { cur: "GBP", tz: "Europe/London" } }, { symbol: "AAPL", name: "Apple", x: { cur: "USD", tz: "America/New_York" } }];
  const fx = { GBP: 1, USD: 0.8 };
  const inc = { "JAM.L": { got: [{ t: at("2026-04-16T08:00:00Z"), amount: 0.0455, qty: 1100 }, { t: at("2026-10-29T08:00:00Z"), amount: 0.0145, qty: 1100 }] },
    AAPL: { got: [{ t: at("2026-11-02T14:30:00Z"), amount: 0.26, qty: 100 }] } };
  assert.equal(wrapIncome(inc, held, fx, Date.parse("2026-10-29T17:00:00Z")), "JPMorgan American went ex-dividend today: about £15.95 to come in the next few weeks.");
  // (Monday 2 November: the month's first weekday, and Apple ex today in New York)
  assert.equal(wrapIncome(inc, held, fx, Date.parse("2026-11-02T21:30:00Z")),
    "Apple went ex-dividend today: about £20.80 to come in the next few weeks. October's dividends came to £15.95, £86.80 so far this tax year.");
  assert.equal(wrapIncome(inc, held, fx, Date.parse("2026-10-28T17:00:00Z")), "", "nothing today, and not a month's start");
  assert.equal(wrapIncome(null, held, fx, Date.now()), "", "no history: nothing said");
});
