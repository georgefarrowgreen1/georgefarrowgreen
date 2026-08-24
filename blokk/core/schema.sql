-- blokk: the 98.4%
-- One SQLite file holds the whole runtime. This is the thing you back up.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- workspaces
-- One row per business. Every other table carries workspace_id.
-- Retrofitting tenancy is miserable; carry it from line one.
CREATE TABLE IF NOT EXISTS workspace (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  -- what this workspace may reach. Enforced in the sandbox, not the prompt.
  egress_allow  TEXT NOT NULL DEFAULT '[]',      -- json array of hostnames
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Credential *references* only. Secrets live in the OS keychain.
-- The control plane resolves these; agents never see them.
CREATE TABLE IF NOT EXISTS credential (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,                   -- imap | caldav | http | sqlite
  keychain_ref  TEXT NOT NULL,                   -- name in the keychain, never the secret
  scopes        TEXT NOT NULL DEFAULT '[]'
,
  -- Which calendars, or which mailboxes. A JSON list of names,
  -- empty for all of them. See core/sources.py:inside().
  only          TEXT NOT NULL DEFAULT '[]');

-- ---------------------------------------------------------------- durability
-- A run is one workflow execution.
CREATE TABLE IF NOT EXISTS run (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  workflow      TEXT NOT NULL,                   -- morning_sweep | enquiry_reply | ...
  workflow_ver  INTEGER NOT NULL DEFAULT 1,      -- old runs must replay against old code
  status        TEXT NOT NULL,                   -- running|suspended|done|failed|killed
  input         TEXT NOT NULL DEFAULT '{}',
  result        TEXT,
  cursor        INTEGER NOT NULL DEFAULT 0,      -- next step index on resume
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at      TEXT
);
CREATE INDEX IF NOT EXISTS ix_run_status ON run(status, workspace_id);

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
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,                   -- trust is per workspace+category
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
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at    TEXT
);
CREATE INDEX IF NOT EXISTS ix_appr_open ON approval(decision, created_at);

-- Autonomy is earned per workspace+category and never transfers.
CREATE TABLE IF NOT EXISTS trust (
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  clean         INTEGER NOT NULL DEFAULT 0,      -- approved unchanged
  edited        INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  threshold     INTEGER NOT NULL DEFAULT 20,
  auto          INTEGER NOT NULL DEFAULT 0,
  pinned_manual INTEGER NOT NULL DEFAULT 0,      -- some things never graduate
  PRIMARY KEY (workspace_id, category)
);

-- ---------------------------------------------------------------- memory
-- Episodic: what happened. Cheap, append-only, the raw material.
CREATE TABLE IF NOT EXISTS episode (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
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
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL DEFAULT 'workspace', -- workspace | global (your voice)
  text          TEXT NOT NULL,
  confidence    REAL NOT NULL DEFAULT 0.5,
  source_episodes TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  retired_at    TEXT
);

-- Procedural: how to do it. A verified script beats remembered reasoning.
CREATE TABLE IF NOT EXISTS skill (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspace(id) ON DELETE CASCADE, -- null = shared
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
-- One row per turn. Kept per workspace because the chat is scoped to one and
-- a thread that spanned four businesses would leak the fourth's mail into the
-- first's answer. `flagged` marks a turn whose tool output contained text
-- that reads like an instruction: it was quarantined on the way in, and the
-- mark survives so the panel can keep saying so on a reload.
CREATE TABLE IF NOT EXISTS message (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
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
  workspace_id  TEXT NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  tokens        INTEGER NOT NULL DEFAULT 0,
  tool_calls    INTEGER NOT NULL DEFAULT 0,
  max_tokens    INTEGER NOT NULL DEFAULT 4000000,
  max_tool_calls INTEGER NOT NULL DEFAULT 2000,
  PRIMARY KEY (workspace_id, day)
);

-- Frozen examples with known-good answers. Run nightly.
-- Without this a model swap degrades quality silently and a guest finds out first.
CREATE TABLE IF NOT EXISTS regression (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspace(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  input         TEXT NOT NULL,
  expect        TEXT NOT NULL,                   -- assertion, not exact string
  last_pass     INTEGER,
  last_run_at   TEXT
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
