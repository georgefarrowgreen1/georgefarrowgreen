// Selector lists have commas inside functional selectors and attribute strings.
// Keep those intact before applying the module's existing scope allowlist.
function inspect(selector) {
  if (typeof selector !== 'string') throw new TypeError('Expected a CSS selector');
  const stack = [], commas = [], pairs = new Map();
  let quote = null;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '\\') { if (++i >= selector.length) throw new SyntaxError('Incomplete CSS escape'); continue; }
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '/' && selector[i + 1] === '*') {
      const end = selector.indexOf('*/', i + 2);
      if (end < 0) throw new SyntaxError('Unclosed CSS comment');
      i = end + 1; continue;
    }
    if (c === '(' || c === '[') stack.push({ c, at: i });
    else if (c === ')' || c === ']') {
      const open = stack.pop();
      if (!open || open.c !== (c === ')' ? '(' : '[')) throw new SyntaxError('Unbalanced CSS selector');
      pairs.set(open.at, i);
    } else if (c === ',' && !stack.length) commas.push(i);
  }
  if (quote || stack.length) throw new SyntaxError('Unclosed CSS selector');
  return { commas, pairs };
}

export function splitSelectorList(selector) {
  const { commas } = inspect(selector), parts = [];
  let start = 0;
  for (const end of [...commas, selector.length]) {
    const part = selector.slice(start, end).trim();
    if (!part) throw new SyntaxError('Empty CSS selector branch');
    parts.push(part); start = end + 1;
  }
  return parts;
}

export function hasScopedPrefix(selector, prefixes) {
  const one = selector.trim(), parsed = inspect(one);
  if (!one || parsed.commas.length) return false;
  if (prefixes.some(prefix => one.startsWith(prefix) &&
      !/[\w\u0080-\uffff\\-]/.test(one.slice(prefix.length, prefix.length + 1)))) return true;
  // :is() can be the scope root only if every alternative is itself scoped.
  // A child :is() following an allowed prefix already stays in that scope.
  if (!/^:is\(/i.test(one)) return false;
  const end = parsed.pairs.get(3);
  return end !== undefined && splitSelectorList(one.slice(4, end))
    .every(branch => hasScopedPrefix(branch, prefixes));
}
