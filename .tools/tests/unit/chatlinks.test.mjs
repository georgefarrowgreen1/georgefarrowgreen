// Chat's links in messages (pigeon/links.js): the web addresses in what's written, found as they're meant (Markets'
// Send in Chat sends a story's title and its link), with what's around them left out, and never anything but a web page
import { test } from "node:test";
import assert from "node:assert/strict";
import { linkParts, linksIn, hrefOf } from "../../../pigeon/links.js";

test("a shared story: its title as words, its link a link", () => {
  const p = linkParts("Rates held at 4% (BBC)\nhttps://www.bbc.co.uk/news/business-123");
  assert.deepEqual(p, [{ text: "Rates held at 4% (BBC)\n" }, { text: "https://www.bbc.co.uk/news/business-123", href: "https://www.bbc.co.uk/news/business-123" }]);
});

test("what's around an address stays outside it: a full stop, a comma, a bracket it's written in, a quote mark", () => {
  assert.deepEqual(linksIn("See https://example.com/a. Or (https://example.com/b), or “https://example.com/c”!"),
    ["https://example.com/a", "https://example.com/b", "https://example.com/c"]);
  // (a bracket that's part of it stays: a Wikipedia page)
  assert.deepEqual(linksIn("https://en.wikipedia.org/wiki/Pigeon_(disambiguation)."), ["https://en.wikipedia.org/wiki/Pigeon_(disambiguation)"]);
  const p = linkParts("go to www.example.com.");
  assert.deepEqual(p, [{ text: "go to " }, { text: "www.example.com", href: "https://www.example.com/" }, { text: "." }]);
});

test("only ever a web page, with a real name: nothing else is made a link", () => {
  for (const t of ["javascript:alert(1)", "data:text/html,hi", "ftp://example.com", "https://localhost/x", "https://", "mailto:a@b.co", "https://google.com@evil.example/"])
    assert.deepEqual(linksIn(t), [], t);
  assert.equal(hrefOf("javascript:alert(1)"), null);
  assert.equal(hrefOf("HTTP://Example.COM/Path"), "http://example.com/Path");
});

test("words with no address come back as they are, and every address once", () => {
  assert.deepEqual(linkParts("No links here, just words."), [{ text: "No links here, just words." }]);
  assert.deepEqual(linkParts(""), [{ text: "" }]);
  assert.deepEqual(linksIn("https://a.example/ and again https://a.example/ then https://b.example"), ["https://a.example/", "https://b.example/"]);
  // (joined back up, the pieces are what was written)
  const t = "Look: https://x.example/p?q=1&r=2#h, and www.y.example!";
  assert.equal(linkParts(t).map((x) => x.text).join(""), t);
});
