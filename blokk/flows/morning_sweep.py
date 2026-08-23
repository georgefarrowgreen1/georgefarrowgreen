"""
The morning sweep.

Read the rule in durable.py before editing this file: the workflow decides,
activities do. Nothing below calls a clock, a network or a random number
directly — it all goes through ctx.activity, which is what makes the whole
thing survivable.

Read wide, write narrow. Five sources are read in one pass; every write goes
through a single approval gate.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from core.connectors import read_since, wire
from core.harness import quarantine_read
from core.models import router


def register(engine, store):
    # Resolved once at startup. A workspace sees only its own connectors —
    # scope is the registry, not a line in a prompt.
    registry = wire(store)

    @engine.workflow("morning_sweep")
    def morning_sweep(ctx, payload):
        ws = ctx.workspace_id
        # How far back to read, decided by the caller and journalled with the
        # run. A fixed twelve hours meant a night the Mac spent asleep was a
        # night of mail nobody read: the sweep ran late and still looked back
        # twelve hours from *then*, so the gap fell on the floor. The
        # scheduler passes the last sweep's start; a hand-pressed sweep passes
        # nothing and gets a day.
        since = ctx.now() - timedelta(hours=24)
        if payload.get("since"):
            try:
                given = datetime.fromisoformat(str(payload["since"]))
                # An offset or nothing: a naive stamp is read as UTC, which is
                # what the journal and ctx.now() both are. Mixing the two
                # raises, and it raises inside the activity that reads the
                # mail — so the whole sweep dies on a timezone.
                since = (given if given.tzinfo
                         else given.replace(tzinfo=timezone.utc))
            except ValueError:
                pass                       # a malformed window is not fatal
        world = registry.for_workspace(ws)
        # ctx.progress, not a local dict: a run that suspends on an approval
        # must still report what it read, or the dashboard chips come up empty.
        out = ctx.progress
        out.update({"filed": 0, "queued": 0, "flagged": 0})

        # ---- 1. read the inbox through quarantine ---------------------------
        # The reader has no tools and returns fields, never prose. An
        # instruction hidden in a stranger's email arrives here as a value in
        # a dict, not as a sentence some later agent might obey.
        # Read once, here, not inside the activities below. ctx.now() is
        # itself a journalled step: calling it from inside an activity body
        # records it on the first run and skips it on replay, because the
        # body does not run the second time — so every step after it came
        # back holding the step before's result. Steps are matched by number.
        until = ctx.now()

        def read_mail():
            src = world["mail"]
            return [dict(m) for m in
                    read_since(src.search_since, since, until, limit=50)]

        msgs = ctx.activity("mail.search", read_mail) if world.get("mail") else []

        # Texts, if a Messages connector is wired. Same treatment as mail:
        # inbound is untrusted and goes through the same quarantine.
        if world.get("messages"):
            texts = ctx.activity(
                "messages.since",
                lambda: read_since(world["messages"].since, since, until,
                                   limit=40))
            msgs += [{"id": t["id"], "from": t["from"], "at": t["at"],
                      "subject": "(text message)", "body": t["body"]}
                     for t in texts if t.get("provenance") != "self"]

        scanned = ctx.activity("quarantine", lambda: [
            {**m, **quarantine_read(m["body"])} for m in msgs
        ])
        flagged = [m for m in scanned if m["instruction_like"]]
        out["flagged"] = len(flagged)
        out["filed"] = len(scanned) - len(flagged)

        # ---- 2. triage on the small model -----------------------------------
        if scanned:
            ctx.activity(
                "model.triage",
                lambda: router.small.chat([
                    {"role": "system", "content": "Triage. Return JSON only."},
                    {"role": "user", "content": json.dumps(
                        [{"from": m["from"], "subject": m["subject"]} for m in scanned])},
                ]),
            )

        # ---- 3. calendar and rates, in the same pass ------------------------
        def read_cal():
            src = world["calendar"]
            return src.gaps() if hasattr(src, "gaps") else src.events(days=90)

        gaps = ctx.activity("calendar.gaps", read_cal) if world.get("calendar") else []
        rates = ctx.activity("rates.compare", lambda: world["rates"].compare()) \
            if world.get("rates") else None

        # ---- 4. propose, never send ----------------------------------------
        for m in scanned:
            if m["instruction_like"]:
                continue                       # quarantined; it gets no draft

            if "walking frame" in m["body"] or "handrail" in m["body"]:
                # Pinned to manual. Some categories never graduate, and an
                # accessibility answer carries a duty this system can't hold.
                _queue(ctx, store, "access_question",
                       f"{m['from']} asked about access to the beach.",
                       "No draft — this reads like a mobility question.",
                       {"sources": ["mail"]}, revalidate=None)
                out["queued"] += 1
                continue

            if "availability" in m["subject"].lower() or "free" in m["body"]:
                draft = ctx.activity(
                    "model.draft",
                    lambda mm=m: router.large.chat([
                        {"role": "system", "content": "Draft a reply."},
                        {"role": "user", "content": mm["body"]},
                    ]),
                )
                _queue(ctx, store, "availability_reply", draft["text"],
                       f"{m['from']} · asked once · {len(gaps)} gap(s) open",
                       {"sources": ["mail", "calendar"], "checked_at": _hour(ctx)},
                       # time-of-check vs time-of-use: re-run before the send
                       revalidate="calendar_gap")
                out["queued"] += 1

        # ---- 4b. a dry day with an hour in it -------------------------------
        # The one suggestion that needs two sources to be worth anything.
        # Either half alone is noise: a forecast you can get from a window,
        # and a free morning you already knew about. Together they are the
        # thing you would otherwise notice on Sunday evening, too late.
        cal = world.get("calendar")
        if world.get("weather") and hasattr(cal, "open_windows"):
            dry = ctx.activity("weather.dry",
                               lambda: world["weather"].dry_windows(days=7))
            free = ctx.activity("calendar.open",
                                lambda: cal.open_windows(days=7, min_hours=2))
            pick = _outing(dry, free)
            if pick:
                day, win = pick
                _queue(ctx, store, "outdoor_window",
                       f"{win['day']} {win['from']}–{win['to']} is free, and "
                       f"the forecast is {day['label']} — {day['why']}.",
                       f"{_hours(win['hours'])} free on {win['day']}, and it "
                       f"should be {day['label']}",
                       {"sources": ["weather", "calendar"],
                        "date": win["date"], "hours": win["hours"],
                        "rain_chance": day["rain_chance"],
                        "wind_kph": day["wind_kph"],
                        "checked_at": _hour(ctx)},
                       # A forecast is the most perishable thing in the queue.
                       revalidate="forecast")
                out["queued"] += 1

        if rates and rates["undercut_by"] >= 3:
            _queue(ctx, store, "rate_change",
                   f"Drop the {rates['month']} midweek rate by £{rates['delta_gbp']}.",
                   f"{rates['undercut_by']} comparable places undercut you.",
                   {"sources": [rates["source"]], "freshness": rates["note"],
                    "checked_at": _hour(ctx)})
            out["queued"] += 1

        # ---- 5. park until the phone answers --------------------------------
        # Not a queue. The workflow suspends here holding the drafts, the
        # guests and the reasoning, costing nothing, and wakes on the next
        # line when a tap arrives.
        if out["queued"]:
            decision = ctx.signal_wait("approval", timeout_hours=48)
            out["decision"] = decision

        return out


def _outing(dry: list, free: list) -> tuple | None:
    """The first dry day with a usable window, and the best window on it.

    Pure — no clock, no IO, no sorting by anything the caller cannot see.
    One suggestion, not seven: the attention budget is eight items for the
    whole night, and a fortnight of weather would eat it.
    """
    by_date = {}
    for w in free or []:
        best = by_date.get(w["date"])
        # Longest wins, and the earlier start breaks a tie — so the same
        # forecast and the same diary always produce the same suggestion,
        # which is what makes a replay return what the first run queued.
        if best is None or (w["hours"], best["from"]) > (best["hours"], w["from"]):
            by_date[w["date"]] = w
    for day in sorted(dry or [], key=lambda d: d["date"]):
        win = by_date.get(day["date"])
        if win:
            return day, win
    return None


def _hours(n: float) -> str:
    """3.0 -> "3h", 2.5 -> "2.5h". A card is read at arm's length."""
    return f"{int(n)}h" if float(n).is_integer() else f"{n}h"


def _hour(ctx) -> str:
    return ctx.activity("clock_hour", lambda: __import__("datetime")
                        .datetime.now().isoformat()[:13])


def _queue(ctx, store, category, body, why, evidence, revalidate=None):
    """Every write in the system funnels through here."""
    aid = f"a_{ctx.run_id[2:]}_{ctx.step}"
    ctx.activity(
        f"queue.{category}",
        lambda: store.x(
            """INSERT OR REPLACE INTO approval
               (id,run_id,workspace_id,category,title,body,evidence,revalidate)
               VALUES(?,?,?,?,?,?,?,?)""",
            aid, ctx.run_id, ctx.workspace_id, category, why, body,
            json.dumps(evidence), revalidate) or {"approval_id": aid},
        side_effect=True,
    )
