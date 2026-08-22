"""A QR encoder, because typing http://192.168.1.69:8080/?t=EwBj3gRNOCNEZW06
into a phone keyboard is how people conclude the thing does not work.

Byte mode, error correction level M, versions 1-10 — comfortably more than a
LAN URL needs. Stdlib only, like everything else here: a dependency for one
screen of output is not a trade worth making, and this file is 200 lines that
will still run in two years.

Correctness is not eyeballed. tests compare every module of the output against
segno for a spread of payloads and versions; segno is a dev-time check and is
never imported by Blokk.
"""
from __future__ import annotations

# ── tables ──────────────────────────────────────────────────────────────────
# Per version at level M: (total codewords, ec per block, [(blocks, data)]).
# Level M rather than L: this gets pointed at by a phone camera, at an angle,
# on a screen with glare. The spare capacity is not doing anything else.
SPEC = {
    1:  (26,  10, [(1, 16)]),
    2:  (44,  16, [(1, 28)]),
    3:  (70,  26, [(1, 44)]),
    4:  (100, 18, [(2, 32)]),
    5:  (134, 24, [(2, 43)]),
    6:  (172, 16, [(4, 27)]),
    7:  (196, 18, [(4, 31)]),
    8:  (242, 22, [(2, 38), (2, 39)]),
    9:  (292, 22, [(3, 36), (2, 37)]),
    10: (346, 26, [(4, 43), (1, 44)]),
}
ALIGN = {1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
         7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]}

# ── GF(256) ─────────────────────────────────────────────────────────────────
EXP = [0] * 512
LOG = [0] * 256
_x = 1
for _i in range(255):
    EXP[_i] = _x
    LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:                      # x^8 + x^4 + x^3 + x^2 + 1
        _x ^= 0x11D
for _i in range(255, 512):
    EXP[_i] = EXP[_i - 255]


def _mul(a: int, b: int) -> int:
    return 0 if a == 0 or b == 0 else EXP[LOG[a] + LOG[b]]


def _generator(n: int) -> list[int]:
    """Coefficients of prod (x + a^i) for i < n, highest degree first.

    Length is n+1, and g[0] is always 1 — the leading term. Dropping it, or
    returning only n coefficients, shifts every multiply below by one and
    produces error correction that is wrong but the right length, which no
    scanner will tell you about.
    """
    g = [1]
    for i in range(n):
        nxt = [0] * (len(g) + 1)
        for j, c in enumerate(g):
            nxt[j] ^= c                       # c * x
            nxt[j + 1] ^= _mul(c, EXP[i])     # c * a^i
        g = nxt
    return g


def _rs(data: list[int], n: int) -> list[int]:
    """Reed-Solomon remainder: n error-correction codewords for data."""
    gen = _generator(n)
    rem = [0] * n
    for d in data:
        factor = d ^ rem[0]
        rem = rem[1:] + [0]
        for i in range(n):
            rem[i] ^= _mul(gen[i + 1], factor)
    return rem


# ── bitstream ───────────────────────────────────────────────────────────────
def _bits(data: bytes, version: int) -> list[int]:
    total, ec_per, groups = SPEC[version]
    data_words = sum(b * d for b, d in groups)
    count_bits = 8 if version < 10 else 16
    out = [0, 1, 0, 0]                              # byte mode
    out += [(len(data) >> i) & 1 for i in range(count_bits - 1, -1, -1)]
    for byte in data:
        out += [(byte >> i) & 1 for i in range(7, -1, -1)]

    cap = data_words * 8
    out += [0] * min(4, cap - len(out))             # terminator
    out += [0] * (-len(out) % 8)                    # to a byte boundary
    pad = [0xEC, 0x11]                              # the specified filler
    i = 0
    while len(out) < cap:
        out += [(pad[i % 2] >> b) & 1 for b in range(7, -1, -1)]
        i += 1
    words = [int("".join(str(b) for b in out[i:i + 8]), 2)
             for i in range(0, len(out), 8)]

    # Split into blocks, interleave data then ec — the spec's order, which is
    # what makes a scratch across the code lose one codeword per block rather
    # than a whole block.
    blocks, k = [], 0
    for count, size in groups:
        for _ in range(count):
            blocks.append(words[k:k + size])
            k += size
    ecs = [_rs(b, ec_per) for b in blocks]
    seq = []
    for i in range(max(len(b) for b in blocks)):
        for b in blocks:
            if i < len(b):
                seq.append(b[i])
    for i in range(ec_per):
        for e in ecs:
            seq.append(e[i])
    return [(w >> i) & 1 for w in seq for i in range(7, -1, -1)]


# ── matrix ──────────────────────────────────────────────────────────────────
def _finder(m, res, r, c):
    for dr in range(-1, 8):
        for dc in range(-1, 8):
            rr, cc = r + dr, c + dc
            if not (0 <= rr < len(m) and 0 <= cc < len(m)):
                continue
            # -1 and 7 are the separator: reserved, and always light. Only
            # 0..6 is the finder itself, or its ring bleeds into the gap.
            if 0 <= dr <= 6 and 0 <= dc <= 6:
                ring = dr in (0, 6) or dc in (0, 6)
                core = 2 <= dr <= 4 and 2 <= dc <= 4
                m[rr][cc] = ring or core
            else:
                m[rr][cc] = False
            res[rr][cc] = True


def _place_function(m, res, version):
    n = len(m)
    for r, c in ((0, 0), (0, n - 7), (n - 7, 0)):
        _finder(m, res, r, c)
    for i in range(8, n - 8):                       # timing
        m[6][i] = m[i][6] = (i % 2 == 0)
        res[6][i] = res[i][6] = True
    for r in ALIGN[version]:                        # alignment
        for c in ALIGN[version]:
            # Only the three that sit on a finder are omitted. Testing
            # "is the centre already reserved" instead also drops the ones
            # centred on the timing row or column, which are real patterns —
            # 40 modules of the code then shift and nothing scans.
            if (r < 8 and c < 8) or (r < 8 and c > n - 9) or \
               (r > n - 9 and c < 8):
                continue
            for dr in range(-2, 3):
                for dc in range(-2, 3):
                    m[r + dr][c + dc] = max(abs(dr), abs(dc)) != 1
                    res[r + dr][c + dc] = True
    m[n - 8][8] = True                              # the dark module
    res[n - 8][8] = True
    for i in range(9):                              # format areas
        for rr, cc in ((8, i), (i, 8)):
            if not res[rr][cc]:
                res[rr][cc] = True
    for i in range(8):
        res[8][n - 1 - i] = True
        res[n - 1 - i][8] = True
    if version >= 7:                                # version areas
        for i in range(6):
            for j in range(3):
                res[n - 11 + j][i] = True
                res[i][n - 11 + j] = True


def _bch(value: int, poly: int, bits: int) -> int:
    v = value << bits
    top = poly.bit_length() - 1
    while v.bit_length() - 1 >= top:
        v ^= poly << (v.bit_length() - 1 - top)
    return v


def _format_bits(mask: int) -> int:
    # 00 is level M. BCH(15,5) with 0x537, masked with 0x5412 so an all-zero
    # format is not a valid one.
    v = (0b00 << 3) | mask
    return ((v << 10) | _bch(v, 0x537, 10)) ^ 0x5412


def _version_bits(version: int) -> int:
    return (version << 12) | _bch(version, 0x1F25, 12)


def _penalty(m) -> int:
    n, score = len(m), 0
    for line in list(m) + [list(col) for col in zip(*m)]:
        run, prev = 1, line[0]                      # rule 1: runs >= 5
        for v in line[1:]:
            if v == prev:
                run += 1
            else:
                if run >= 5:
                    score += run - 2
                run, prev = 1, v
        if run >= 5:
            score += run - 2
        # rule 3: anything that looks like a finder. str.count skips
        # overlapping hits, and these patterns do overlap, so step manually.
        s = "".join("1" if v else "0" for v in line)
        for pat in ("00001011101", "10111010000"):
            i = s.find(pat)
            while i != -1:
                score += 40
                i = s.find(pat, i + 1)
    for r in range(n - 1):                          # rule 2: 2x2 blocks
        for c in range(n - 1):
            if m[r][c] == m[r][c + 1] == m[r + 1][c] == m[r + 1][c + 1]:
                score += 3
    # rule 4: how far the dark/light balance sits from even, measured to
    # the nearer multiple of 5 either side — not by truncating the percentage,
    # which rounds the wrong way for half the values.
    dark = sum(v for row in m for v in row)
    percent = dark * 100 / (n * n)
    low = int(percent // 5) * 5
    return score + 10 * min(abs(low - 50) // 5, abs(low + 5 - 50) // 5)


def _apply(m, res, bits, mask, version):
    n = len(m)
    fn = [
        lambda r, c: (r + c) % 2 == 0,
        lambda r, c: r % 2 == 0,
        lambda r, c: c % 3 == 0,
        lambda r, c: (r + c) % 3 == 0,
        lambda r, c: (r // 2 + c // 3) % 2 == 0,
        lambda r, c: (r * c) % 2 + (r * c) % 3 == 0,
        lambda r, c: ((r * c) % 2 + (r * c) % 3) % 2 == 0,
        lambda r, c: ((r + c) % 2 + (r * c) % 3) % 2 == 0,
    ][mask]
    out = [row[:] for row in m]
    i = 0
    for base in range(n - 1, 0, -2):                # zigzag, skipping col 6
        cols = (base, base - 1) if base != 7 else (7, 5)
        if base <= 6:
            cols = (base - 1, base - 2)
        up = ((n - 1 - base) // 2) % 2 == 0
        rows = range(n - 1, -1, -1) if up else range(n)
        for r in rows:
            for c in cols:
                if res[r][c]:
                    continue
                bit = bits[i] if i < len(bits) else 0
                i += 1
                out[r][c] = bool(bit) != bool(fn(r, c))
    # The two format copies are written in opposite bit order: around the
    # top-left finder position i carries bit 14-i, along the other two edges
    # it carries bit i. Using one for both puts a valid-looking but wrong
    # format in half the code, which scanners reject outright.
    fmt = _format_bits(mask)
    for i in range(15):
        near = bool((fmt >> (14 - i)) & 1)
        far = bool((fmt >> i) & 1)
        if i < 6:
            out[8][i] = near
        elif i == 6:
            out[8][7] = near
        elif i == 7:
            out[8][8] = near
        elif i == 8:
            out[7][8] = near
        else:
            out[14 - i][8] = near
        if i < 8:
            out[8][n - 1 - i] = far
        else:
            out[n - 15 + i][8] = far
    if version >= 7:
        ver = _version_bits(version)
        for i in range(18):
            b = bool((ver >> i) & 1)
            out[n - 11 + i % 3][i // 3] = b
            out[i // 3][n - 11 + i % 3] = b
    return out


def matrix(text: str) -> list[list[bool]]:
    """The QR modules for text. True is dark."""
    data = text.encode()
    for version in sorted(SPEC):
        total, ec_per, groups = SPEC[version]
        room = sum(b * d for b, d in groups) - (2 if version < 10 else 3)
        if len(data) <= room:
            break
    else:
        raise ValueError(f"{len(data)} bytes is more than version 10 holds")

    n = version * 4 + 17
    base = [[False] * n for _ in range(n)]
    res = [[False] * n for _ in range(n)]
    _place_function(base, res, version)
    bits = _bits(data, version)
    best, best_score = None, None
    for mask in range(8):                           # the spec's choice: lowest
        cand = _apply(base, res, bits, mask, version)
        score = _penalty(cand)
        if best_score is None or score < best_score:
            best, best_score = cand, score
    return best


def render(text: str, quiet: int = 4) -> str:
    """Two module-rows per text row, so it comes out roughly square.

    Colours are set explicitly rather than using the terminal's own: a QR
    drawn in the foreground colour is unscannable on half the themes people
    run, and a code that only works on a dark background is not a code.
    """
    m = matrix(text)
    n = len(m)
    rows = [[False] * (n + quiet * 2) for _ in range(quiet)]
    for row in m:
        rows.append([False] * quiet + list(row) + [False] * quiet)
    rows += [[False] * (n + quiet * 2) for _ in range(quiet)]
    if len(rows) % 2:
        rows.append([False] * len(rows[0]))

    W, B = "\033[97m", "\033[30m"                   # fg white / black
    BGW, BGB = "\033[107m", "\033[40m"              # bg white / black
    out = []
    for i in range(0, len(rows), 2):
        top, bot = rows[i], rows[i + 1]
        line = []
        for c in range(len(top)):
            line.append((B if top[c] else W) + (BGB if bot[c] else BGW) + "▀")
        out.append("".join(line) + "\033[0m")
    return "\n".join(out)


def width(text: str) -> int:
    """Columns render() will occupy, for deciding whether it fits."""
    return len(matrix(text)) + 8
