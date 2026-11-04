// Precision Fit Studio's sign-in (functions/_fitstudio.js): a name and a password, then the app. The browser's own
// password manager fills both (the fields say they're a username and a password), so on the studio's iPad it's a tap.
'use strict';
const form = document.getElementById('si-form'), msg = document.getElementById('si-msg'), go = document.getElementById('si-go');
const pass = document.getElementById('si-pass'), show = document.getElementById('si-show'), name = document.getElementById('si-name');
const say = (t) => { msg.textContent = t; msg.hidden = !t; };
show.addEventListener('click', () => {
  const on = pass.type === 'password'; pass.type = on ? 'text' : 'password';
  show.textContent = on ? 'Hide' : 'Show'; show.setAttribute('aria-pressed', String(on)); pass.focus();
});
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!name.value.trim() || !pass.value){ say('Enter your name and password.'); (name.value.trim() ? pass : name).focus(); return; }
  say(''); go.disabled = true; go.textContent = 'Signing in…';
  try {
    const r = await fetch('api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name:name.value.trim(), password:pass.value}), credentials:'same-origin'});
    if (r.ok){ location.replace('./'); return; }
    let err = 'That didn’t work. Try again.'; try { err = (await r.json()).error || err; } catch (_){}
    say(err); pass.select();
  } catch (_){
    say('No connection. Check the Wi-Fi and try again.');
  }
  go.disabled = false; go.textContent = 'Sign in';
});
name.focus();
