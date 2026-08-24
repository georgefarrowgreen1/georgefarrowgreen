"""One web page, read through the gate and treated as hostile.

This is the most dangerous input in the system and it is worth being blunt
about why. Email is untrusted, but an attacker has to send it to you. With a
fetch tool an attacker chooses *which page you read* — so the content and
the destination are both theirs. Three separate things keep that bounded,
and none of them is a filter:

  * **Where.** Every request goes through core/egress.py, which will only
    reach a host on the allowlist. Adding a web source allows
    exactly the one host in the URL you gave it, and removing it takes that
    host away again.

  * **What comes back.** The page arrives as fields — a title, a block of
    text, a byte count — with provenance 'untrusted' and the quarantine
    flag already on it. There is no method here that returns prose for
    something else to paraphrase.

  * **Who is allowed to read it.** Nothing. On purpose. `core/ask.py` has no
    tool that reaches this connector, and it must not get one: Ask holds
    your mail and calendar in the same context, so a model that could also
    fetch a URL is the injection trifecta with a way out — private data,
    untrusted instructions, and an outbound channel that the attacker names.
    A page is read when a person asks for it, by `connect.py peek`, and what
    a workflow does with the fields is written by you.

HTML is turned into text here rather than handed on: markup is where an
instruction hides from a person reading the page but not from a model, and
a <title> is quite enough to carry one.
"""
from __future__ import annotations

from html.parser import HTMLParser
from urllib.parse import urlparse

from core import egress
from core.harness import quarantine_read

# A page is bigger than an API answer. Still bounded: this reads documents,
# not archives, and an unbounded reader is a way to fill the disk with one
# response.
MAX_BYTES = 1024 * 1024
SKIP = {"script", "style", "noscript", "template", "svg", "canvas"}


class _Text(HTMLParser):
    """Visible text and the title. Nothing else survives the trip."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False
        self._had_title = False

    def handle_starttag(self, tag, _attrs):
        if tag in SKIP:
            self._skip += 1
        elif tag == "title" and not self._skip and not self._had_title:
            # The first <title> outside anything skipped. An inline <svg>
            # carries its own — gov.uk's crown logo does — and taking them
            # all gave "UK bank holidays - GOV.UKGOV.UK".
            self._in_title = True

    def handle_endtag(self, tag):
        if tag in SKIP and self._skip:
            self._skip -= 1
        elif tag == "title" and self._in_title:
            self._in_title = False
            self._had_title = True
        elif tag in ("p", "div", "br", "li", "tr", "h1", "h2", "h3", "section"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def to_text(html: str) -> tuple[str, str]:
    """(title, text). Whitespace collapsed, blank lines kept as paragraphs.

    Text hidden by CSS is kept, deliberately. A display:none block is where
    an instruction goes when it is meant for a model and not for the person
    reading the page — dropping it would hide it from the triage flag as
    well, which is the one place it should be visible.
    """
    p = _Text()
    try:
        p.feed(html)
        p.close()
    except Exception:                                        # noqa: BLE001
        # A parser that gives up on malformed markup must still hand back
        # what it read. Half a page is a fact; an exception is not.
        pass
    lines = []
    for chunk in "".join(p.parts).splitlines():
        line = " ".join(chunk.split())
        if line or (lines and lines[-1]):
            lines.append(line)
    return " ".join(p.title.split()), "\n".join(lines).strip()


class Web:
    """One page. Read-only, and there is no method here that follows a link."""

    kind = "web"
    writes = False

    def __init__(self, ref: str = "", store=None):
        self.ref = (ref or "").strip()
        self.store = store

    def host(self) -> str:
        return (urlparse(self.ref).hostname or "").lower()

    def read(self, url: str | None = None) -> dict:
        """The page, as fields. Quarantined before it is handed to anyone.

        A url may be given, and it is checked against the same allowlist as
        everything else — being on this connector is not permission to read
        somewhere else.
        """
        target = (url or self.ref).strip()
        if not target:
            raise egress.Refused(
                "no page set for this source. Give it one:  "
                "connect.py add web https://example.com/prices")
        got = egress.fetch(self.store, target,
                           max_bytes=MAX_BYTES)
        title, text = to_text(got["text"])
        # quarantine_read supplies text, instruction_like and provenance.
        # The title goes through it too — it is the shortest, most-quoted
        # string on a page and an instruction fits in one — and the two
        # flags are OR'd. Reading the title's flag and then dropping it, as
        # this did at first, means a page whose *title* is the injection
        # comes back marked clean.
        body = quarantine_read(text)
        head = quarantine_read(title)
        return {"url": got["url"], "asked_for": target,
                "title": head["text"][:300],
                "bytes": got["bytes"], "hops": got["hops"],
                "chars": len(text), **body,
                "instruction_like": bool(body["instruction_like"]
                                         or head["instruction_like"])}

    def check(self) -> dict:
        if not self.ref:
            return {"ok": False, "detail": "no page set for this source"}
        try:
            page = self.read()
        except egress.Refused as e:
            return {"ok": False, "url": self.ref, "detail": str(e)}
        return {"ok": True, "url": page["url"], "title": page["title"],
                "chars": page["chars"], "bytes": page["bytes"],
                "instruction_like": page["instruction_like"],
                "sends": f"a GET to {self.host()}, and nothing else"}
