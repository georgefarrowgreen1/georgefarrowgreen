-- blokk: the 98.4%
-- One SQLite file holds the whole runtime. This is the thing you back up.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- There is one space. There used to be a workspace table with one row per
-- business and a workspace_id on everything else, on the reasoning that
-- retrofitting tenancy is miserable — which is true, and was the wrong
-- trade for this. It is one person's Mac. Four businesses meant four
-- queues to check, four sweeps to wait for, four sets of sources to wire
-- and a picker in the chat that had to be right before an answer could be,
-- and the thing they were actually being kept apart from was each other's
-- mail — which is what the read scope on a credential does, per mailbox,
-- without a tenancy model over the top of it.
--
-- What the boundary was carrying, and where it went:
--   the egress allowlist  -> one list, in setting. See core/egress.py.
--   which mail is whose   -> credential.only, per mailbox. Always did this.
--   trust                 -> per category, which is what it was really for.
-- See core/unify.py for what happened to a database that predates this.

-- Credential *references* only. Secrets live in the OS keychain.
-- The control plane resolves these; agents never see them.
CREATE TABLE IF NOT EXISTS credential (
  id            TEXT PRIMARY KEY,
  -- What you call this one. The row used to be keyed (workspace, kind), so
  -- there was exactly one mailbox per business and the name was implied. In
  -- one space that would mean exactly one mailbox, full stop — wiring the
  -- second would silently replace the first. So a source has a name: `mail`
  -- for the first of a kind, `mail2` and up after that, or whatever you
  -- call it. Two mailboxes are two sources and the sweep reads both.
  name          TEXT NOT NULL DEFAULT '',
  kind          TEXT NOT NULL,                   -- imap | caldav | http | sqlite
  keychain_ref  TEXT NOT NULL,                   -- name in the keychain, never the secret
  scopes        TEXT NOT NULL DEFAULT '[]'
,
  -- Which calendars, or which mailboxes. A JSON list of names,
  -- empty for all of them. See core/sources.py:inside().
  only          TEXT NOT NULL DEFAULT '[]');
CREATE UNIQUE INDEX IF NOT EXISTS ux_cred_name ON credential(name);

-- ---------------------------------------------------------------- durability
-- A run is one workflow execution.
CREATE TABLE IF NOT EXISTS run (
  id            TEXT PRIMARY KEY,
  workflow      TEXT NOT NULL,                   -- morning_sweep | enquiry_reply | ...
  workflow_ver  INTEGER NOT NULL DEFAULT 1,      -- old runs must replay against old code
  status        TEXT NOT NULL,                   -- running|suspended|done|failed|killed
  input         TEXT NOT NULL DEFAULT '{}',
  result        TEXT,
  cursor        INTEGER NOT NULL DEFAULT 0,      -- next step index on resume
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT
);
CREATE INDEX IF NOT EXISTS ix_run_status ON run(status, started_at);

-- THE table. Append-only. Replay reads this and rebuilds state without
-- calling anything. If you delete one table by accident, make it not this one.
CREATE TABLE IF NOT EXISTS journal (
  run_id        TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  step          INTEGER NOT NULL,
  kind          TEXT NOT NULL,                   -- activity|signal|timer|compaction|error
  name          TEXT NOT NULL,
  input_hash    TEXT,                            -- hash, not the payload
  result        TEXT,                            -- small results inline
  result_ref    TEXT,                            -- large results offloaded to disk
  side_effect   INTEGER NOT NULL DEFAULT 0,      -- 1 = this wrote to the world
  idem_key      TEXT,                            -- run_id:step — replay must not re-fire
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  ms            INTEGER NOT NULL DEFAULT 0,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, step)
);
-- Unique idempotency: a replayed send returns the recorded receipt, it does not resend.
CREATE UNIQUE INDEX IF NOT EXISTS ux_idem ON journal(idem_key) WHERE idem_key IS NOT NULL;

-- A workflow parked on a signal. Costs nothing while it waits.
CREATE TABLE IF NOT EXISTS waiting (
  run_id        TEXT PRIMARY KEY REFERENCES run(id) ON DELETE CASCADE,
  signal        TEXT NOT NULL,
  step          INTEGER NOT NULL,
  deadline      TEXT NOT NULL,                   -- never wait forever
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------- approvals
CREATE TABLE IF NOT EXISTS approval (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,                   -- trust is per category
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  evidence      TEXT NOT NULL DEFAULT '{}',      -- sources + freshness, for revalidation
  -- time-of-check vs time-of-use: re-run this before the side effect fires
  revalidate    TEXT,                            -- name of a cheap check
  decision      TEXT,                            -- approve|edit|reject|expired
  edited_body   TEXT,
  -- What to run if this is approved, and what happened when it was. Ask
  -- proposes into this column; nothing else may write it, and nothing runs
  -- until a person decides. See core/actions.py.
  action        TEXT,
  result        TEXT,
  -- Who this is addressed to, captured when the draft was made rather than
  -- read out of the body at send time. A recipient parsed out of prose is a
  -- recipient a model can move, and moving it is the whole attack.
  recipient     TEXT,
  -- Set the moment a send succeeds. A draft with this set is never sent
  -- again, whatever asks: an apology for a duplicate is worse than a
  -- missing reply, and the recipient is the one who finds out.
  sent_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_appr_open ON approval(decision, created_at);

-- Autonomy is earned per category and never transfers between categories.
CREATE TABLE IF NOT EXISTS trust (
  category      TEXT NOT NULL,
  clean         INTEGER NOT NULL DEFAULT 0,      -- approved unchanged
  edited        INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  threshold     INTEGER NOT NULL DEFAULT 20,
  auto          INTEGER NOT NULL DEFAULT 0,
  pinned_manual INTEGER NOT NULL DEFAULT 0,      -- some things never graduate
  PRIMARY KEY (category)
);

-- ---------------------------------------------------------------- memory
-- Episodic: what happened. Cheap, append-only, the raw material.
CREATE TABLE IF NOT EXISTS episode (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,                   -- edit|reject|approve|correction|outcome
  category      TEXT,
  before        TEXT,                            -- what the agent wrote
  after         TEXT,                            -- what you actually wanted
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  consolidated  INTEGER NOT NULL DEFAULT 0
);

-- Semantic: what's true. Distilled from episodes by a weekly batch pass.
-- source_episodes is not decoration: without it you cannot honour erasure.
CREATE TABLE IF NOT EXISTS fact (
  id            TEXT PRIMARY KEY,
  text          TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0.5,
  source_episodes TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  retired_at    TEXT
);

-- Procedural: how to do it. A verified script beats remembered reasoning.
CREATE TABLE IF NOT EXISTS skill (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,                   -- how the agent finds it
  code_ref      TEXT NOT NULL,                   -- path in the skills dir
  runs          INTEGER NOT NULL DEFAULT 0,
  failures      INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'candidate' -- candidate|promoted|retired
);

-- ---------------------------------------------------------------- telemetry
-- gen_ai.* shaped. Note what is NOT here: prompt and completion text.
-- Attributes are indexed and size-capped; putting guest names here copies
-- personal data into a second store with different retention.
CREATE TABLE IF NOT EXISTS span (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES run(id) ON DELETE CASCADE,
  parent_id     TEXT,
  op            TEXT NOT NULL,                   -- invoke_agent|chat|execute_tool|embeddings
  name          TEXT NOT NULL,
  model         TEXT,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  content_hash  TEXT,                            -- pointer, not payload
  ms            INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_span_run ON span(run_id, at);

-- ---------------------------------------------------------------- guards
-- Runaway protection. A loose loop can burn a night of tokens in minutes.
-- What was said in the chat box, so a reload is not amnesia.
--
-- One row per turn. `flagged` marks a turn whose tool output contained text
-- that reads like an instruction: it was quarantined on the way in, and the
-- mark survives so the panel can keep saying so on a reload.
CREATE TABLE IF NOT EXISTS message (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  role          TEXT NOT NULL,                   -- user|assistant|tool
  kind          TEXT NOT NULL DEFAULT 'text',    -- text|draft
  content       TEXT NOT NULL,
  tool_name     TEXT,                            -- set when role='tool'
  approval_id   TEXT,                            -- set when the turn proposed
  flagged       INTEGER NOT NULL DEFAULT 0,
  at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_msg_thread ON message(thread_id, at);

CREATE TABLE IF NOT EXISTS budget (
  day           TEXT NOT NULL,
  tokens        INTEGER NOT NULL DEFAULT 0,
  tool_calls    INTEGER NOT NULL DEFAULT 0,
  max_tokens    INTEGER NOT NULL DEFAULT 4000000,
  max_tool_calls INTEGER NOT NULL DEFAULT 2000,
  PRIMARY KEY (day)
);

-- Frozen examples with known-good answers. Run nightly.
-- Without this a model swap degrades quality silently and a guest finds out first.
CREATE TABLE IF NOT EXISTS regression (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  input         TEXT NOT NULL,
  expect        TEXT NOT NULL,                   -- assertion, not exact string
  last_pass     INTEGER,                          -- 1 only if every run passed
  passes        INTEGER,                          -- of the last batch
  runs          INTEGER,
  last_run_at   TEXT
);

-- "Bring this back to me on Thursday." A secretary's most-used move, and
-- the one thing Blokk had no way to be told: everything it knew was either
-- happening now or already recorded. Not a calendar entry — a reminder is
-- not an appointment, and a private note about somebody does not belong on
-- a shared screen. The morning sweep raises the due ones as cards.
CREATE TABLE IF NOT EXISTS reminder (
  id      TEXT PRIMARY KEY,      -- from the day and the words, so a replay
  at      TEXT NOT NULL,         --   leaves one rather than two
  note    TEXT NOT NULL,
  raised  TEXT                   -- when the card went up; NULL = still due
);

-- What lands in your in-tray, and what happens to each kind. Rows rather
-- than three words in a prompt constant: the sorting kinds, the approval's
-- category and the trust ledger's key are one name, and the triage prompt
-- and its grammar are both built from this table, so a category that exists
-- is a category the model has been told about. core/intray.py seeds it.
CREATE TABLE IF NOT EXISTS intray (
  name   TEXT PRIMARY KEY,                      -- also approval.category
  what   TEXT NOT NULL,                         -- in the words the model reads
  does   TEXT NOT NULL,                         -- draft | card | file | count
  rank   INTEGER NOT NULL DEFAULT 50
);

-- Machine-local settings the GUI can change. A table rather than blokk.conf
-- because the conf is rewritten wholesale by the setup wizard, and losing
-- your sweep time to a model change is the kind of surprise nobody connects
-- back to its cause. CREATE IF NOT EXISTS, so an existing database picks it
-- up on the next start with no migration.
CREATE TABLE IF NOT EXISTS setting (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

-- What Blokk may touch, decided by a person. One ledger for every door:
-- the apps on this Mac (realm 'app') and the hosts on the internet (realm
-- 'net'). Nothing reads Mail, writes Calendar or opens a socket without an
-- allow row here; a refused attempt is recorded on the row it wanted, so
-- "something asked" is a fact on a screen rather than a line in a log.
-- The egress allowlist used to be a JSON list in `setting`; it lives here
-- now, as rows, because two permission systems is how they disagree.
-- core/permission.py owns this table.
CREATE TABLE IF NOT EXISTS permission (
  realm       TEXT NOT NULL,                    -- app | net
  subject     TEXT NOT NULL,                    -- 'Mail' | a hostname
  verb        TEXT NOT NULL,                    -- read | write | reach
  state       TEXT NOT NULL DEFAULT 'ask',     -- allow | block | ask
  why         TEXT NOT NULL DEFAULT '',        -- what last wanted it, verbatim
  asks        INTEGER NOT NULL DEFAULT 0,      -- refused attempts, ever
  last_asked  TEXT,
  decided_by  TEXT NOT NULL DEFAULT '',        -- setup | panel | approval | wired
  changed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (realm, subject, verb)
);
