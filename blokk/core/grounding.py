"""Every figure in a draft, checked against what the draft was drawn from.

The quiet failure this whole architecture is shaped around is a fluent
sentence containing a number nobody supplied. A draft that offers nights the
calendar does not have gets caught — the dates are checked, and there is a
probe for it. A draft that quotes £140 when the rate card says £120 does not:
it is well-formed, it cites the right email, the provenance is right, the
quarantine flag is clear, and the figure is wrong. Somebody taps Approve
because everything else about the card is correct.

Nothing anywhere checked this. The regression suite carries one frozen
example called "no invented commitments" asserted as a substring, which
catches the one sentence it was written against and nothing else.

So: pull every figure out of the body, pull every figure out of the evidence
the proposal cites, and name the ones that are in the first and not the
second.

Three deliberate limits, because the value of this is entirely in whether
anybody still reads it after a fortnight.

  * **It flags, it does not block.** A total is arithmetic — two nights at
    £120 is £240 and 240 appears nowhere in the evidence. Refusing that
    would be refusing the model's job. Naming it costs a glance.

  * **Values, not strings.** "£1,200.00", "1200" and "1,200" are one
    figure. Comparing as written would flag formatting.

  * **Small counts are ignored.** "a couple of nights", "2 people", "3pm" —
    numbers under a threshold are how English writes, not claims about
    somebody's data, and flagging them buries the £140 in noise.

What it is not is a guarantee. A model that quotes £120 for the wrong week
passes this cleanly, because 120 is in the evidence. It catches invention,
not misuse, and the sentence on the card says so.
"""
from __future__ import annotations

import re

# Digits, with thousands separators and decimals. Deliberately not anchored
# on £ or $: a figure written bare is the one worth checking. It has to end
# on a digit — "£140, plus" otherwise reports the figure as "140," and a
# check whose output looks like a typo does not get read twice.
_NUM = re.compile(r"\d(?:[\d,]*\d)?(?:\.\d+)?")

# Under this, a number is prose. Chosen at 32 so every day-of-month survives
# — a draft naming "the 26th" against a calendar row of 2026-08-26 would
# otherwise depend on the date's format to match, which is exactly the kind
# of check that fails for a reason nobody can see.
SMALL = 32


def figures(text) -> list[tuple[str, float]]:
    """Every figure in some text, as written and as a value."""
    if not isinstance(text, str):
        return []
    out = []
    for m in _NUM.finditer(text):
        raw = m.group(0)
        try:
            out.append((raw, float(raw.replace(",", ""))))
        except ValueError:                      # "1,2,3" and similar
            continue
    return out


def _values(thing, into: set) -> set:
    """Every figure anywhere inside a nested structure.

    Walks rather than serialising. json.dumps would work and would also
    invent figures out of the structure itself — a list index, a float
    written by the encoder — and a check that manufactures its own evidence
    passes things it should not.
    """
    if isinstance(thing, bool):
        return into                              # True is not a figure
    if isinstance(thing, (int, float)):
        into.add(round(float(thing), 4))
        # 2026-08-26 arrives as three integers when a date is split, and as
        # one string when it is not. Both are covered: the string branch
        # below pulls 2026, 08 and 26 out of it.
        return into
    if isinstance(thing, str):
        for _, v in figures(thing):
            into.add(round(v, 4))
        return into
    if isinstance(thing, dict):
        for k, v in thing.items():
            # Keys are field names this side wrote. A key that happens to
            # contain a digit is not evidence of anything.
            _values(v, into)
        return into
    if isinstance(thing, (list, tuple)):
        for v in thing:
            _values(v, into)
    return into


def unsupported(body: str, evidence) -> list[str]:
    """The figures in `body` that are not anywhere in `evidence`.

    Ordered as they appear and de-duplicated, because a price repeated four
    times in a reply is one thing to check, not four.
    """
    have = _values(evidence, set())
    out, seen = [], set()
    for raw, value in figures(body):
        v = round(value, 4)
        if v < SMALL or v in have or v in seen:
            continue
        seen.add(v)
        out.append(raw)
    return out


def attach(body: str, evidence: dict) -> dict:
    """The evidence, with the unsupported figures named in it.

    Written at queue time rather than computed when the card is drawn,
    because the evidence is what the run actually read and the run is over
    by the time anybody looks. Recomputing later against a rate card that
    has since changed would answer a different question.

    The key is absent when there is nothing to say. A card carrying
    `figures_unsupported: []` reads as a card that checked and found
    nothing, which is true — but it puts an empty list into every row in the
    queue to say it, and the surfaces that render evidence would then all
    need to know that empty means fine.
    """
    ev = dict(evidence or {})
    odd = unsupported(body, ev)
    if odd:
        ev["figures_unsupported"] = odd
    return ev
