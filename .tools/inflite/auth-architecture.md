# InFlite authentication presentation

Every app continues to use auth.inflite.ai and the existing account API. Credential proofs, passkey PRF handling,
encrypted Chat keys, session confirmation, request origins, one-time handbacks and return-URL validation stay in
their existing owners. The frame does not authenticate, store credentials or navigate to supplied URLs.

`account/auth-frame.js` owns the single branded header, destination, title, responsive panel, content and footer.
`authScreen` renders a state; `updateAuthScreen` completes a form in place. `authPage` in `account/app.js` supplies
only validated app context and registers one card entrance. Form builders own their existing events and retain
their DOM when changing a signup step or editing a recovery email. Account's signed-in settings keep their layout.

The app return control names the destination once; recovery retains its destination alongside Back to sign in.
On a passkey-capable browser the first view reveals the password form on request. Remembered password users and
browsers without passkey support get the password form directly. Both disclosures retain the existing fields and
their values, expose their expanded state, and move focus into the chosen method. Sign-in feedback reserves one
line; a dismissed passkey is a neutral status, while credential and service failures remain alerts.

Password mode hides the passkey action and retains one control to return to passkey mode. Recovery, signup and
invalid-link screens have one return to sign-in; email confirmation uses its main return action, restoring the
header control when editing the email. A remembered account has one switch-account action, which forgets it locally.

The same frame covers sign-in, remembered accounts, invites, signup, recovery and email sent, reset-link loading,
invalid/unavailable links, password reset, phone sign-in, Chat unlock, account continuation, sign-out confirmation
and completion, account deletion states, and account security links.

`functions/_acctapp.js` sends `AUTH_LOADING` from that module before auth JavaScript. Account's own loading shell
remains separate. Modules and their dependencies are fingerprinted by the existing server; regenerate minified
copies with `node .tools/minify.mjs`. Keep the CSP and auth-only API routing intact.

Checks: `node .tools/tests/signinrefined.mjs`, `node .tools/tests/authflows.mjs`, and the unit suite. Set
`AUTH_BROWSER=webkit` to check WebKit. Full local journeys: `.tools/tests/run.sh acctsignin acctjoin qrsignin`.
