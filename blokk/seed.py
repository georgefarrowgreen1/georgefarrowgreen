"""Create the database and a small sample world. Safe to re-run."""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from core.durable import Store

# A path argument seeds somewhere else. Default unchanged, so ./test.sh and
# every instruction in the docs still mean blokk.db — but a probe that wants
# to ask "what does a database look like the moment this file has run" can
# have one of its own instead of trying to undo a live one.
DB = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).parent / "blokk.db"
s = Store(DB)

# Trust starts partly earned so you can watch a category graduate in one
# sitting rather than tapping twenty times. Keyed on the category alone now:
# it used to be (workspace, category), and what that bought was the same
# ledger kept four times over for the same kinds of decision.
TRUST = [
    ("availability_reply", 19, 1, 0, 20, 0),
    ("rate_change",         4, 9, 2, 20, 0),
    ("access_question",     0, 0, 0, 20, 1),   # pinned to manual
    ("invoice_chase",      19, 0, 0, 20, 0),
]
for cat, clean, ed, rej, thr, pin in TRUST:
    s.x("""INSERT OR REPLACE INTO trust
           (category,clean,edited,rejected,threshold,auto,pinned_manual)
           VALUES(?,?,?,?,?,0,?)""", cat, clean, ed, rej, thr, pin)

# What anything wired here may reach. Nothing is wired on a fresh install,
# so this is empty and every request is refused until somebody adds a source
# — which opens exactly the host that source needs, and says so.
s.x("INSERT OR REPLACE INTO setting(key,value) VALUES('egress_allow','[]')")

SKILLS = [
    ("sk1","weekly_changeover_gaps","unlet gaps under four nights",31,0,"promoted"),
    ("sk2","tide_arrival_warning","warn arrivals on high water",22,1,"promoted"),
    ("sk3","rate_comparison_sweep","like-for-like within ten miles",9,3,"candidate"),
    ("sk4","enquiry_triage","sort inbound by intent",88,2,"candidate"),
]
for sid, n, d, r, f, st in SKILLS:
    s.x("""INSERT OR REPLACE INTO skill
           (id,name,description,code_ref,runs,failures,status)
           VALUES(?,?,?,?,?,?,?)""", sid, n, d, f"skills/{n}.py", r, f, st)

FACTS = [
    ("f_11","quotes always name the dog charge unprompted",0.82,["e_31","e_44","e_52"]),
    ("f_29","never quotes nights without checking the calendar first",0.71,["e_58"]),
]
for fid, t, c, src in FACTS:
    s.x("""INSERT OR REPLACE INTO fact(id,text,confidence,source_episodes)
           VALUES(?,?,?,?)""", fid, t, c, json.dumps(src))

# The frozen examples, so a fresh install has a baseline to compare against
# when the model is swapped. Without this the regression table was empty on
# every machine and the safety net for "the drafts quietly got worse" was a
# CLI nobody knew to run.
from core import regression                                      # noqa: E402

frozen = regression.seed(s)

# Which rows are the sample world's, so that something else can tell them
# from yours. test.sh backs blokk.db up before deleting it, and the check
# for "is there anything in here worth keeping" counted facts, skills and
# episodes — every one of which this file writes. So the guard fired on
# every run after the first, backed up a copy of the seed, and printed a
# paragraph about a fortnight of approvals being at risk. An alarm that
# always goes off is one nobody reads, which is the opposite of the point.
sys.path.insert(0, str(Path(__file__).parent / "demo"))
import realdb                                                    # noqa: E402
realdb.DB = DB
realdb.stamp()

print(f"seeded {DB}  ({len(TRUST)} trust rows, {len(SKILLS)} skills, "
      f"{frozen} frozen examples)")
