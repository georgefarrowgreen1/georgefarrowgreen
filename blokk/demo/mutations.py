"""One break per probe, kept in the repo instead of in my head.

A probe that cannot fail is worse than no probe: it is a green line that
means nothing, and it is indistinguishable from a green line that means
something. Nine of them got written in a single week of work on this
codebase, and every one was caught by hand, by remembering to try.

  * a check for "never reached" against a sentence saying "ever reached"
  * a check for "BLOCKED" against a finding that says "blocking"
  * "guest" matched by the listing printed underneath the answer
  * "127." matched by the docstring explaining the guard it tested
  * "5g" matched by the "2.4/5GHz" on the line above
  * "client isolation" searched in a source where it is line-wrapped
  * a mutation applied to a CSS class this markup does not have
  * a mutation editing the wrong file entirely, asserting nothing
  * a default read from a database the suite had already written to

Remembering is not a mechanism. This is: every entry names a probe and one
edit that must make it go red. `demo/gate.py` applies each, runs that one
probe, and fails if the probe stays green — or if the edit matched nothing,
which is the same defect wearing the mutation's clothes.

Coverage is deliberately reported rather than assumed. Most probes here
have no entry yet, and the gate says so on every run: a gate that quietly
covers a tenth of the suite is the thing it exists to prevent.

Each entry:
    probe    the id, as the probe's name begins
    why      what breaking this is meant to represent
    file     path from the repo root
    find     an exact string that must be present
    replace  what it becomes
"""

MUTATIONS = [
    # ── the LAN chain ───────────────────────────────────────────────────
    dict(probe="A107", why="the doctor drops the port from the phone link",
         file="core/doctor.py",
         find='url = f"http://{ip}:{port}/?t={token}"',
         replace='url = f"http://{ip}/?t={token}"'),
    dict(probe="A107", why="a browser with no key is served raw JSON again",
         file="api/server.py",
         find="if self._wants_html():", replace="if False:"),
    dict(probe="A108", why="the doctor blames Private Relay again",
         file="core/doctor.py",
         find="iCloud Private Relay can stay on. It does not carry local",
         replace="Check that iCloud Private Relay is off, and that"),
    dict(probe="A108", why="the router's client isolation stops being named",
         file="core/preflight.py",
         find="(AP or client ", replace="(a router thing "),
    dict(probe="A109", why="a TLS ClientHello is answered in plaintext again",
         file="api/server.py",
         find="        if not self._tls_checked:", replace="        if False:"),
    dict(probe="A109", why="the attempt is turned away and never counted",
         file="api/server.py",
         find="        note_https_attempt()\n", replace=""),

    # ── weather: the answer, and the boundary under it ──────────────────
    dict(probe="A110", why="the day asked about is answered with ISO dates",
         file="core/ask.py",
         find='    def when(r):\n        return _when(r.get("from", ""))',
         replace='    def when(r):\n        return str(r.get("from", ""))'),
    # The threshold appears in both the span branch and the no-day branch;
    # anchored on the line above so the edit lands in one known place
    # rather than "whichever matched first".
    dict(probe="A110", why="a wet week is called dry",
         file="core/ask.py",
         find='            wet = [r for r in known if r["rain_chance"] >= 45]',
         replace='            wet = [r for r in known if r["rain_chance"] >= 99]'),
    dict(probe="A110", why="'this weekend' stops resolving to a weekend",
         file="core/ask.py",
         find='    if "weekend" in ql:', replace="    if False:"),
    dict(probe="A117", why="the boundary goes back to a list of field names",
         file="core/sources.py",
         find="_MEASURED = (int, float, bool)",
         replace="_MEASURED = ()"),
    dict(probe="A117", why="undeclared prose from the far end crosses",
         file="core/sources.py",
         find="and (isinstance(v, _MEASURED) and not isinstance(v, str)\n"
              "                            or k in carry)}})",
         replace="}})"),
    dict(probe="A114", why="the town is truncated into the proposal",
         file="core/ask.py",
         find='JOINERS = ("upon",', replace='JOINERS = ("nope",'),

    # ── updating, and the gate out ──────────────────────────────────────
    dict(probe="A111", why="automatic updates are on by default",
         file="core/autoupdate.py",
         find='    got = (row["value"] if row else "") or OFF',
         replace='    got = (row["value"] if row else "") or APPLY'),
    dict(probe="A111", why="a schema change is applied without a person",
         file="core/autoupdate.py",
         find='    if found.get("schema") and not force:',
         replace="    if False:"),
    dict(probe="A111", why="an update lands with no backup taken",
         file="core/autoupdate.py",
         find='        backup = str(bk.make(ROOT / "blokk.db").get("path", ""))',
         replace='        backup = ""'),
    dict(probe="A112", why="the egress gate stops checking the port",
         file="core/egress.py",
         find="    if port is not None and port != 443:",
         replace="    if False:"),
    dict(probe="A112", why="the allowlist's dot anchor is dropped",
         file="core/egress.py",
         find='        if not exact and host.endswith("." + entry):',
         replace='        if not exact and host.endswith(entry):'),

    # ── what the router hears, and what the run says about itself ───────
    dict(probe="A113", why="the weather vocabulary goes back to jargon",
         file="core/ask.py",
         find='"temperature", "umbrella", "coat", "wind",',
         replace='"temperature",'),
    dict(probe="A113", why="the bare word 'need' claims the approval queue",
         file="core/ask.py",
         find='"pending", "outstanding", "need doing",',
         replace='"pending", "outstanding", "need",'),
    dict(probe="A115", why="a blocked firewall reads as an allowed one",
         file="core/doctor.py",
         find='    verdict = _fw_verdict(ask("--listapps"))',
         replace='    verdict = "allow" if "python" in ask("--listapps").lower()'
                 ' else ""'),
    dict(probe="A116", why="loopback counts as another device",
         file="api/server.py",
         find='    if not ip or ip.startswith("127.") or ip == "::1":\n'
              "        return\n",
         replace=""),
    dict(probe="A116", why="the first arrival waits for a write timer",
         file="api/server.py",
         find='        write = stale or fresh or _peers["n"] == 1',
         replace="        write = stale"),
    dict(probe="A118", why="the one firewall translation loses a verdict",
         file="core/preflight.py",
         find='    if "BLOCKED" in up:', replace="    if False:"),
    dict(probe="A109", why="the count restarts at 1 after every restart",
         file="api/server.py",
         find="        _resume(_https, https_attempts)\n", replace=""),
    dict(probe="A119", why="a caller stops passing the question",
         file="core/ask.py",
         find='    return {"do": "reply", "say": _answer(\n        question,',
         replace='    return {"do": "reply", "say": _answer(\n        "",'),
]
