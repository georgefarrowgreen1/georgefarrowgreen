// Your income from dividends, worked out for the Income sheet (app.js incomeView): which payments were one-offs, how
// dependable each payer has been, what a year's income could come to, the UK's tax year, and a year's payments as a
// spreadsheet. Plain functions of what they're given (.tools/tests/unit/marketsincome.test.mjs).

const YEAR = 365.25 * 86400;

// Each dividend, marked if it was a one-off (a special): more than twice the average of what it paid in the three years
// either side, and more than 1.8 times the largest of its others there that weren't. Enough others to say what's usual
// (two), or it's taken as one of them. A final twice its interim is usual; a payout five times the rest isn't.
// divs: [{ t (seconds), amount }] → the same, each with special: true or false
export function marked(divs) {
  return divs.map((d) => {
    const near = divs.filter((e) => Math.abs(e.t - d.t) < 3 * YEAR), mean = near.reduce((a, e) => a + e.amount, 0) / near.length;
    const usual = near.filter((e) => e !== d && e.amount <= 2 * mean);
    return { ...d, special: usual.length >= 2 && d.amount > 2 * mean && d.amount > 1.8 * Math.max(...usual.map((e) => e.amount)) };
  });
}

// How dependable a payer has been, from its regular dividends (specials aside) in each whole calendar year it's paid:
// { raised (years running it's paid more than the year before), held (years running it's paid no less), cut (the last
// year it paid less, within the last six; else null), growth (a year, over five: the last two years against the two five
// years before, so a payment that slips into the next year doesn't count as a cut and a raise; null without seven
// years), years (whole years paid in) }. Years with a different number of payments (one slipped across New Year) aren't
// compared at all. null if it's paid nothing.
export function health(divs, now = Date.now() / 1000) {
  const regular = marked(divs).filter((d) => !d.special);
  if (!regular.length) return null;
  const yearOf = (t) => new Date(t * 1000).getUTCFullYear(), thisYear = yearOf(now), first = yearOf(regular[0].t), by = new Map();
  for (const d of regular) { const y = yearOf(d.t), b = by.get(y) || { v: 0, n: 0 }; b.v += d.amount; b.n++; by.set(y, b); }
  // (the first year's only part of one: where the history starts, not where it paid from)
  const ys = [];
  for (let y = first + 1; y < thisYear; y++) ys.push({ y, ...(by.get(y) || { v: 0, n: 0 }) });
  const cmp = (a, b) => (a.n && b.n && a.n !== b.n ? 0 : a.v > b.v * 1.005 ? 1 : a.v < b.v * 0.95 ? -1 : a.v >= b.v * 0.97 ? 0.5 : -0.5);
  let raised = 0, held = 0, cut = null;
  for (let i = ys.length - 1; i > 0; i--) { const c = cmp(ys[i], ys[i - 1]); if (c === 1) raised++; else if (c !== 0) break; }
  for (let i = ys.length - 1; i > 0; i--) { const c = cmp(ys[i], ys[i - 1]); if (c >= 0) held++; else break; }
  for (let i = ys.length - 1; i > 0 && ys[i].y >= thisYear - 6; i--) if (cmp(ys[i], ys[i - 1]) === -1) { cut = ys[i].y; break; }
  const n = ys.length, late = n >= 7 ? ys[n - 1].v + ys[n - 2].v : 0, early = n >= 7 ? ys[n - 6].v + ys[n - 7].v : 0;
  return { raised, held, cut, growth: late > 0 && early > 0 ? (late / early) ** (1 / 5) - 1 : null, years: n };
}

// What a year's income could come to, a year at a time for twenty years, from: worth (what it's worth now), yield (a
// year's income on that), growth (a year: of the dividends, and of prices with them, so the yield stays as it is), add
// (put in each month, at the same yield), reinvest (each year's dividends buy more), goal (a year's income to reach).
// → { income: [now, a year on, ... twenty years on], reach (years till a year's income is the goal, within sixty;
// else null), cash (paid out over the twenty years, where it isn't reinvested) }
export function project({ worth, yield: y, growth: g, add = 0, reinvest = true, goal = 0 }) {
  const income = [];
  let v = worth, reach = null, cash = 0;
  for (let t = 0; t <= 60; t++) {
    const inc = v * y;
    if (t <= 20) income.push(inc);
    if (reach == null && goal > 0 && inc >= goal) reach = t;
    if (!reinvest && t < 20) cash += inc;
    if (t >= 20 && reach != null) break;
    v = v * (1 + g) + (reinvest ? inc : 0) + add * 12;
  }
  return { income, reach, cash };
}

// The UK's tax year a moment is in: 6 April to 5 April, by London's days. → { start (its first year, 2026), name
// ("2026–27"), from and to (ms: the first moment of 6 April, and of the next 6 April) }
const LONDON = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
export function taxYearOf(t = Date.now()) {
  const [y, m, d] = LONDON.format(new Date(t)).split("-").map(Number), start = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  const at = (yr) => { const guess = Date.UTC(yr, 3, 6); return guess - offset(guess); };
  return { start, name: `${start}–${String((start + 1) % 100).padStart(2, "0")}`, from: at(start), to: at(start + 1) };
}
// (London's offset from UTC at a moment, in ms: an hour in summer)
function offset(t) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
}

// Rows as a spreadsheet (CSV): each cell quoted where it has to be, and text that a spreadsheet would take for a formula
// (=, +, -, @ first) made plain text
export function csv(rows) {
  return rows.map((r) => r.map((c) => {
    let s = c == null ? "" : String(c);
    if (typeof c === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n") + "\r\n";
}
