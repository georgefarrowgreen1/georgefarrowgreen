#!/usr/bin/env python3
"""The chat mark, derived from the block's top face rather than invented.

identity.html says what the mark means: an append-only stack of slabs, and
"the top slab floats -- that's the step queued and waiting on you, and the
exposed blue face is the slot the next one drops into."

An ask box is that slot. So this is not a stock speech bubble with a Blokk
sticker on it: the body IS the block's top face -- the same rhombus as the
mark and the wordmark's O, the same 45 degrees at the same 0.568 vertical
scale, the same blue -- with a tail.

The tail's two upper corners sit *on* the rhombus's lower-left edge and its
apex continues that edge's direction, so it belongs to the geometry instead
of being a triangle stuck underneath. Drawn straight down it looked like a
map pin; the numbers below are the ones that still read as a bubble at 20px
and do not taper to a thread at 72.

Parametric because the rest of the brand is: change RATIO and the mark, the
wordmark's O and this all move together, which is the only reason they look
like one family at three sizes.

    python3 brand/chatmark.py            write the svg files
    python3 brand/chatmark.py --inline   the 24px glyph, for a stylesheet
"""
from __future__ import annotations

import pathlib
import sys

RATIO = 0.568          # the isometric vertical scale, from the mark
BLUE = "#0A84FF"

# The tail, in fractions of the lower-left edge and of the body's half-height.
T0, T1 = 0.02, 0.34    # where its base sits on that edge
LEAN, DROP = 0.34, 1.75


def _pts(points) -> str:
    return " ".join(f"{x:g},{y:g}" for x, y in points)


def rhombus(cx: float, cy: float, half_w: float) -> str:
    """The block's top face."""
    h = half_w * RATIO
    return _pts([(cx, cy - h), (cx + half_w, cy), (cx, cy + h), (cx - half_w, cy)])


def tail(cx: float, cy: float, half_w: float) -> str:
    h = half_w * RATIO
    bottom, left = (cx, cy + h), (cx - half_w, cy)
    def along(t: float):
        return (bottom[0] + (left[0] - bottom[0]) * t,
                bottom[1] + (left[1] - bottom[1]) * t)
    return _pts([along(T0), along(T1), (cx - half_w * LEAN, cy + h * DROP)])


def svg(size: int = 24, mono: bool = False) -> str:
    """The mark at any size, centred on its own bounds.

    Two polygons, because a third is dust at 20px: a queued slab under the
    tail was tried and cut -- at the sizes this is actually seen it read as
    a speck of dirt on the screen.

    Centred by measuring rather than by eye. The body's centre is not the
    composition's centre once a tail hangs off one corner, and a glyph that
    is 1px high in its own box is a glyph that sits 1px high inside every
    button that centres it.
    """
    half = size * 0.358
    cx, cy = size / 2, size / 2
    shapes = [rhombus(cx, cy, half), tail(cx, cy, half)]
    xs, ys = [], []
    for shape in shapes:
        for pair in shape.split():
            x, y = pair.split(",")
            xs.append(float(x)); ys.append(float(y))
    dx = size / 2 - (min(xs) + max(xs)) / 2
    dy = size / 2 - (min(ys) + max(ys)) / 2
    cx, cy = cx + dx, cy + dy
    fill = "currentColor" if mono else BLUE
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}"'
        f' role="img" aria-label="Ask Blokk">\n'
        f'  <polygon points="{rhombus(cx, cy, half)}" fill="{fill}"/>\n'
        f'  <polygon points="{tail(cx, cy, half)}" fill="{fill}"/>\n'
        f'</svg>\n')


if __name__ == "__main__":
    if "--inline" in sys.argv:
        print(svg(24), end="")
    else:
        here = pathlib.Path(__file__).parent
        for name, kw in (("blokk-chat.svg", {}), ("blokk-chat-mono.svg", {"mono": True})):
            (here / name).write_text(svg(512, **kw))
            print(f"wrote {here / name}")
