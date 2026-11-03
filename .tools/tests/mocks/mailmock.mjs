// Stand-in for Mail's Worker as InFlite's page reaches it under the roof (One roof stage 4, s4/spec §4.7, §3.5, BI22), for
// the kit tests (roofmailmount, roofmailmount2): Mail's demo data and behaviour (email/public/app.js demoApi) answering
// §4.7's endpoints by credentialed CORS, as a Playwright context.route handler for http://email.kit.test/**.
//   const mail = await routeMail(context, { origin, access, now })   routes http://email.kit.test/** (MAIL_KIT)
//   or: const mail = mailMock(opts); await context.route(`${MAIL_KIT}/**`, mail.handle)
// mail = {
//   handle(route)            the handler
//   log                      every request: { method, path, query, body (parsed JSON or null), origin, inflite, navigate }
//   msgs, settings           the mailbox (mutable: a test may add to it or read what an action did)
//   sends                    what POST /api/send sent: { key, draftId, draft }
//   set({ access, offline, fail })   access: Mail's gate ("ok" | "signin" | "notadmin" | "passkey" | "reauth");
//                            offline: every request aborted (as a network error); fail: { [path or "METHOD path"]: status }
//                            answered with { error } instead; build: /roof/version's and /api/version's app
// }
// The hub gate's refusals are kept, so a module that slips is caught (403 { error }): a write without X-Inflite: 1,
// GET /api/messages/<id> and /raw by fetch (bodies never reach the page, §3.1), a q in GET /api/threads or /api/contacts,
// an attachment that isn't a raster picture (S4-D17) unless it's a navigation, address create/delete/default, logout and
// push. Navigations (the new tab at Mail's address) get a plain page. Every answer carries CORS for the page's origin.
export const MAIL_KIT = 'http://email.kit.test';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const RASTER = /^image\/(png|jpeg|gif|webp|avif|heic|bmp)$/;

export function mailMock({ origin = 'http://kit.test', access = 'ok', now = Date.now(), build = '1.48' } = {}) {
  const min = 60000, hr = 60 * min, dayMs = 24 * hr;
  const ME = { name: 'George Farrow-Green', email: 'hello@inflite.ai' };
  const P = {
    maya: { name: 'Maya Chen', email: 'maya@studio-north.co' }, leo: { name: 'Leo Martins', email: 'leo.martins@fastmail.com' },
    priya: { name: 'Priya Shah', email: 'priya@lumen.vc' }, cf: { name: 'Cloudflare', email: 'noreply@notify.cloudflare.com' },
    alex: { name: 'Alex Rivera', email: 'alex@rivera.photo' }, sam: { name: 'Sam Okafor', email: 'sam@okafor.dev' },
    nw: { name: 'Northwind Airlines', email: 'trips@northwind-air.example' }, byte: { name: 'The Weekly Byte', email: 'editor@weeklybyte.example' },
    parcel: { name: 'Parcel & Co', email: 'updates@parcel.example' }, jo: { name: 'Jo Whitfield', email: 'jo@whitfield.studio' },
  };
  let seq = 0;
  const htmlToText = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const mk = (folder, from, subject, text, ago, extra = {}) => ({
    id: `demo-${++seq}`, folder, threadId: `t-${seq}`, mailbox: extra.mailbox || ME.email, category: extra.category || 'people', snoozeUntil: extra.snoozeUntil || null,
    from, to: extra.to || [ME], cc: extra.cc || [], bcc: [], subject,
    snippet: (text || htmlToText((extra.html || '').split(/<blockquote/i)[0])).replace(/\s+/g, ' ').trim().slice(0, 200),
    text, html: extra.html || '', date: now - ago, unread: !!extra.unread, starred: !!extra.starred,
    hasAttachments: !!extra.attachments?.length, attachments: extra.attachments || [],
    messageId: `demo-${seq}@inflite.ai`, inReplyTo: extra.inReplyTo || null, references: null, replyTo: null, compose: extra.compose || null,
  });
  const msgs = [
    mk('inbox', P.maya, 'Liquid Glass explorations — round 2', 'Hi George,\n\nAttached are the updated explorations for the mail client. I pushed the glass a little further on the toolbar and softened the rim highlight so it reads better over photos.\n\nThe sidebar on iPad now floats with a 10pt inset, which feels much closer to the system apps. Let me know what you think before Thursday\'s review.\n\nMaya', 6 * min, {
      unread: true, starred: true,
      attachments: [{ id: 'a1', filename: 'Toolbar-v2.png', type: 'image/png', size: 842113 }, { id: 'a2', filename: 'Sidebar-iPad.png', type: 'image/png', size: 1210331 }],
    }),
    mk('inbox', P.cf, 'inflite.ai is ready for Email Sending', '', 38 * min, { unread: true, category: 'updates', html: '<div><h1>Your domain is verified</h1><p>Good news — <b>inflite.ai</b> passed DNS verification and can now send email through Cloudflare Email Service.</p></div>' }),
    mk('inbox', P.leo, 'Re: Dinner Friday?', '', 2 * hr, { unread: true, html: '<div dir="ltr">Brilliant, booked for six at 8. See you there!</div><div dir="ltr">Leo</div><blockquote type="cite">Count me in! Can you book for six?</blockquote>' }),
    mk('sent', ME, 'Re: Dinner Friday?', 'Count me in! Can you book for six?', 3 * hr, { to: [P.leo] }),
    mk('inbox', P.priya, 'Re: Investor update draft', 'This reads really well. Two small notes:\n\n1. Lead with the activation numbers — they\'re the headline.\n2. The roadmap slide can go in the appendix.\n\nHappy to jump on a call tomorrow if useful.\n\nPriya\n\n> On Monday, George wrote:\n> Here\'s the first draft of the October update…', 5 * hr, {
      starred: true,
      attachments: [{ id: 'a6', filename: 'October-update-notes.pdf', type: 'application/pdf', size: 184320 }, { id: 'a7', filename: 'Roadmap-appendix.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 48211 }],
    }),
    mk('inbox', P.alex, 'Photos from the weekend', 'Here are a few favourites from Saturday. Full gallery link to follow once I\'ve finished the edit!', 22 * hr, {
      attachments: [{ id: 'a3', filename: 'IMG_2041.jpg', type: 'image/jpeg', size: 3204112 }, { id: 'a4', filename: 'IMG_2058.jpg', type: 'image/jpeg', size: 2876433 }, { id: 'a5', filename: 'IMG_2077.jpg', type: 'image/jpeg', size: 3011876 }, { id: 'a8', filename: 'logo.svg', type: 'image/svg+xml', size: 2100 }],
    }),
    mk('inbox', P.nw, 'Your trip to Lisbon is confirmed', '', 26 * hr, { category: 'updates', html: '<div><h1>London → Lisbon</h1><p>Flight NW 482, Fri 14 Nov · 07:40 LHR, seat 14A.</p></div>' }),
    mk('inbox', P.sam, 'Quick question about the API', 'Hey George — is the /messages endpoint paginated by cursor or offset? Want to make sure the sync job doesn\'t double-count.\n\nCheers,\nSam', 2 * dayMs + 3 * hr, { mailbox: 'support@inflite.ai', unread: true }),
    mk('inbox', P.byte, 'Issue #142: The quiet return of the web app', '', 3 * dayMs, { category: 'updates', unread: true, html: '<div><h1>The quiet return of the web app</h1><p>Home-screen web apps have grown up.</p></div>' }),
    mk('inbox', P.parcel, 'Your parcel is out for delivery', 'Good news! Your parcel is with our driver and will arrive today between 13:00 and 15:00.', 4 * dayMs, { category: 'updates' }),
    mk('sent', { name: ME.name, email: 'support@inflite.ai' }, 'Re: Quick question about the API', 'Cursor-based — pass the date of the last message as `before`. Shout if anything looks off.\n\nG', 2 * dayMs, { to: [P.sam], mailbox: 'support@inflite.ai' }),
    mk('sent', ME, 'Investor update draft', 'Hi Priya,\n\nHere\'s the first draft of the October update. Would love your eyes on it before it goes out.\n\nThanks,\nGeorge', 3 * dayMs, { to: [P.priya] }),
    mk('drafts', ME, 'Thursday review agenda', '1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion', 1 * hr, {
      to: [P.maya], compose: { from: ME.email, to: [P.maya], cc: [], bcc: [], subject: 'Thursday review agenda', text: '1. Toolbar glass\n2. iPad sidebar\n3. Compose sheet motion', inReplyTo: null, references: null, quote: null, attachments: [] },
    }),
    mk('inbox', P.jo, 'Brand guidelines v3', 'Final guidelines attached — thanks for all the feedback!', 9 * dayMs, { snoozeUntil: now + 3 * hr }),
    mk('archive', P.jo, 'Coffee next week?', 'Free on Tuesday?', 12 * dayMs),
    mk('trash', P.parcel, 'Rate your delivery', 'How did we do? Tap a star to rate your delivery.', 6 * dayMs, { category: 'updates' }),
  ];
  // (conversations, as the demo joins them)
  const join = (a, b) => { const x = msgs.find((m) => m.subject === a.s && m.folder === a.f), y = msgs.find((m) => m.subject === b.s && m.folder === b.f); if (x && y) y.threadId = x.threadId; };
  join({ s: 'Investor update draft', f: 'sent' }, { s: 'Re: Investor update draft', f: 'inbox' });
  join({ s: 'Re: Dinner Friday?', f: 'sent' }, { s: 'Re: Dinner Friday?', f: 'inbox' });
  join({ s: 'Quick question about the API', f: 'inbox' }, { s: 'Re: Quick question about the API', f: 'sent' });
  // (an old-style draft started in Mail on its own: its quote carries html and no of, and it answers nothing Mail has)
  const old = mk('drafts', ME, 'Re: Something old', 'Thanks!', 30 * min, { to: [P.sam], compose: { from: ME.email, to: [P.sam], cc: [], bcc: [], subject: 'Re: Something old', text: 'Thanks!', inReplyTo: '<gone@example.com>', references: null, quote: { header: 'On 1 Nov 2026, Sam wrote:', html: '<p>old</p>', text: 'old', forward: false }, attachments: [] } });
  msgs.push(old);

  const settings = {
    domain: 'inflite.ai', catchall: 'keep', signature: '', colors: ['blue', 'green', 'orange', 'pink', 'purple', 'teal', 'grey'],
    addresses: [
      { email: 'hello@inflite.ai', name: ME.name, color: 'blue', category: null, notify: true, isDefault: true, count: 214, signature: '' },
      { email: 'support@inflite.ai', name: 'inflite Support', color: 'green', category: 'updates', notify: false, isDefault: false, count: 38, signature: 'The InFlite team\nsupport@inflite.ai' },
    ],
  };
  const contacts = Object.values(P);
  const sends = [], log = [];
  let state = { access, offline: false, fail: {}, build };

  const summary = ({ text, html, attachments, compose, ...m }) => m;
  const meta = (m) => ({ ...summary(m), attachments: (m.attachments || []).map(({ id, filename, type, size }) => ({ id, filename, type, size })) });
  const cleanSubject = (s) => (s || '').replace(/^((re|fwd?)\s*:\s*)+/i, '').trim();
  const at = () => Date.now();
  function threadOf(tid, ms) {
    ms = ms.slice().sort((a, b) => b.date - a.date);
    const latest = ms[0], incoming = ms.find((m) => m.folder !== 'sent') || latest, people = [];
    for (const m of ms) { const who = m.folder === 'sent' ? { name: 'You', email: m.from.email, me: true } : m.from; if (!people.some((p) => p.email === who.email && !!p.me === !!who.me)) people.push(who); }
    const snooze = Math.max(0, ...ms.map((m) => m.snoozeUntil || 0));
    return {
      id: tid, subject: cleanSubject(latest.subject) || '(No Subject)', latest: summary(latest), latestId: latest.id, from: incoming.from, people, count: ms.length,
      unread: ms.filter((m) => m.folder === 'inbox' && m.unread).length, starred: ms.some((m) => m.starred), hasAttachments: ms.some((m) => m.hasAttachments),
      category: ms.some((m) => m.category === 'people') ? 'people' : 'updates', done: !ms.some((m) => m.folder === 'inbox'), trashed: latest.folder === 'trash',
      snoozeUntil: snooze > at() ? snooze : null, mailbox: incoming.mailbox,
      canUnsub: incoming.category === 'updates' && /byte|github|stripe|parcel|cloudflare/i.test(incoming.from.email || ''), date: latest.date, messages: ms.map(summary),
    };
  }
  const threadMsgs = (id) => msgs.filter((m) => m.threadId === id && m.folder !== 'drafts');
  function allThreads(trash) {
    const map = new Map();
    for (const m of msgs) { if (m.folder === 'drafts' || (trash ? m.folder !== 'trash' : m.folder === 'trash')) continue; if (!map.has(m.threadId)) map.set(m.threadId, []); map.get(m.threadId).push(m); }
    return [...map].map(([tid, ms]) => threadOf(tid, ms)).sort((a, b) => b.date - a.date);
  }
  function matches(m, q) {
    return q.split(/\s+/).filter(Boolean).every((t) => {
      const [op, ...rest] = t.split(':'), v = rest.join(':').toLowerCase();
      if (!rest.length) return [m.subject, m.snippet, m.from.name, m.from.email, ...m.to.map((x) => x.email), ...(m.attachments || []).map((a) => a.filename)].join(' ').toLowerCase().includes(t.toLowerCase());
      if (op === 'from') return (m.from.name + m.from.email).toLowerCase().includes(v);
      if (op === 'to') return [m.mailbox, ...m.to.map((x) => x.email + x.name)].join(' ').toLowerCase().includes(v);
      if (op === 'has') return m.hasAttachments;
      if (op === 'is') return v === 'unread' ? m.unread : v === 'flagged' ? m.starred : v === 'done' ? m.folder === 'archive' : true;
      return true;
    });
  }
  function list({ view = 'all', category, address, q, count }) {
    let rows;
    const inTrash = /(^|\s)in:trash(?=\s|$)/i.test(q || '');
    q = (q || '').replace(/(^|\s)in:\S+/gi, ' ').trim();
    if (inTrash) rows = allThreads(true).filter((t) => !q || threadMsgs(t.id).some((m) => matches(m, q)));
    else if (q) rows = allThreads().filter((t) => threadMsgs(t.id).some((m) => matches(m, q)));
    else if (view === 'trash') rows = allThreads(true);
    else {
      rows = allThreads().filter((t) => view === 'unread' ? t.unread && !t.done && !t.snoozeUntil : view === 'flagged' ? t.starred : view === 'attachments' ? t.hasAttachments
        : view === 'done' ? t.done : view === 'later' ? !t.done && t.snoozeUntil : !t.done && !t.snoozeUntil);
      if (category) rows = rows.filter((t) => t.category === category);
    }
    if (address) rows = rows.filter((t) => threadMsgs(t.id).some((m) => m.mailbox === address));
    if (count) return { count: rows.length };
    const drafts = view === 'all' && category !== 'updates' && !q && !address ? msgs.filter((m) => m.folder === 'drafts').map(summary) : [];
    return { threads: rows.map(({ messages, ...t }) => t), drafts, hasMore: false };
  }
  function counts() {
    const out = { people: { threads: 0, unread: 0 }, updates: { threads: 0, unread: 0 }, flagged: 0, snoozed: 0 };
    for (const t of allThreads()) {
      if (!t.done && t.snoozeUntil) out.snoozed++;
      else if (!t.done) { out[t.category].threads++; if (t.unread) out[t.category].unread++; }
      if (t.starred) out.flagged++;
    }
    out.trash = allThreads(true).length;
    out.drafts = msgs.filter((m) => m.folder === 'drafts').length;
    const addr = new Map();
    for (const m of msgs) if (['inbox', 'archive'].includes(m.folder)) addr.set(m.mailbox, (addr.get(m.mailbox) || 0) + (m.folder === 'inbox' && m.unread ? 1 : 0));
    out.addresses = [...addr].map(([address, unread]) => ({ address, unread }));
    out.inbox = { unread: out.people.unread };
    const later = allThreads().filter((t) => !t.done && t.snoozeUntil).sort((a, b) => a.snoozeUntil - b.snoozeUntil)[0];
    if (later) out.nextLater = { id: later.id, at: later.snoozeUntil, from: later.from, subject: later.subject };
    out.updatesFrom = allThreads().filter((t) => !t.done && !t.snoozeUntil && t.category === 'updates').slice(0, 4).map((t) => t.from);
    return out;
  }
  function action(id, { action: a, category, sender, until }) {
    const ms = threadMsgs(id), latestIn = ms.filter((m) => ['inbox', 'archive'].includes(m.folder)).sort((x, y) => y.date - x.date)[0];
    if (a === 'snooze') { if (!(Number(until) > at())) throw Object.assign(new Error('Choose a time in the future.'), { status: 400 }); if (!ms.some((m) => m.folder === 'inbox')) for (const m of ms) if (m.folder === 'archive') m.folder = 'inbox'; }
    for (const m of ms) {
      if (a === 'done' && m.folder === 'inbox') Object.assign(m, { folder: 'archive', snoozeUntil: null });
      if (a === 'inbox' && m.folder === 'archive') m.folder = 'inbox';
      if (a === 'read') m.unread = false;
      if (a === 'unflag') m.starred = false;
      if (a === 'trash' && m.folder !== 'trash') Object.assign(m, { prevFolder: m.folder, folder: 'trash', snoozeUntil: null });
      if (a === 'restore' && m.folder === 'trash') Object.assign(m, { folder: m.prevFolder || 'inbox', prevFolder: null });
      if (a === 'category') m.category = category;
      if (a === 'snooze') m.snoozeUntil = m.folder === 'inbox' ? Number(until) : m.snoozeUntil;
      if (a === 'unsnooze') m.snoozeUntil = null;
    }
    if (a === 'unread' && latestIn) latestIn.unread = true;
    if (a === 'flag' && ms.length) ms.sort((x, y) => y.date - x.date)[0].starred = true;
    if (a === 'category' && sender && latestIn) for (const m of msgs) if (m.from.email === latestIn.from.email) m.category = category;
    if (a === 'delete') for (const m of ms) msgs.splice(msgs.indexOf(m), 1);
  }
  const drop = (id) => { const i = msgs.findIndex((x) => x.id === id); if (i >= 0) msgs.splice(i, 1); };
  function draftOf(m) {
    const c = m.compose || {}, q = c.quote || null;
    const of = q?.of || (c.inReplyTo && msgs.find((x) => x.messageId === c.inReplyTo)?.id) || null;
    return {
      compose: { from: c.from || m.from.email, to: c.to || m.to, cc: c.cc || [], bcc: c.bcc || [], subject: c.subject ?? m.subject, text: c.text ?? m.text, inReplyTo: c.inReplyTo || null, references: c.references || null,
        quote: q ? (of ? { of, mode: q.mode || (q.forward ? 'forward' : 'reply') } : null) : null,
        files: (c.attachments || []).map((a, i) => ({ i, filename: a.filename, type: a.type, size: a.size })) },
      quoteOld: !!q && !of,
    };
  }
  function saveDraft(d) {
    let m = d.id && msgs.find((x) => x.id === d.id && x.folder === 'drafts');
    if (!m) { m = mk('drafts', ME, d.subject || '', d.text || '', 0, { to: d.to }); m.date = at(); msgs.unshift(m); }
    const files = (d.attachments || []).map((a) => a.ref ? { ref: a.ref, ...(msgs.flatMap((x) => x.attachments).find((x) => x.id === a.ref) || {}) } : { filename: a.filename, type: a.type, size: a.size });
    Object.assign(m, { subject: d.subject || '', text: d.text || '', to: d.to || [], snippet: String(d.text || '').slice(0, 200), date: at(),
      compose: { from: d.from, to: d.to || [], cc: d.cc || [], bcc: d.bcc || [], subject: d.subject || '', text: d.text || '', inReplyTo: d.inReplyTo || null, references: d.references || null, quote: d.quote || null, attachments: files } });
    return { ok: true, id: m.id };
  }
  function send({ draftId, key }) {
    const d = msgs.find((x) => x.id === draftId && x.folder === 'drafts');
    if (!d) throw Object.assign(new Error('That draft has gone. It may have been sent already.'), { status: 404 });
    const c = d.compose || {};
    const parent = (c.quote?.of && msgs.find((x) => x.id === c.quote.of)) || (c.inReplyTo && msgs.find((x) => x.messageId === c.inReplyTo));
    const m = mk('sent', { name: ME.name, email: c.from || ME.email }, c.subject, c.text, 0, { to: c.to, cc: c.cc });
    m.date = at();
    if (parent) { m.threadId = parent.threadId; for (const x of msgs) if (x.threadId === parent.threadId) x.unread = false; }
    msgs.unshift(m);
    sends.push({ key: key || null, draftId, draft: JSON.parse(JSON.stringify(c)) });
    drop(draftId);
    return { ok: true, id: m.id };
  }
  const allAtts = () => msgs.flatMap((m) => m.attachments || []);

  // (the answer to one request: [status, body, type]; body an object (JSON), a Buffer or a string)
  function answer(method, path, u, body, inflite, navigate) {
    const json = (o, s = 200) => [s, o];
    const no = (s, error) => [s, { error }];
    const ok = state.access === 'ok';
    let m;
    if (path === '/roof/version' && method === 'GET') return json({ build: state.build });
    if (!path.startsWith('/api/')) return no(404, 'Not found');
    if (method !== 'GET' && method !== 'HEAD' && !inflite) return no(403, 'Missing request header');
    if (path === '/api/logout' || path.startsWith('/api/push/')) return no(403, 'That isn’t InFlite’s to ask.');
    if (path === '/api/session' && method === 'GET') return json({ access: state.access, accountOrigin: 'http://auth.kit.test', user: state.access === 'signin' ? null : { name: ME.name, handle: 'george', email: ME.email, admin: state.access !== 'notadmin' } });
    if (path === '/api/auth/handback' && method === 'POST') {
      if (!body?.code || !body?.verifier) return no(400, 'That sign-in didn’t work. Try again.');
      state.access = 'ok';
      return json({ access: 'ok', accountOrigin: 'http://auth.kit.test', user: { name: ME.name, handle: 'george', email: ME.email, admin: true } });
    }
    if (!ok) return [401, { error: state.access === 'notadmin' ? 'Mail is only for the site’s admin.' : 'Sign in to open Mail.', access: state.access }];
    if (path === '/api/notify') {
      if (method === 'PATCH') { const a = settings.addresses.find((x) => x.email === body?.email); if (typeof body?.notify !== 'boolean' || !a) return no(400, 'Choose on or off.'); a.notify = body.notify; }
      return json({ on: 1, addresses: settings.addresses.map((a) => ({ email: a.email, name: a.name, notify: a.notify !== false })) });
    }
    if (path === '/api/version' && method === 'GET') return json({ v: String(msgs.length + sends.length), build: null, app: state.build });
    if (path === '/api/me' && method === 'GET') {
      const def = settings.addresses.find((a) => a.isDefault)?.email || ME.email;
      return json({ displayName: ME.name, domain: 'inflite.ai', defaultFrom: def, identities: settings.addresses.map((a) => a.email), addresses: settings.addresses, signature: settings.signature });
    }
    if (path === '/api/counts' && method === 'GET') return json(counts());
    if (path === '/api/settings') {
      if (method === 'PATCH') { const { addresses, ...rest } = body || {}; Object.assign(settings, rest); }
      if (method === 'GET' || method === 'PATCH') return json(JSON.parse(JSON.stringify(settings)));
    }
    if (path === '/api/addresses/check' && method === 'GET') {
      const l = String(u.searchParams.get('local') || '').toLowerCase();
      const bad = !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(l) ? 'Use letters, numbers, dots, dashes or underscores, starting and ending with a letter or number.' : null;
      const taken = !bad && settings.addresses.some((a) => a.email === `${l}@inflite.ai`);
      return json({ ok: !bad && !taken, problem: bad || (taken ? 'That’s already one of your addresses.' : null) });
    }
    if (path === '/api/addresses') return no(403, 'New addresses are made in Mail on its own.');
    if ((m = /^\/api\/addresses\/([^/]+)$/.exec(path))) {
      if (method !== 'PATCH' || body?.isDefault !== undefined) return no(403, 'That’s done in Mail on its own.');
      const a = settings.addresses.find((x) => x.email === decodeURIComponent(m[1]));
      if (!a) return no(404, 'Not found');
      Object.assign(a, body);
      return json({ ...a });
    }
    if (path === '/api/threads' && method === 'GET') {
      if (u.searchParams.get('q')) return no(403, 'Search by POST.');
      return json(list(Object.fromEntries(u.searchParams)));
    }
    if (path === '/api/threads/search' && method === 'POST') return json(list({ ...(body || {}), q: String(body?.q || '').slice(0, 300) }));
    if (path === '/api/threads/batch' && method === 'POST') {
      const { ids, every, ...rest } = body || {};
      for (const id of ids || list(every || {}).threads.map((t) => t.id)) action(id, rest);
      return json({ ok: true });
    }
    if ((m = /^\/api\/threads\/([\w-]+)$/.exec(path)) && method === 'GET') {
      const ms = threadMsgs(m[1]), live = ms.filter((x) => x.folder !== 'trash');
      return ms.length ? json(threadOf(m[1], live.length ? live : ms)) : no(404, 'Conversation not found');
    }
    if (path === '/api/trash/empty' && method === 'POST') { for (const x of msgs.filter((y) => y.folder === 'trash')) drop(x.id); return json({ ok: true }); }
    if ((m = /^\/api\/unsubscribe\/([\w-]+)$/.exec(path))) {
      const ms = threadMsgs(m[1]);
      if (!ms.length) return no(404, 'This sender doesn\'t say how to unsubscribe.');
      const from = threadOf(m[1], ms).from;
      if (method === 'GET') { const all = msgs.filter((x) => x.from.email === from.email); return json({ sender: from, opened: all.filter((x) => !x.unread).length, of: all.length, how: 'oneclick', to: null, page: null }); }
      if (method === 'POST') { for (const x of msgs) if (x.from.email === from.email && x.folder === 'inbox') x.folder = 'archive'; return json({ ok: true }); }
    }
    if ((m = /^\/api\/messages\/([\w-]+)\/meta$/.exec(path)) && method === 'GET') {
      const x = msgs.find((y) => y.id === m[1] && y.folder !== 'drafts');
      return x ? json(meta(x)) : no(404, 'Message not found');
    }
    if ((m = /^\/api\/messages\/([\w-]+)\/raw$/.exec(path)) && method === 'GET') {
      if (!navigate) return no(403, 'Bodies are Mail’s own.');
      const x = msgs.find((y) => y.id === m[1]);
      return x ? [200, `From: ${x.from.email}\nSubject: ${x.subject}\n\n${x.text || ''}`, 'text/plain; charset=utf-8'] : no(404, 'Message not found');
    }
    if ((m = /^\/api\/messages\/([\w-]+)$/.exec(path))) {
      if (method === 'DELETE') { drop(m[1]); return json({ ok: true }); }
      return no(403, 'Bodies are Mail’s own.');
    }
    if ((m = /^\/api\/drafts\/([\w-]+)$/.exec(path)) && method === 'GET') {
      const x = msgs.find((y) => y.id === m[1] && y.folder === 'drafts');
      return x ? json(draftOf(x)) : no(404, 'Draft not found');
    }
    if (path === '/api/drafts' && method === 'POST') return json(saveDraft(body || {}));
    if (path === '/api/send' && method === 'POST') return json(send(body || {}));
    if (path === '/api/sends' && method === 'GET') {
      const keys = String(u.searchParams.get('keys') || '').split(',');
      return json({ sent: sends.filter((s) => s.key && keys.includes(s.key)).map((s) => s.key) });
    }
    if (path === '/api/contacts' && method === 'GET') return u.searchParams.get('q') ? no(403, 'Search by POST.') : json({ contacts: contacts.slice(0, 6) });
    if (path === '/api/contacts/find' && method === 'POST') { const s = String(body?.q || '').toLowerCase(); return json({ contacts: contacts.filter((c) => (c.name + c.email).toLowerCase().includes(s)).slice(0, 6) }); }
    if ((m = /^\/api\/attachments\/([\w-]+)$/.exec(path)) && method === 'GET') {
      const a = allAtts().find((x) => x.id === m[1]);
      if (!a) return no(404, 'Not found');
      if (navigate) return [200, `${a.filename}`, 'text/plain; charset=utf-8'];
      return RASTER.test(a.type) ? [200, PNG, a.type] : no(403, 'Open that at Mail’s address.');
    }
    if ((m = /^\/api\/notice\/([\w-]+)$/.exec(path)) && method === 'GET') {
      const ms = threadMsgs(m[1]).filter((x) => x.folder === 'inbox' && x.category === 'people').sort((a, b) => b.date - a.date);
      return ms.length ? json({ title: (ms[0].from.name || ms[0].from.email).slice(0, 120), body: cleanSubject(ms[0].subject).slice(0, 120) }) : no(404, 'Not found');
    }
    return no(404, 'Not found');
  }

  async function handle(route) {
    const req = route.request(), u = new URL(req.url()), method = req.method(), h = req.headers();
    const from = h.origin || null, navigate = req.isNavigationRequest();
    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch { body = null; }
    log.push({ method, path: u.pathname, query: u.search, body, origin: from, inflite: h['x-inflite'] === '1', navigate });
    if (state.offline) return route.abort('internetdisconnected');
    const cors = from ? { 'access-control-allow-origin': from, 'access-control-allow-credentials': 'true', vary: 'Origin' } : {};
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET, POST, PATCH, DELETE', 'access-control-allow-headers': 'Content-Type, X-Inflite', 'access-control-max-age': '7200' } });
    let [status, out, type] = [500, { error: 'Something went wrong. Try again.' }];
    const failed = state.fail[`${method} ${u.pathname}`] ?? state.fail[u.pathname];
    if (failed) [status, out] = [failed, { error: 'Something went wrong. Try again.' }];
    else try { [status, out, type] = answer(method, u.pathname, u, body, h['x-inflite'] === '1', navigate); } catch (e) { [status, out] = [e.status || 500, { error: e.message }]; }
    const isJson = !Buffer.isBuffer(out) && typeof out !== 'string';
    return route.fulfill({ status, headers: { ...cors, 'content-type': type || 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: isJson ? JSON.stringify(out) : out });
  }

  return {
    handle, log, msgs, settings, sends,
    set(o = {}) { state = { ...state, ...o, fail: o.fail ?? state.fail }; },
    get state() { return state; },
  };
}

export async function routeMail(context, opts = {}) {
  const mail = mailMock(opts);
  await context.route(`${MAIL_KIT}/**`, mail.handle);
  return mail;
}
