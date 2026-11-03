// Chats' data across the core's boundary (One roof, stage 3: roof/s3/spec.md §5.5; pigeon/roof/core.js's header holds
// the typedefs), one of each shape, frozen by B0: what UI-A, UI-B, HOST and Q build against, what the kit's stub core
// (.tools/tests/roofkit/chatcore-stub.js) answers, and what roofchatservice checks the real core's answers against.
// Pure ES module with no imports, so the kit page's Worker loads it too (served at /kit/fixtures/chats.mjs).
//   WORLD             a two-friend, one-group world, signed in and unlocked (state "ready"): me, friends, groups,
//                     requests, rows, air, chats (chat:<id> for each), outbox, keywarn, unread
//   ONE               one of each shape: Row, Friend, Group, Request, Me, Air, Msg (every kind), Chat, Typing, OutItem,
//                     KeyWarn, SendStep, SearchHit, Waiting, SendResult, Safety
//   STATES            the seven states; VARIANTS[state] → the world as the core shows it in that state (locked: no
//                     lines, no chats, nothing waiting; key and signin: nothing but the state)
//   world(state)      a deep copy of VARIANTS[state] (tests may change it)
//   shapeOf(v)        a value's shape (keys and types, recursively; arrays by their first item), for comparing an
//                     answer with a fixture: shapeOf(real) ⊇ … is roofchatservice's check
// Every id is a UUID-like string (fits the router's arg and the core's "id" rule); names are made up; no word here is
// anyone's message.
const fz = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) fz(v); } return o; };
const T0 = Date.UTC(2026, 10, 3, 9, 41);
const MIN = 60e3;

export const IDS = fz({
  me: '6c0f6f1e-0000-4000-8000-000000000001',
  pat: '6c0f6f1e-0000-4000-8000-0000000000a1',
  ali: '6c0f6f1e-0000-4000-8000-0000000000a2',
  group: '6c0f6f1e-0000-4000-8000-0000000000b1',
  req: '6c0f6f1e-0000-4000-8000-0000000000c1',
});
export const NOW = T0;

const me = { id: IDS.me, name: 'Sam Taylor', handle: 'sam', avatar: null, pigeons: true, startAs: 'pigeon', death: false, place: 'London', feathers: 40 };
const friends = [
  { id: IDS.pat, handle: 'pat', name: 'Pat Jones', avatar: `${IDS.pat}:1`, online: true, lastSeen: T0 - 2 * MIN, place: 'Leeds', keyChanged: false, verified: true, blocked: false },
  { id: IDS.ali, handle: 'ali', name: 'Ali Khan', avatar: null, online: false, lastSeen: T0 - 3 * 3600e3, keyChanged: true, verified: false, blocked: false },
];
const groups = [{ id: IDS.group, name: 'Saturday Ride', members: [{ id: IDS.pat, name: 'Pat Jones' }, { id: IDS.ali, name: 'Ali Khan' }], muted: false }];
const requests = [{ id: IDS.req, handle: 'robin', name: 'Robin Lee', at: T0 - 3600e3, dir: 'in' }];
const air = [{ id: 'm-air-1', chatId: IDS.pat, kind: 'pigeon', from: 'me', to: 'Pat', landsAt: T0 + 12 * MIN }];
const rows = [
  { id: IDS.pat, kind: 'friend', name: 'Pat Jones', avatar: `${IDS.pat}:1`, unread: 2, flying: 1, pinned: true, at: T0 - 5 * MIN, keyChanged: false, line: 'See you at the café' },
  { id: IDS.group, kind: 'group', name: 'Saturday Ride', avatar: null, unread: 0, flying: 0, pinned: false, at: T0 - 3600e3, keyChanged: false, line: 'Pat: 9 sharp' },
  { id: IDS.ali, kind: 'friend', name: 'Ali Khan', avatar: null, unread: 0, flying: 0, pinned: false, at: T0 - 86400e3, keyChanged: true, line: 'Thanks!' },
];
const flight = (o = {}) => ({ flying: false, landsAt: null, lost: false, waiting: false, way: null, pigeon: null, ...o });
const msg = (o) => ({ reactions: {}, read: true, delivered: true, recalled: false, ...o });
const CARD = { v: 1, kind: 'weather', from: 'weather', say: 'London: light rain', place: 'London', at: T0 - 10 * MIN };
const msgsPat = [
  msg({ id: 'm-p-1', from: 'them', at: T0 - 50 * MIN, kind: 'text', text: 'Ride on Saturday?' }),
  msg({ id: 'm-p-2', from: 'me', at: T0 - 40 * MIN, kind: 'text', text: 'Yes, 9 sharp', reactions: { '👍': 1 } }),
  msg({ id: 'm-p-3', from: 'them', at: T0 - 30 * MIN, kind: 'card', card: CARD }),
  msg({ id: 'm-p-4', from: 'them', at: T0 - 20 * MIN, kind: 'photo', media: { ref: 'ph-p-4', kind: 'photo' } }),
  msg({ id: 'm-p-5', from: 'them', at: T0 - 10 * MIN, kind: 'voice', media: { ref: 'vo-p-5', kind: 'voice', secs: 7 } }),
  msg({ id: 'm-p-6', from: 'them', at: T0 - 5 * MIN, kind: 'text', text: 'See you at the café', read: false }),
  msg({ id: 'm-air-1', from: 'me', at: T0 - MIN, kind: 'text', text: 'On my way', flight: flight({ flying: true, landsAt: T0 + 12 * MIN, way: 'straight', pigeon: 'Biscuit' }), delivered: false, read: false, postmark: 'London' }),
];
const msgsGroup = [
  msg({ id: 'm-g-1', from: IDS.pat, at: T0 - 70 * MIN, kind: 'when', text: 'Coffee after?' }),
  msg({ id: 'm-g-2', from: IDS.pat, at: T0 - 60 * MIN, kind: 'text', text: '9 sharp' }),
  msg({ id: 'm-g-3', from: 'me', at: T0 - 59 * MIN, kind: 'system', text: 'You named the group Saturday Ride' }),
];
const msgsAli = [
  msg({ id: 'm-a-1', from: 'me', at: T0 - 86400e3 - MIN, kind: 'ask', text: 'How’s yours?' }),
  msg({ id: 'm-a-2', from: 'them', at: T0 - 86400e3, kind: 'text', text: 'Thanks!' }),
  msg({ id: 'm-a-3', from: 'them', at: T0 - 86400e3 + MIN, kind: 'viewonce', expires: T0 + 86400e3 }),
  msg({ id: 'm-a-4', from: 'me', at: T0 - 86400e3 + 2 * MIN, kind: 'plan', text: 'Ride, 60 min' }),
  msg({ id: 'm-a-5', from: 'them', at: T0 - 86400e3 + 3 * MIN, kind: 'answer', text: 'Yes', replyTo: 'm-a-4' }),
  msg({ id: 'm-a-6', from: 'me', at: T0 - 86400e3 + 4 * MIN, kind: 'text', text: '', recalled: true }),
];
const chats = {
  [IDS.pat]: { id: IDS.pat, kind: 'friend', msgs: msgsPat, older: true },
  [IDS.group]: { id: IDS.group, kind: 'group', msgs: msgsGroup, older: false },
  [IDS.ali]: { id: IDS.ali, kind: 'friend', msgs: msgsAli, older: false },
};

export const STATES = fz(['ready', 'signin', 'key', 'locked', 'device', 'offline', 'ended']);
export const WORLD = fz({
  state: 'ready', me, friends, groups, requests, rows, air, chats,
  outbox: [{ id: 'o-1', chatId: IDS.ali, state: 'queued' }],
  keywarn: { mine: false, friends: [IDS.ali] },
  unread: 2,
  typing: { [IDS.pat]: { on: true } },
});

export const ONE = fz({
  Row: rows[0], Friend: friends[0], Group: groups[0], Request: requests[0], Me: me, Air: air[0],
  Msg: msgsPat[0], Msgs: [...msgsPat, ...msgsGroup, ...msgsAli], Chat: chats[IDS.pat], Typing: { on: true },
  OutItem: { id: 'o-1', chatId: IDS.ali, state: 'queued' }, KeyWarn: { mine: false, friends: [IDS.ali] },
  SendStep: { id: 's-1', step: 'sealing' }, SendStepFailed: { id: 's-1', step: 'failed', why: 'trust' },
  SearchHit: { token: 'tk-1', chatId: IDS.pat, title: 'Pat', sub: '… See you at the café', at: T0 - 5 * MIN },
  Waiting: { id: IDS.pat, first: 'Pat', at: T0 - 5 * MIN, said: 'See you at the café', kind: 'message', topics: [] },
  SendResult: { ok: true, say: 'Sent to Pat', sent: [IDS.pat], failed: [] },
  Safety: { digits: '12345 67890 12345 67890 12345 67890', verified: true, keyChanged: false },
  Since: { said: 'See you at the café', at: T0 - 5 * MIN },
  Older: { added: 0, older: false },
  Card: CARD,
});

// (the world as the core shows it in each state: only ready has words; locked keeps the names but no line, no chat)
const blank = { me: null, friends: [], groups: [], requests: [], rows: [], air: [], chats: {}, outbox: [], keywarn: { mine: false, friends: [] }, unread: 0, typing: {} };
const noWords = { ...WORLD, rows: WORLD.rows.map(({ line, ...r }) => r), chats: {}, typing: {} };
export const VARIANTS = fz({
  ready: WORLD,
  locked: { ...noWords, state: 'locked' },
  offline: { ...WORLD, state: 'offline' },
  key: { ...blank, state: 'key' },
  signin: { ...blank, state: 'signin' },
  device: { ...blank, state: 'device' },
  ended: { ...blank, state: 'ended' },
});
export const world = (state = 'ready') => JSON.parse(JSON.stringify(VARIANTS[state] || VARIANTS.ready));

export function shapeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0])] : [];
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shapeOf(v[k])]));
  return typeof v;
}
