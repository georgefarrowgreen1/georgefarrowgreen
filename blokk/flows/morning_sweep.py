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
        def read_mail():
            src = world["mail"]
            return [dict(m) for m in
                    read_since(src.search_since, since, ctx.now(), limit=50)]

        msgs = ctx.activity("mail.search", read_mail) if world.get("mail") else []

        # Texts, if a Messages connector is wired. Same treatment as mail:
        # inbound is untrusted and goes through the same quarantine.
        if world.get("messages"):
            texts = ctx.activity(
                "messages.since",
                lambda: read_since(world["messages"].since, since, ctx.now(),
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
