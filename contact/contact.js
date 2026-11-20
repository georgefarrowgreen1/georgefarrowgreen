const form = document.querySelector('#enquiry');
const notice = document.querySelector('#notice');
const sent = document.querySelector('#sent');
const submit = form.querySelector('[type=submit]');
const message = form.elements.message;
const email = form.elements.email;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?=.{4,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z][A-Za-z0-9-]{0,61}[A-Za-z0-9]$/;

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
const sender = window.createSenderTransition?.(panel);
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
  const previous = nav?.entries()[nav.currentEntry.index - 1];
  if (!previous?.url) return;
  const url = new URL(previous.url);
  if (url.origin !== location.origin || !['/', '/index.html'].includes(url.pathname)) return;
  event.preventDefault();
  history.back();
});
