// Markets' News section and a story's sheet (One roof stage 2, spec §2.1, §4.2, S2-D6): the day in brief, then the
// stories by what you own, what you follow and the markets (what's new since you last looked marked, and counted on the
// section's badge); a story in Markets (what it says, what it means for what you own, the rest of the same story); its
// menu: Send in Chat (its title and link, never a card or an amount), Copy Link, Hide Stories from a source. Moved from
// markets/app.js (newsBrief :1969, storyRow :2029, storyView :2047, forYou :2073, storyMenu :2095, shareStory :2106,
// newsView :2116). Loaded through fw.lazy on News' first show or a story's first open (connector.lazy).
// view(el, ctx) → { draw(), hide(), destroy() }; openStory(ctx, id) → the story sheet (id: core.storyId).
import * as core from "./core.js";
import { h, el, M, toast, render, openSheet, pushSheet, closeBtn, backBtn, readsIn, markRead, keepFocus, afterDraw, openStock } from "./mkui.js";
import { emptyView, notIn } from "./todayview.js";
import { sameStory, storiesOf } from "../stories.js";

const { S, A, TOPIC_NAME, TOPIC_INDEX, TOPIC_SAID, fmt, money, pct, tone, plural, and2, ago, owned, valueOf, dayOf, totals, income, aroundMonth, newsKey, aboutIt, sansStop, newsSeen, newsHidden, newsRead, newsGroups, newsNew, loadNews, store, storyId, storyOf } = core;

function newsBrief() {
  const f = S.q["^FTSE"], g = S.q["^GSPC"], out = [], now = Date.now();
  const mv = (q, where) => (q?.chgPct == null ? null : `${where} ${Math.abs(q.chgPct) < 0.05 ? "is flat" : `is ${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`}`);
  const l1 = [mv(f, "London"), mv(g, "New York")].filter(Boolean);
  if (l1.length) {
    // (the headline behind the bigger of the two moves)
    const t = Math.abs(g?.chgPct ?? 0) >= Math.abs(f?.chgPct ?? 0) ? "US" : "UK", head = S.news?.find((n) => n.topic === t && now - n.at < 18 * 3600e3 && !newsHidden().has(n.src));
    out.push(head ? [`${l1.join(" and ")} today: `, h("span.hl", { text: sansStop(head.title) }), "."] : `${l1.join(" and ")} today.`);
  }
  const T = totals();
  if (T.o.length) {
    const top = [...T.o].sort((a, b) => Math.abs(dayOf(b) || 0) - Math.abs(dayOf(a) || 0))[0], q = S.q[top.symbol], t = S.newsTopics?.[top.symbol], iq = S.q[TOPIC_INDEX[t]];
    const own = S.news?.find((n) => aboutIt(n, top.symbol) && now - n.at < 36 * 3600e3 && !newsHidden().has(n.src));
    const why = own ? `: ${sansStop(own.title)}` : iq?.chgPct != null && q.chgPct != null && Math.sign(iq.chgPct) === Math.sign(q.chgPct) ? `: it invests in ${TOPIC_SAID[t]}, and ${t === "US" ? "US" : "UK"} shares ${iq.chgPct >= 0 ? "rose" : "fell"}` : "";
    const moved = `${q.chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(q.chgPct), 1)}%`;
    out.push(Math.abs(T.day) < 0.5 ? `Your portfolio's little changed today.`
      : `You're ${T.day >= 0 ? "up" : "down"} ${money(Math.abs(T.day), "GBP", 0)} today (${fmt(Math.abs(T.dayPct), 1)}%). ${T.o.length === 1 ? `${top.name} is ${moved}` : `${top.name} did most of it, ${moved}`}${why}.`);
  } else {
    const big = [...S.list].filter((x) => S.q[x.symbol]?.chgPct != null).sort((a, b) => Math.abs(S.q[b.symbol].chgPct) - Math.abs(S.q[a.symbol].chgPct))[0];
    if (big) out.push(`The biggest mover on your list is ${big.name}, ${S.q[big.symbol].chgPct >= 0 ? "up" : "down"} ${fmt(Math.abs(S.q[big.symbol].chgPct), 1)}%.`);
  }
  const ev = income().events[0];
  if (ev) out.push((ev.at - now) / 864e5 <= 14 ? `Coming up: about ${money(ev.v, "GBP", 0)} from ${ev.x.name}, around ${ev.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}.`
    : `Your next dividend: about ${money(ev.v, "GBP", 0)} from ${ev.x.name}, in ${aroundMonth(ev.at)}.`);
  return out;
}
function storyRow(n, ctx, fresh, read, more = 0) {
  const chips = [];
  if (n.topic) { const iq = S.q[TOPIC_INDEX[n.topic]]; chips.push(h("span.nchip.via", { text: `${TOPIC_NAME[n.topic]}${iq?.chgPct != null ? ` ${pct(iq.chgPct, 1)}` : ""}` })); }
  for (const t of n.tickers) {
    const x = t !== ctx && S.list.find((y) => y.symbol === t), q = x && S.q[t];
    if (x) chips.push(h(`span.nchip.${tone(q?.chgPct)}`, { text: q?.chgPct != null ? `${x.name} ${pct(q.chgPct, 1)}` : x.name }));
  }
  if (more) chips.push(h("span.nchip.more", { text: `+${more} more on this` }));
  const cls = ["div.nstory", fresh && !read ? "fresh" : "", read ? "read" : ""].filter(Boolean).join(".");
  return h(cls, { "data-key": newsKey(n), "data-k": "story", "data-id": storyId(n) },
    // (opened in Markets; a click held for a new tab, as one)
    h("a.story", { href: n.link, target: "_blank", rel: "noopener", onclick: readsIn(n) },
      h("span.m", {}, h("span", { text: `${n.src} · ${ago(n.at)}` })), h("b", { text: n.title }), chips.length ? h("span.nchips", {}, chips.slice(0, 4)) : null),
    h("button.nmore", { type: "button", "aria-label": `More: ${n.title}`, onclick: () => storyMenu(n) }, h("span", { "aria-hidden": "true" }, h("i"), h("i"), h("i"))));
}
// A story, in Markets: what it says (its page's own summary for link previews, and its picture, both through Markets),
// what it means for what you own, and the rest of the same story; its publisher's page a tap away (from the Home
// Screen, opened over the app in iPhone's own browser view, Done coming back)
function storyView(n) {
  if (typeof n !== "object") n = storyOf(n) || { link: "", title: "That story isn’t in the news just now", src: "Markets", at: Date.now(), tickers: [] };
  markRead(n);
  const pic = h("div.rpic", { hidden: true }), sum = h("div.rsum", {}, h("p.rwait", { text: "Getting what it says…" }));
  const show = (src) => pic.replaceChildren(h("img", { alt: "", src: A.picUrl(src, n.link, n.k), decoding: "async", onload: () => { pic.hidden = false; }, onerror: () => pic.remove() }));
  if (n.pic) show(n.pic);
  A.story(n.link, n.k).then(({ story: p }) => {
    if (!sum.isConnected) return;
    sum.replaceChildren(...(p?.summary ? [h("h4.rlab", { text: `From ${p.site || n.src}` }), h("p.rtext", { text: p.summary })]
      : [h("p.rnone", { text: `${n.src} doesn't say more than its headline here.` })]));
    if (!n.pic && p?.image) show(p.image);
  }, () => { if (sum.isConnected) sum.replaceChildren(h("p.rnone", { text: "Couldn't get what it says just now." })); });
  const others = (S.news || []).filter((m) => m !== n && !newsHidden().has(m.src) && sameStory(n, m)).slice(0, 5);
  return [h("div.shead", {}, backBtn(), h("small", { text: `${n.src} · ${ago(n.at)}` }), closeBtn()),
    pic, h("h2.rhead", { text: n.title }),
    h("p.rsrc", { text: `${n.src} · ${new Date(n.at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` }),
    sum, forYou(n),
    // (spread: a sheet's parts are each its own, never a list of them)
    ...(others.length ? [h("h3.slabel", { text: "More on this" }), h("div.list.flush", {}, others.map((m) => h("button.item.two.rmore", { type: "button", onclick: () => pushSheet(storyView, m) },
      h("span", {}, h("small", { text: `${m.src} · ${ago(m.at)}` }), h("b", { text: m.title })))))] : []),
    h("div.racts", {},
      h("a.readit", { href: n.link, rel: "noopener", target: "_blank" }, `Read it at ${n.src}`),
      h("div.rtwo", {}, h("button", { type: "button", onclick: () => shareStory(n), text: "Send in Chat" }), h("button", { type: "button", onclick: () => copyStory(n), text: "Copy Link" }))
    )];
}
// what a story means for what you own: yours, one you follow, or your holdings' market
function forYou(n) {
  const own = owned(), on = [...new Set([n.for, ...n.tickers])].map((s) => S.list.find((x) => x.symbol === s)).filter(Boolean);
  const chips = [], said = [];
  if (n.topic) { const iq = S.q[TOPIC_INDEX[n.topic]]; chips.push(h("span.nchip.via", { text: `${TOPIC_NAME[n.topic]}${iq?.chgPct != null ? ` ${pct(iq.chgPct, 1)}` : ""}` })); }
  for (const x of on) { const q = S.q[x.symbol]; chips.push(h(`span.nchip.${tone(q?.chgPct)}`, { text: q?.chgPct != null ? `${x.name} ${pct(q.chgPct, 1)}` : x.name })); }
  const mine = on.filter((x) => x.qty > 0), followed = on.filter((x) => !(x.qty > 0));
  if (mine.length) said.push(`You own ${and2(mine.map((x) => `${x.name} (${money(valueOf(x) || 0, "GBP", 0)})`))}.`);
  if (followed.length) said.push(`You follow ${and2(followed.map((x) => x.name))}.`);
  if (!on.length && n.topic) {
    const by = own.filter((x) => { const t = S.newsTopics?.[x.symbol]; return t && (t === "WORLD" || t === n.topic); });
    for (const x of by) { const q = S.q[x.symbol]; if (q?.chgPct != null) chips.push(h(`span.nchip.${tone(q.chgPct)}`, { text: `${x.name} ${pct(q.chgPct, 1)}` })); }
    said.push(by.length ? `It's news about the ${TOPIC_NAME[n.topic]}, the market ${and2(by.map((x) => x.name))} ${by.length === 1 ? "invests" : "invest"} in.` : `It's news about the ${TOPIC_NAME[n.topic]}.`);
  }
  if (!said.length) return null;
  return h("div.ryou", {}, h("h4.rlab", { text: "For you" }), chips.length ? h("span.nchips", {}, chips.slice(0, 5)) : null, h("p", { text: said.join(" ") }));
}
function newsView() {
  const wait = notIn();
  if (wait) return wait;
  if (!S.list.length) return emptyView();
  // (asked for when there's none, and again after a quarter of an hour; one that couldn't come, said, with Try Again)
  if (!S.newsErr && (S.news == null || Date.now() - (S.newsAt || 0) > 15 * 60e3)) loadNews();
  S.newsSince ??= newsSeen();
  const parts = [h("div.digest", {}, h("span.eyebrow", { text: "Today, in brief" }), newsBrief().map((t, i) => h("p.rise", { vars: { i: String(i) } }, t)))];
  if (S.newsErr && S.news == null) return [...parts, h("p.foot", {}, globalThis.navigator?.onLine === false ? "News needs a connection. " : "Couldn't get the news just now. ", h("button.inline", { type: "button", onclick: () => { S.newsErr = null; loadNews(); render(); }, text: "Try Again" }))];
  if (S.news == null) return [...parts, h("div.list.nlist", {}, [0, 1, 2].map(() => h("div.story.ghost", {}, h("span.m", { text: " " }), h("b", { text: " " }))))];
  const hidden = newsHidden(), read = newsRead(), groups = newsGroups(S.news.filter((n) => !hidden.has(n.src)), storiesOf);
  const kinds = ["holdings", "following", "markets"].filter((k) => groups.some((g) => g.kind === k));
  if (!kinds.includes(S.nfilter)) S.nfilter = "all";
  const shown = groups.filter((g) => S.nfilter === "all" || g.kind === S.nfilter), fresh = newsNew().length;
  if (kinds.length > 1) parts.push(h("div.nfilter", { role: "group", "aria-label": "Show" }, [["all", "All"], ["holdings", "Holdings"], ["following", "Following"], ["markets", "Markets"]].filter(([k]) => k === "all" || kinds.includes(k))
    .map(([k, label]) => h("button", { type: "button", "data-k": `nf:${k}`, "aria-pressed": String(S.nfilter === k), text: label, onclick: () => { if (S.nfilter !== k) { S.nfilter = k; render(); } } }))));
  if (fresh) parts.push(h("p.nnew", { text: `${plural(fresh, "new story", "new stories")} since you last looked` }));
  if (!shown.length) parts.push(h("p.foot.mk-pt12", { text: "No stories about your list just now." }));
  shown.forEach((g, gi) => {
    const q = g.x ? S.q[g.x.symbol] : null;
    const sub = g.kind === "markets" ? [["^FTSE", "FTSE 100"], ["^GSPC", "S&P 500"]].filter(([s]) => S.q[s]?.chgPct != null).map(([s, nm]) => `${nm} ${pct(S.q[s].chgPct, 1)}`).join(" · ")
      : g.kind === "following" ? "You follow it" : [money(valueOf(g.x), "GBP", 0), g.topic ? `Invests in ${TOPIC_SAID[g.topic]}` : null].filter(Boolean).join(" · ");
    parts.push(h("section.ngroup.rise", { vars: { i: String(Math.min(gi + 2, 8)) }, "aria-label": g.x?.name || "Markets" },
      h(g.x ? "button.nghead" : "div.nghead", g.x ? { type: "button", "data-sym": g.x.symbol, onclick: () => openStock(g.x.symbol) } : {},
        h("span", {}, h("b", { text: g.x?.name || "Markets" }), h("small", { text: sub })), q?.chgPct != null ? h("span", { class: `num ${tone(q.chgPct)}`, text: pct(q.chgPct) }) : null),
      h("div.list.nlist", {}, g.items.map(({ lead: n, more }) => storyRow(n, g.x?.symbol, n.at > S.newsSince, read.has(newsKey(n)), more.length)))));
  });
  if (hidden.size) parts.push(h("p.foot", {}, `Not showing stories from ${and2([...hidden])}. `, h("button.inline", { type: "button", onclick: () => { store.del("newsHide"); core.emit("news"); }, text: "Show Them", "data-k": "news-unhide" })));
  return parts;
}
// a story's own few things: sent in Chat, its link copied, or its source not shown again (a small menu over the
// section, its keys its own: no listener on the page)
function storyMenu(n) {
  const back = M.root.ownerDocument.activeElement;
  const close = () => { layer.classList.add("closing"); setTimeout(() => layer.remove(), 260); back?.focus?.({ preventScroll: true }); };
  const act = (label, fn, cls) => h(cls ? `button.${cls}` : "button", { type: "button", onclick: () => { close(); fn(); }, text: label });
  const layer = h("div.amenu", { role: "dialog", "aria-modal": "true", "aria-label": n.title, onclick: (e) => { if (e.target === layer) close(); }, onkeydown: (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } } },
    h("div.amg", {}, h("p.amt", { text: n.title }), act("Send in Chat", () => shareStory(n)), act("Copy Link", () => copyStory(n)), act(`Hide Stories from ${n.src}`, () => hideSource(n.src), "warn")),
    h("button.amc", { type: "button", onclick: close, text: "Cancel" }));
  M.root.append(layer);
  requestAnimationFrame(() => layer.querySelector(".amg button")?.focus());
}
// (its title and link only, S2-D6: core.storySend)
function shareStory(n) { M.fw.send(core.storySend(n)); }
const copyStory = (n) => navigator.clipboard?.writeText(n.link).then(() => toast("Link copied"), () => toast(n.link)) ?? toast(n.link);
function hideSource(src) { store.set("newsHide", [...new Set([...store.get("newsHide", []), src])].slice(-50)); toast(`Stories from ${src} hidden`); core.emit("news"); }
storyView.sheet = "story";

export function openStory(ctx, id) {
  const n = typeof id === "object" ? id : storyOf(id);
  if (!n) { toast("That story isn’t in the news just now."); return null; }
  return openSheet(storyView, n);
}
export function view(el, ctx) {
  const sec = el;
  return {
    draw(animate = true) { keepFocus(() => sec.replaceChildren(h("div.mk-view", {}, newsView()))); afterDraw(sec, animate); },
    hide() {},
    destroy() { sec.replaceChildren(); },
  };
}

export { newsBrief, storyRow, storyView, forYou, storyMenu, shareStory, copyStory, hideSource, newsView };
