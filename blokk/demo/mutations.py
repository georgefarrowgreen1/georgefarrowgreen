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

    # ── invariant 2: one write path ─────────────────────────────────────
    dict(probe="A49", why="the chat surface writes to a table that decides",
         file="core/ask.py",
         find='    store.x("INSERT OR IGNORE INTO budget(day) VALUES(?)", day)',
         replace='    store.x("INSERT OR IGNORE INTO budget(day) VALUES(?)", day)\n'
                 '    store.x("UPDATE approval SET decision=\'approve\' '
                 'WHERE id=?", "none")'),
    dict(probe="A50", why="a proposal lands in the queue already decided",
         file="api/server.py",
         find='            store.x("""INSERT INTO approval\n'
              '                       (id,run_id,category,title,body,evidence,action)\n'
              '                       VALUES(?,?,?,?,?,?,?)""",',
         replace='            store.x("""INSERT INTO approval\n'
                 '                       (id,run_id,category,title,body,evidence,'
                 'action,decision)\n'
                 '                       VALUES(?,?,?,?,?,?,?,\'approve\')""",'),
    dict(probe="A51", why="rejecting runs the action too",
         file="api/server.py",
         find='    if decision in ("approve", "edit") and a["action"]:',
         replace='    if decision in ("approve", "edit", "reject") and a["action"]:'),
    dict(probe="A53", why="the queued row is trusted instead of re-validated",
         file="core/actions.py",
         find='    act, clean = validate(payload.get("name"), payload.get("args") or {})',
         replace='    act = ACTIONS.get(payload.get("name"))\n'
                 '    clean = payload.get("args") or {}'),
    dict(probe="A54", why="opening a route out can graduate to acting alone",
         file="core/actions.py",
         find='           args=("host",), pinned=True, run=_egress_allow),',
         replace='           args=("host",), pinned=False, run=_egress_allow),'),

    # ── invariant 3: untrusted content is data ──────────────────────────
    dict(probe="A52", why="a row that reads like an instruction is not flagged",
         file="core/ask.py",
         find='                if q["instruction_like"]:',
         replace="                if False:"),
    dict(probe="A48", why="an injection in the page title comes back clean",
         file="core/connectors/web.py",
         find='                "instruction_like": bool(body["instruction_like"]\n'
              '                                         or head["instruction_like"])}',
         replace='                "instruction_like": bool(body["instruction_like"])}'),
    dict(probe="A48", why="text hidden by CSS is dropped before the flag runs",
         file="core/connectors/web.py",
         find='SKIP = {"script", "style", "noscript", "template", "svg", "canvas"}',
         replace='SKIP = {"script", "style", "noscript", "template", "svg",\n'
                 '        "canvas", "div"}'),
    dict(probe="A44", why="a forecast row arrives without provenance on it",
         file="core/connectors/weather.py",
         find='                "provenance": "external",',
         replace='                "provenance": "",'),

    # ── invariant 3: and the one gate out ───────────────────────────────
    dict(probe="A43", why="urllib follows a redirect off the allowlist",
         file="core/egress.py",
         find="    def redirect_request(self, req, fp, code, msg, headers, newurl):\n"
              "        return None",
         replace="    def redirect_request(self, req, fp, code, msg, headers, newurl):\n"
                 "        return super().redirect_request(\n"
                 "            req, fp, code, msg, headers, newurl)"),
    dict(probe="A43", why="plain http is allowed out again",
         file="core/egress.py",
         find='    if u.scheme != "https":', replace="    if False:"),
    dict(probe="A43b", why="removing a source leaves its hosts reachable",
         file="core/sources.py",
         find="            gone = [h for h in HOSTS\n"
              '                    if not egress.disallow(store, h).get("error")]',
         replace="            gone = []"),

    # ── what the model generates, and how reliably ──────────────────────
    dict(probe="A120", why="decisions go back to sampling",
         file="core/models.py",
         find='    DECIDING: {"temperature": 0.0, "top_p": 1.0},',
         replace='    DECIDING: {"temperature": 0.8, "top_p": 0.95},'),
    dict(probe="A120", why="nothing is sent, so the server picks",
         file="core/models.py",
         find='                   "max_tokens": 1024, **_sampling(job)}',
         replace='                   "max_tokens": 1024}'),
    dict(probe="A120", why="an unknown job invents rather than decides",
         file="core/models.py",
         find="    return dict(SAMPLING.get(job) or SAMPLING[DECIDING])",
         replace="    return dict(SAMPLING.get(job) or SAMPLING[WRITING])"),
    dict(probe="A120", why="the one call that writes prose runs greedy",
         file="flows/morning_sweep.py",
         find="                        job=WRITING),",
         replace="                        ),"),
    dict(probe="A121", why="the envelope is sliced mid-token again",
         file="core/ask.py",
         find="        if len(text) <= cap or not kept:\n            return text",
         replace="        return text[:cap]"),
    dict(probe="A121", why="rows are dropped and nothing says how many",
         file="core/ask.py",
         find='            env["rows_not_shown"] = dropped',
         replace="            pass"),
    dict(probe="A122", why="one stumble throws the turn away again",
         file="core/ask.py",
         find="    for attempt in (0, 1):", replace="    for attempt in (0,):"),
    dict(probe="A122", why="the retry is a second identical request",
         file="core/ask.py",
         find="        turn = messages if not attempt else messages + [",
         replace="        turn = messages if True else messages + ["),
    dict(probe="A122", why="a model that never answers in shape is looped on",
         file="core/ask.py",
         find="    for attempt in (0, 1):",
         replace="    for attempt in range(8):"),
    dict(probe="A123", why="an invented figure is not noticed",
         file="core/grounding.py",
         find="        if v < SMALL or v in have or v in seen:",
         replace="        if True or v in have or v in seen:"),
    dict(probe="A123", why="formatting is flagged instead of figures",
         file="core/grounding.py",
         find='            out.append((raw, float(raw.replace(",", ""))))',
         replace="            out.append((raw, float(raw)))"),
    dict(probe="A123", why="the diary leaves the evidence again",
         file="flows/morning_sweep.py",
         find='                        "diary": list(diary)[:12],\n',
         replace=""),
    dict(probe="A123", why="the funnel stops checking what it queues",
         file="flows/morning_sweep.py",
         find="            json.dumps(grounding.attach(body, evidence)), "
              "revalidate,",
         replace="            json.dumps(evidence), revalidate,"),
    dict(probe="A123", why="the queue's card stops showing it",
         file="web/index.html",
         find="      ${oddFigures(a.evidence && a.evidence.figures_unsupported)}\n",
         replace=""),
    dict(probe="A124", why="a frozen example is measured once again",
         file="core/regression.py",
         find="        for _ in range(times):", replace="        for _ in range(1):"),
    dict(probe="A124", why="held-sometimes stops being its own state",
         file="core/regression.py",
         find='            "sometimes": [x["name"] for x in results\n'
              '                          if x.get("runs") and 0 < x["passes"] '
              '< x["runs"]],',
         replace='            "sometimes": [],'),
    dict(probe="A124", why="the rate is not written to the row",
         file="core/regression.py",
         find='        store.x("UPDATE regression SET last_pass=?, passes=?, runs=?, "',
         replace='        store.x("UPDATE regression SET last_pass=?, passes=NULL, runs=NULL, "'),

    # ── the rebase: a secretary, not a holiday let ──────────────────────
    dict(probe="A125", why="the kinds go back to a constant beside the table",
         file="core/intray.py",
         find="    lines = [f\"  {c['name']:<12}{c['what']}\" for c in "
              "categories(store)]",
         replace='    lines = [f"  reply   somebody is waiting"]'),
    dict(probe="A125", why="the grammar stops coming from the table",
         file="core/intray.py",
         find='                                     "enum": [c["name"] for c in\n'
              "                                              categories(store)]},",
         replace='                                     "enum": ["reply"]},'),
    dict(probe="A125", why="an unrecognised kind is filed rather than shown",
         file="core/intray.py",
         find="            return c[\"does\"] if c[\"does\"] in DOES else CARD\n"
              "    return CARD",
         replace="            return c[\"does\"]\n    return FILE"),
    dict(probe="A125", why="a shared day is a clash again",
         file="core/actions.py",
         find="    if _midnight(a1, a2) or _midnight(b1, b2):\n"
              "        return False",
         replace="    pass"),
    dict(probe="A125", why="an appointment is written as an all-day event",
         file="core/connectors/ics_out.py",
         find="        *( [f\"DTSTART:{w_s:%Y%m%dT%H%M%S}\", "
              "f\"DTEND:{w_e:%Y%m%dT%H%M%S}\"]\n"
              "           if timed else",
         replace="        *( [f\"DTSTART;VALUE=DATE:{s:%Y%m%d}\", "
                 "f\"DTEND;VALUE=DATE:{e:%Y%m%d}\"]\n"
                 "           if timed else"),
    dict(probe="A125", why="a time is thrown away before it gets there",
         file="core/actions.py",
         find='                v = _dt.fromisoformat(v.replace(" ", "T")).isoformat(\n'
              '                    timespec="minutes")',
         replace='                raise ValueError("no times here")'),
    dict(probe="A125", why="asking to be reminded stops being possible",
         file="core/actions.py",
         find='    Action("remind_me", "Remind you about {note} on {when}.",',
         replace='    Action("remind_you", "Remind you about {note} on {when}.",'),
    dict(probe="A125", why="the diary answers whole days before hours",
         file="core/ask.py",
         find="            if hasattr(c, \"open_windows\"):\n"
              "                return [dict(w) for w in c.open_windows(days=14)]"
              "[:MAX_ROWS]\n"
              "            if hasattr(c, \"gaps\"):\n"
              "                return [dict(g) for g in c.gaps(days=90)][:MAX_ROWS]",
         replace="            if hasattr(c, \"gaps\"):\n"
                 "                return [dict(g) for g in c.gaps(days=90)]"
                 "[:MAX_ROWS]\n"
                 "            if hasattr(c, \"open_windows\"):\n"
                 "                return [dict(w) for w in "
                 "c.open_windows(days=14)][:MAX_ROWS]"),

    # ── the mesh: recognised, ranked, offered — and never managed ───────
    dict(probe="A126", why="the interface hides the mesh address again",
         file="core/doctor.py",
         find="    if a == 100 and 64 <= b <= 127:\n"
              '        return ("tailnet", True,',
         replace="    if False:\n"
                 '        return ("tailnet", True,'),
    dict(probe="A126", why="any VPN tunnel reads as reachable",
         file="core/doctor.py",
         find='        why = f"{name} is not the network your phone is on"\n'
              '        if n.startswith(("bridge", "vmenet", "vnic", "vboxnet")):\n'
              '            why += " — unless you are sharing this Mac\'s connection to it"\n'
              '        return (n or "?", False, why)',
         replace='        return (n or "?", True, "a tunnel, probably fine")'),
    dict(probe="A126", why="the mesh outranks the LAN",
         file="core/doctor.py",
         find='    order = {"lan": 0, "tailnet": 1, "public": 2}',
         replace='    order = {"tailnet": 0, "lan": 1, "public": 2}'),
    dict(probe="A126", why="the way out falls off the causes list",
         file="core/preflight.py",
         find='    out.append(_finding(\n'
              '        NOTE, "A private mesh sidesteps all of the above. Tailscale on the "',
         replace='    _unused = (_finding(\n'
                 '        NOTE, "A private mesh sidesteps all of the above. Tailscale on the "'),
    dict(probe="A126", why="the panel stops offering the second link",
         file="api/server.py",
         find='    anywhere = f"http://{mesh[\'ip\']}:{port}/?t={TOKEN}" if mesh else ""',
         replace='    anywhere = ""'),
]
