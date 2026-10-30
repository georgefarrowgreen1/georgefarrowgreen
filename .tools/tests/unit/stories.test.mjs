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

test("a headline's words: what it's about, endings off, the small words out", () => {
  assert.deepEqual([...words("Okta Joins the S&P 500 as Shares Jump")], ["okta", "join", "s&p", "500", "share", "jump"]);
  assert.deepEqual(storiesOf([]), []);
});
