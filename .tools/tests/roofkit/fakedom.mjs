// A small stand-in DOM for the framework's unit tests (roofui.test.mjs, roofsearch.test.mjs): enough of document and
// Element for ui.js's builders, the search sheet and its results, and a serialiser that escapes text and attribute
// values the way a browser's would, so a test can see whether data ever became markup. Not a browser: no layout, no
// CSS; innerHTML is kept as given (the builders use it only for the shared block's own glyphs), marked as raw.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escA = (s) => esc(s).replace(/"/g, '&quot;');
const VOID = new Set(['img', 'input', 'br', 'hr', 'meta', 'link']);

class Text { constructor(t) { this.nodeType = 3; this.data = String(t); this.parentNode = null; } get textContent() { return this.data; } remove() { this.parentNode?._drop(this); } }
class Raw { constructor(h) { this.nodeType = 99; this.html = String(h); this.parentNode = null; } get textContent() { return ''; } remove() { this.parentNode?._drop(this); } }

export class El {
  constructor(tag, doc) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.localName = tag.toLowerCase(); this.ownerDocument = doc;
    this.attrs = new Map(); this.childNodes = []; this.parentNode = null; this.listeners = {}; this.props = new Map();
    const self = this;
    this.style = { setProperty: (k, v) => self.props.set(k, String(v)), removeProperty: (k) => self.props.delete(k), getPropertyValue: (k) => self.props.get(k) || '' };
    this.classList = {
      add: (...c) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); c.forEach((x) => s.add(x)); self.className = [...s].join(' '); },
      remove: (...c) => { self.className = self.className.split(/\s+/).filter((x) => x && !c.includes(x)).join(' '); },
      toggle: (c, on) => { const has = self.classList.contains(c); const want = on === undefined ? !has : !!on; if (want) self.classList.add(c); else self.classList.remove(c); return want; },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === 'string' ? self.getAttribute(`data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`) ?? undefined : undefined),
      set: (_, k, v) => { self.setAttribute(`data-${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, v); return true; },
      deleteProperty: (_, k) => { self.removeAttribute(`data-${k}`); return true; },
    });
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] || null; }
  get firstElementChild() { return this.children[0] || null; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.ownerDocument?.documentElement; }
  get className() { return this.getAttribute('class') || ''; }
  set className(v) { this.setAttribute('class', v); }
  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get type() { return this.getAttribute('type') || ''; }
  set type(v) { this.setAttribute('type', v); }
  get href() { return this.getAttribute('href') || ''; }
  get src() { return this.getAttribute('src') || ''; }
  set src(v) { this.setAttribute('src', v); }
  get title() { return this.getAttribute('title') || ''; }
  set title(v) { this.setAttribute('title', v); }
  get rel() { return this.getAttribute('rel') || ''; }
  set rel(v) { this.setAttribute('rel', v); }
  get tabIndex() { return Number(this.getAttribute('tabindex') ?? -1); }
  set tabIndex(v) { this.setAttribute('tabindex', String(v)); }
  get value() { return this._value ?? ''; }
  set value(v) { this._value = String(v); }
  get checked() { return !!this._checked; }
  set checked(v) { this._checked = !!v; }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  setAttribute(k, v) { this.attrs.set(String(k).toLowerCase(), String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  toggleAttribute(k, on) { if (on ?? !this.hasAttribute(k)) this.setAttribute(k, ''); else this.removeAttribute(k); }
  _adopt(n) { if (typeof n === 'string') n = new Text(n); n.parentNode?._drop?.(n); n.parentNode = this; return n; }
  _drop(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; }
  append(...ns) { for (const n of ns) this.childNodes.push(this._adopt(n)); }
  prepend(...ns) { this.childNodes.unshift(...ns.map((n) => this._adopt(n))); }
  after(...ns) { const p = this.parentNode; if (!p) return; const i = p.childNodes.indexOf(this); p.childNodes.splice(i + 1, 0, ...ns.map((n) => p._adopt(n))); }
  replaceChildren(...ns) { for (const c of [...this.childNodes]) this._drop(c); this.append(...ns); }
  remove() { this.parentNode?._drop(this); }
  contains(n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (matches(n, sel)) return n; n = n.parentNode; } return null; }
  matches(sel) { return matches(this, sel); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(); if (v !== '' && v != null) this.append(new Text(v)); }
  set innerHTML(h) { this.replaceChildren(); if (h) this.append(new Raw(h)); }
  insertAdjacentHTML(_, h) { this.append(new Raw(h)); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  dispatch(t, extra = {}) { const e = { type: t, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra }; for (const f of [...(this.listeners[t] || [])]) f(e); return e; }
  click() { this.dispatch('click'); }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
  getClientRects() { return [1]; }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (sel.split(',').some((s) => matches(c, s.trim()))) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  get outerHTML() {
    const a = [...this.attrs].map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${escA(v)}"`)).join('');
    if (VOID.has(this.localName)) return `<${this.localName}${a}>`;
    return `<${this.localName}${a}>${this.childNodes.map((c) => (c.nodeType === 1 ? c.outerHTML : c.nodeType === 99 ? `<!--raw-->${c.html}<!--/raw-->` : esc(c.data))).join('')}</${this.localName}>`;
  }
}
// one compound selector (tag, .class, #id, [attr], [attr=value]), with descendant combinators by spaces
function one(n, s) {
  const m = s.match(/^([a-z0-9-]*)((?:[.#][\w-]+|\[[^\]]+\])*)$/i);
  if (!m) return false;
  if (m[1] && n.localName !== m[1].toLowerCase()) return false;
  for (const p of m[2].match(/[.#][\w-]+|\[[^\]]+\]/g) || []) {
    if (p[0] === '.') { if (!n.classList.contains(p.slice(1))) return false; }
    else if (p[0] === '#') { if (n.id !== p.slice(1)) return false; }
    else { const [k, v] = p.slice(1, -1).split('='); if (!n.hasAttribute(k)) return false; if (v != null && n.getAttribute(k) !== v.replace(/^["']|["']$/g, '')) return false; }
  }
  return true;
}
function matches(n, sel) {
  const parts = sel.trim().split(/\s+/);
  if (!one(n, parts.at(-1))) return false;
  let i = parts.length - 2, p = n.parentNode;
  while (i >= 0 && p && p.nodeType === 1) { if (one(p, parts[i])) i--; p = p.parentNode; }
  return i < 0;
}

export function fakeDocument() {
  const doc = { activeElement: null, cookie: '' };
  doc.createElement = (t) => new El(t, doc);
  doc.createTextNode = (t) => new Text(t);
  doc.documentElement = new El('html', doc);
  doc.body = new El('body', doc);
  doc.head = new El('head', doc);
  doc.documentElement.append(doc.head, doc.body);
  doc.querySelector = (s) => doc.documentElement.querySelector(s);
  doc.querySelectorAll = (s) => doc.documentElement.querySelectorAll(s);
  doc.getElementById = (id) => doc.documentElement.querySelector(`#${id}`);
  doc.addEventListener = () => {}; doc.removeEventListener = () => {};
  doc.visibilityState = 'visible';
  return doc;
}
