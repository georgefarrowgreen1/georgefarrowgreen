const form = document.querySelector('#enquiry');
const notice = document.querySelector('#notice');
const sent = document.querySelector('#sent');
const submit = form.querySelector('[type=submit]');
const message = form.elements.message;

function topicPrefix() {
  const topic = form.elements.topic.value;
  return topic ? topic + '\n\n' : '';
}

function validateLength() {
  const limit = 4000 - topicPrefix().length;
  message.setCustomValidity(message.value.trim().length > limit ? 'Please keep your message within ' + limit + ' characters for this topic.' : '');
}
form.addEventListener('input', validateLength);
form.hidden = false;

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  validateLength();
  if (!form.reportValidity()) return;
  const payload = Object.fromEntries(new FormData(form));
  payload.name = payload.name.trim();
  payload.message = payload.message.trim();
  notice.hidden = true;
  if (!payload.name || !payload.message) {
    notice.textContent = 'Please enter your name and a message.';
    notice.hidden = false;
    form.elements[payload.name ? 'message' : 'name'].focus();
    return;
  }
  payload.message = topicPrefix() + payload.message;
  delete payload.topic;
  const controls = Array.from(form.elements);
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
