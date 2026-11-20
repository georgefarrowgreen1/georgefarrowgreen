const form = document.querySelector('#enquiry');
const notice = document.querySelector('#notice');
const sent = document.querySelector('#sent');
const submit = form.querySelector('[type=submit]');
const message = form.elements.message;
const email = form.elements.email;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]$/;

// Keep the native select as the form value. The visible list can use GFG Text on iOS, too.
function setupTopicPicker(select) {
  const label = select.labels[0];
  const trigger = document.getElementById('topic-trigger');
  const list = document.getElementById('topic-options');
  const panel = list?.closest('.topic-panel');
  if (!label || !trigger || !panel) return;
  const options = Array.from(select.options, (option, index) => {
    const item = document.createElement('li');
    item.id = 'topic-option-' + index;
    item.setAttribute('role', 'option');
    item.textContent = option.label;
    list.append(item);
    return item;
  });
  let active = select.selectedIndex;
  let search = '', lastKey = 0;
  let press, draggedOff = false;

  function sync() {
    trigger.textContent = select.selectedOptions[0].label;
    options.forEach((item, index) => item.setAttribute('aria-selected', String(index === select.selectedIndex)));
  }
  function highlight(index) {
    const item = options[index];
    if (panel.inert || !item) return;
    options[active].removeAttribute('data-active');
    active = index;
    item.setAttribute('data-active', '');
    trigger.setAttribute('aria-activedescendant', item.id);
    // Scroll only the list when the keyboard reaches an option outside its visible area.
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }
  function close() {
    if (panel.inert) return;
    releasePress();
    panel.inert = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    search = '';
  }
  function place() {
    const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0, bottom = top + (viewport?.height ?? innerHeight);
    if (rect.bottom <= top || rect.top >= bottom) return false;
    const below = bottom - rect.bottom - 12, above = rect.top - top - 12;
    const flip = below < list.scrollHeight && above > below;
    panel.toggleAttribute('data-above', flip);
    panel.style.setProperty('--topic-room', Math.max(0, flip ? above : below) + 'px');
    return true;
  }
  function reposition() {
    if (!panel.inert && !place()) close();
  }
  function open() {
    if (!place()) return;
    panel.inert = false;
    trigger.setAttribute('aria-expanded', 'true');
    highlight(select.selectedIndex);
  }
  function choose(index) {
    close();
    if (select.selectedIndex === index) return;
    select.selectedIndex = index;
    select.dispatchEvent(new Event('input', {bubbles:true}));
    select.dispatchEvent(new Event('change', {bubbles:true}));
  }

  trigger.addEventListener('click', () => {
    trigger.focus({preventScroll:true});
    if (panel.inert) open(); else close();
  });
  trigger.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.isComposing) return;
    const key = event.key;
    if (key === 'Tab') {
      if (!panel.inert) choose(active);
      return;
    }
    if (key === 'Escape' || key === 'Enter' || key === ' ') {
      if (panel.inert) return; // The button's native activation opens it.
      event.preventDefault();
      if (key === 'Escape') close(); else choose(active);
      return;
    }
    const arrows = key === 'ArrowDown' || key === 'ArrowUp';
    if (arrows || key === 'Home' || key === 'End') {
      event.preventDefault();
      const wasOpen = !panel.inert;
      if (!wasOpen) open();
      if (key === 'Home') highlight(0);
      else if (key === 'End') highlight(options.length - 1);
      else if (wasOpen) highlight(active + (key === 'ArrowDown' ? 1 : -1));
    } else if (key.length === 1 && !event.altKey) {
      event.preventDefault();
      const now = performance.now();
      search = (now - lastKey < 700 ? search : '') + key.toLowerCase();
      lastKey = now;
      const index = options.findIndex(item => item.textContent.toLowerCase().startsWith(search));
      if (index !== -1) {
        if (panel.inert) open();
        highlight(index);
      }
    }
  });
  function releasePress() {
    if (press?.item.hasPointerCapture(press.id)) press.item.releasePointerCapture(press.id);
    press = null;
  }
  list.addEventListener('pointerdown', event => {
    if (press || !event.isPrimary || event.button !== 0 || !options.includes(event.target)) return;
    // Scrolling can flip the list between down and up. Keep a stationary press
    // on its original option, and let an intentional drag leave that option.
    draggedOff = false;
    press = {item:event.target, id:event.pointerId, x:event.clientX, y:event.clientY};
    press.item.setPointerCapture(press.id);
  });
  list.addEventListener('pointerup', event => {
    if (press?.id !== event.pointerId) return;
    draggedOff = Math.hypot(event.clientX-press.x, event.clientY-press.y) > 8 &&
      !press.item.contains(document.elementFromPoint(event.clientX, event.clientY));
  });
  list.addEventListener('lostpointercapture', event => { if (press?.id === event.pointerId) press = null; });
  list.addEventListener('pointermove', event => {
    const index = options.indexOf(event.target);
    if (event.pointerType === 'mouse' && index !== -1 && index !== active) highlight(index);
  });
  list.addEventListener('mousedown', event => { if (event.target !== list) event.preventDefault(); });
  list.addEventListener('click', event => {
    if (draggedOff && event.detail) { draggedOff = false; return; }
    const index = options.indexOf(event.target);
    if (index === -1) return;
    choose(index);
    trigger.focus({preventScroll:true});
  });
  function dismissOutside(event) {
    if (!panel.inert && !trigger.parentElement.contains(event.target) && event.target !== label) close();
  }
  document.addEventListener('pointerdown', dismissOutside);
  document.addEventListener('focusin', dismissOutside);
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, {passive:true});
  window.visualViewport?.addEventListener('resize', reposition);
  window.visualViewport?.addEventListener('scroll', reposition);
  select.addEventListener('change', sync);
  form.addEventListener('submit', close);
  form.addEventListener('reset', () => { close(); queueMicrotask(sync); });
  window.addEventListener('pageshow', event => { if (event.persisted) close(); requestAnimationFrame(sync); });
  sync();
  label.htmlFor = trigger.id;
  select.hidden = true;
  trigger.hidden = false;
}
setupTopicPicker(form.elements.topic);

function topicPrefix() {
  const topic = form.elements.topic.value;
  return topic ? topic + '\n\n' : '';
}

function validateDraft() {
  const limit = 4000 - topicPrefix().length;
  message.setCustomValidity(message.value.trim().length > limit ? 'Please keep your message within ' + limit + ' characters for this topic.' : '');
  email.setCustomValidity(email.value && !EMAIL.test(email.value) ? 'Please enter a valid email address for the reply.' : '');
}
form.addEventListener('input', validateDraft);
form.addEventListener('change', validateDraft);
form.hidden = false;

const panel = form.querySelector('.identity');
const sender = window.createSenderTransition?.(panel, {scrollBox: document.scrollingElement});
if (sender) {
  const name = form.elements.name;
  const shownName = panel.querySelector('.who b'), shownEmail = panel.querySelector('.who small');
  const initial = panel.querySelector('.face');

  function foldSender() {
    const senderName = name.value.trim(), senderEmail = email.value.trim();
    if (!message.value.trim()) return;
    if (!senderName || !EMAIL.test(senderEmail) || email.validity.typeMismatch) {
      sender.setCompact(false, false);
      return;
    }
    if (panel.classList.contains('known') && senderName === shownName.textContent && senderEmail === shownEmail.textContent) return;
    shownName.textContent = senderName;
    shownEmail.textContent = senderEmail;
    initial.textContent = String.fromCodePoint(senderName.codePointAt(0)).toLocaleUpperCase();
    sender.setCompact(true);
  }
  // First text folds a new draft. Returning to an existing message folds re-edited details.
  message.addEventListener('input', foldSender);
  message.addEventListener('focus', foldSender);
  panel.querySelector('.change').addEventListener('click', () => {
    sender.setCompact(false);
    name.focus({preventScroll: true});
  });
  function checkSender() {
    if (panel.classList.contains('known') && (name.value.trim() !== shownName.textContent || email.value.trim() !== shownEmail.textContent)) {
      sender.setCompact(false);
    }
  }
  panel.addEventListener('input', checkSender);
  panel.addEventListener('change', checkSender);
  // Native validation must be able to focus the original input even during a fold.
  panel.addEventListener('invalid', () => sender.setCompact(false, false), true);
  form.addEventListener('reset', () => {
    sender.setCompact(false, false);
    shownName.textContent = shownEmail.textContent = initial.textContent = '';
    email.setCustomValidity('');
    message.setCustomValidity('');
  });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  validateDraft();
  if (!form.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(form));
  payload.name = payload.name.trim();
  payload.message = payload.message.trim();
  notice.hidden = true;
  if (!payload.name || !payload.message) {
    notice.textContent = 'Please enter your name and a message.';
    notice.hidden = false;
    if (!payload.name) sender?.setCompact(false, false);
    form.elements[payload.name ? 'message' : 'name'].focus();
    return;
  }
  payload.message = topicPrefix() + payload.message;
  delete payload.topic;
  const controls = Array.from(form.elements);
  const focused = form.contains(document.activeElement) ? document.activeElement : submit;
  controls.forEach(control => { control.disabled = true; });
  submit.firstChild.textContent = 'Sending… ';
  form.setAttribute('aria-busy', 'true');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('/api/contact', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload), signal:controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Your message could not be confirmed. Please try again later.');
    form.reset();
    form.hidden = true;
    sent.hidden = false;
    sent.querySelector('h3').focus();
  } catch (error) {
    notice.textContent = error.name === 'AbortError' ? 'Confirmation timed out. Your message may have arrived.' :
      error instanceof TypeError ? 'Couldn’t connect. Your draft is here to try again.' : error.message;
    notice.hidden = false;
  } finally {
    clearTimeout(timeout);
    controls.forEach(control => { control.disabled = false; });
    submit.firstChild.textContent = 'Send message ';
    form.removeAttribute('aria-busy');
    if (!form.hidden && document.activeElement === document.body) focused.focus({preventScroll: true});
  }
});
document.querySelector('#again').addEventListener('click', () => {
  sent.hidden = true;
  form.hidden = false;
  form.elements.name.focus();
});

// A visit from the bio has an actual place to return to, often its footer.
// Preserve the normal home link for direct visits and modified clicks.
document.querySelector('.back').addEventListener('click', event => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const nav = window.navigation;
  if (!nav?.currentEntry) return;
  const entries = nav.entries();
  let index = nav.currentEntry.index - 1;
  // The arrow to the form adds a same-document entry between this page and the bio.
  while (entries[index]?.sameDocument) index--;
  const previous = entries[index];
  if (!previous?.url) return;
  const url = new URL(previous.url);
  if (url.origin !== location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.preventDefault();
  history.go(index - nav.currentEntry.index);
});
