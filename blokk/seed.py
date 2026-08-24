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

WS = [
    ("cottages", "Cottages",      ["icloud.com", "api.tides.gov.uk"]),
    ("biz2",     "Business two",  ["icloud.com"]),
    ("biz3",     "Business three",["icloud.com"]),
    ("personal", "Personal",      []),
]
for wid, name, egress in WS:
    s.x("INSERT OR REPLACE INTO workspace(id,name,active,egress_allow) VALUES(?,?,1,?)",
        wid, name, json.dumps(egress))

# Trust starts partly earned so you can watch a category graduate in one sitting
# rather than tapping twenty times.
TRUST = [
    ("cottages", "availability_reply", 19, 1, 0, 20, 0),
    ("cottages", "rate_change",         4, 9, 2, 20, 0),
    ("cottages", "access_question",     0, 0, 0, 20, 1),   # pinned to manual
    ("biz2",     "invoice_chase",      19, 0, 0, 20, 0),
]
for wid, cat, clean, ed, rej, thr, pin in TRUST:
    s.x("""INSERT OR REPLACE INTO trust
           (workspace_id,category,clean,edited,rejected,threshold,auto,pinned_manual)
           VALUES(?,?,?,?,?,?,0,?)""", wid, cat, clean, ed, rej, thr, pin)

SKILLS = [
    ("sk1","cottages","weekly_changeover_gaps","unlet gaps under four nights",31,0,"promoted"),
    ("sk2","cottages","tide_arrival_warning","warn arrivals on high water",22,1,"promoted"),
    ("sk3","cottages","rate_comparison_sweep","like-for-like within ten miles",9,3,"candidate"),
    ("sk4",None,"enquiry_triage","sort inbound by intent",88,2,"candidate"),
]
for sid, wid, n, d, r, f, st in SKILLS:
    s.x("""INSERT OR REPLACE INTO skill
           (id,workspace_id,name,description,code_ref,runs,failures,status)
           VALUES(?,?,?,?,?,?,?,?)""", sid, wid, n, d, f"skills/{n}.py", r, f, st)

FACTS = [
    ("f_11","cottages","quotes always name the dog charge unprompted",0.82,["e_31","e_44","e_52"]),
    ("f_29","cottages","never quotes nights without checking the calendar first",0.71,["e_58"]),
]
for fid, wid, t, c, src in FACTS:
    s.x("""INSERT OR REPLACE INTO fact(id,workspace_id,text,confidence,source_episodes)
           VALUES(?,?,?,?,?)""", fid, wid, t, c, json.dumps(src))

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

print(f"seeded {DB}  ({len(WS)} workspaces, {len(TRUST)} trust rows, "
      f"{len(SKILLS)} skills, {frozen} frozen examples)")
