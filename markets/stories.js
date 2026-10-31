// News stories, sorted out for Markets (app.js, desk.js): which are the same story told by different publishers, so
// it's shown once with the others under it. Plain functions (.tools/tests/unit/stories.test.mjs).

// (words that say nothing of what a story's about)
const STOP = new Set(("the a an and or of to in on at for as by with from its it is are was were be been being this that these those what why how who "
  + "will would can could may might should after before over under into about than then just more most new says said amid while has have had not but "
  + "today week year now up down").split(" "));
// (capitalised in a headline, and still nothing of what it's about)
const CAP_STOP = new Set("the a an why what how who when where will can could should did does is are was were here this these stock stocks shares share market markets report update news today week".split(" "));
const INDEX_TICKER = /^\^|^(SPY|VOO|IVV|QQQ|DIA|IWM|VTI|VT|ES=F|NQ=F|YM=F|RTY=F)$/;
// (a market's words, its indices, where it is and how it's told: in common, they say two stories are about the same
// market, not the same story: "FTSE 100 closes higher" and "FTSE 100 closes lower")
const MARKET = new Set(("s&p 500 ftse 100 250 350 dow jones nasdaq composite russell 2000 dax cac nikkei 225 hang seng stoxx 600 topix kospi sensex "
  + "london wall street europe european asia asian stock stocks share shares market markets index indices futures live trading traders investors").split(" "));
// (which way a headline says it went: up, down, or neither, or both)
const UP = /\b(rise[sn]?|rising|rose|gain(s|ed|ing)?|higher|rall(y|ies|ied|ying)|jump(s|ed|ing)?|climb(s|ed|ing)?|surge[sd]?|surging|soar(s|ed|ing)?)\b/i;
const DOWN = /\b(fall(s|ing)?|fell|drop(s|ped|ping)?|lower|slide[sd]?|sliding|slump(s|ed|ing)?|sink(s|ing)?|sank|retreat(s|ed|ing)?|tumble[sd]?|tumbling|decline[sd]?|declining|slip(s|ped|ping)?|plunge[sd]?|plunging|drag(s|ged|ging)?)\b/i;
const way = (title) => { const u = UP.test(title), d = DOWN.test(title); return u === d ? null : u ? "up" : "down"; };
// (a word's ending taken off: joins, join; shares, share; boxes, box; following, follow; but not status or press)
function stem(w) {
  if (w.length <= 4 || /(ss|us|is)$/.test(w)) return w;
  if (/(ses|xes|zes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.endsWith("ed")) return w.slice(0, -2);
  return w.endsWith("s") ? w.slice(0, -1) : w;
}
// a headline's words that say what it's about, their endings taken off
export function words(title) {
  const out = new Set();
  for (const w of String(title).toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9&]+/)) if (w.length >= 3 && !STOP.has(w)) out.add(stem(w));
  return out;
}
// its names: the capitalised words that aren't just a headline's capitals (Okta, S&P; not Why or Stock)
const names = (title) => new Set((String(title).match(/\b[A-Z][A-Za-z0-9&.-]{2,}/g) || []).map((w) => w.toLowerCase()).filter((w) => !CAP_STOP.has(w)));
// Two stories the same story: three or more of the words that say what they're about in common, one of them a name or
// a company both name (Okta joining the S&P 500, told three ways), and neither saying it went up where the other says
// down; or five in common however they're written. A market's words (MARKET) count among the three, but aren't the
// name, nor among the five: two stories about the FTSE 100 are the same story only where two more of their words are in
// common (chipmakers sliding, and the S&P 500 with them, told twice)
const MARKET_WORDS = new Set([...MARKET].map(stem));
export function sameStory(a, b) {
  const wa = words(a.title), wb = words(b.title);
  let shared = 0, own = 0;
  for (const w of wa) if (wb.has(w)) { shared++; if (!MARKET_WORDS.has(w)) own++; }
  if (own >= 5) return true;
  const da = way(a.title), db = way(b.title);
  if (shared < 3 || (da && db && da !== db)) return false;
  const na = names(a.title), nb = names(b.title);
  let market = false;
  for (const n of na) if (nb.has(n)) { if (!MARKET.has(n)) return true; market = true; }
  const ta = (a.tickers || []).filter((t) => !INDEX_TICKER.test(t));
  return ta.some((t) => (b.tickers || []).includes(t)) || (market && own >= 2);
}
// Stories in the same stories: [{ lead (the first of them, as given), more: [the rest] }], in the order given; each the
// same story as its lead, as the reader's More on this has it (never only as one of the rest's, which chained stories
// that aren't the same together, one to the next)
export function storiesOf(list) {
  const out = [];
  for (const s of list) {
    const c = out.find((g) => sameStory(g.lead, s));
    if (c) c.more.push(s); else out.push({ lead: s, more: [] });
  }
  return out;
}
