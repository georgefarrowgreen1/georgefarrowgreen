// The same story told by different publishers, told apart from different stories (markets/stories.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameStory, storiesOf, words } from "../../../markets/stories.js";

const st = (title, tickers = []) => ({ title, tickers });
const okta = [st("Okta Stock Can Find More Buyers as It Joins the S&P 500", ["OKTA"]), st("Okta jumps after-hours following tapped inclusion in the S&P 500", ["OKTA"]),
  st("Okta Set to Join S&P 500; Others to Join S&P MidCap 400 and S&P SmallCap 600", ["OKTA", "^GSPC"])];

test("one story, three publishers: Okta joining the S&P 500", () => {
  assert.ok(sameStory(okta[0], okta[1]) && sameStory(okta[0], okta[2]) && sameStory(okta[1], okta[2]));
  const g = storiesOf(okta);
  assert.equal(g.length, 1); assert.equal(g[0].lead, okta[0]); assert.equal(g[0].more.length, 2);
});

test("different stories stay apart, even written alike", () => {
  assert.equal(sameStory(st("Was There Any Sign ADT Stock Would Run?", ["ADT"]), st("Did The Market Read AppLovin Stock Right?", ["APP"])), false, "one word in common");
  assert.equal(sameStory(st("Rolls-Royce shares move after the morning's update", ["RR.L"]), st("Tesco shares move after the morning's update", ["TSCO.L"])), false, "the same words, about different companies");
  assert.equal(sameStory(st("S&P 500 falls as tech slides"), st("S&P 500 rises on hopes for a rate cut")), false, "the index alone isn't a story");
  assert.equal(sameStory(st("Apple beats on earnings", ["AAPL"]), st("Apple faces a lawsuit over the App Store", ["AAPL"])), false, "one company, two stories");
  assert.ok(sameStory(st("Apple unveils its new iPhone at September event", ["AAPL"]), st("Apple shares slip after iPhone event disappoints", ["AAPL"])), "one company, one event");
});

test("one market, different stories: its index and where it is aren't a story in common", () => {
  assert.equal(sameStory(st("FTSE 100 closes higher as housebuilders gain"), st("FTSE 100 closes lower as banks drag")), false, "the index, and a word");
  assert.equal(sameStory(st("S&P 500 hits record high on tech rally"), st("Nasdaq slips as S&P 500 retreats from record")), false, "the index, and record");
  assert.equal(sameStory(st("FTSE 100 live: London stocks rise after Bank of England rate decision"), st("FTSE 100 live: London stocks fall after US jobs data")), false, "five in common, three of them the market");
  assert.equal(sameStory(st("Dow Jones today: stocks rise as tech rallies"), st("Dow Jones today: stocks fall on inflation fears")), false);
  assert.equal(sameStory(st("FTSE 100 rises as miners rally on China hopes"), st("FTSE 100 falls as miners slump on China worries")), false, "the same things in it, gone opposite ways");
  assert.ok(sameStory(st("S&P 500 falls as chipmakers slide on a weaker outlook", ["^GSPC"]), st("Chipmakers slide, dragging the S&P 500 lower", ["^GSPC"])), "one market's story, told twice");
  assert.ok(sameStory(st("Rolls-Royce raises profit guidance as engine flying hours recover"), st("Rolls-Royce lifts profit guidance on recovering engine flying hours")), "one company, one story");
});

test("stories gathered under their lead, never one story to the next", () => {
  // (b is a's story, and c is b's, but c isn't a's: c stands apart, as the reader's More on This would have it)
  const a = st("Tesco profit jumps as grocery sales climb", ["TSCO.L"]), b = st("Tesco profit jumps on strong Christmas sales", ["TSCO.L"]), c = st("Strong Christmas sales lift Sainsbury and Tesco shares", ["SBRY.L", "TSCO.L"]);
  assert.ok(sameStory(a, b) && sameStory(b, c) && !sameStory(a, c));
  const g = storiesOf([a, b, c]);
  assert.equal(g.length, 2); assert.deepEqual(g[0].more, [b]); assert.equal(g[1].lead, c);
});

test("a headline's words: what it's about, endings off, the small words out", () => {
  assert.deepEqual([...words("Okta Joins the S&P 500 as Shares Jump")], ["okta", "join", "s&p", "500", "share", "jump"]);
  assert.deepEqual(storiesOf([]), []);
});
