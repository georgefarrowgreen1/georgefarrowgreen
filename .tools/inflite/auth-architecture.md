# InFlite authentication presentation

Every app continues to use auth.inflite.ai and the existing account API. Credential proofs, passkey PRF handling,
encrypted Chat keys, session confirmation, request origins, one-time handbacks and return-URL validation stay in
their existing owners. The frame does not authenticate, store credentials or navigate to supplied URLs.

`account/auth-frame.js` owns the single branded header, destination, title, responsive panel, content and footer.
`authScreen` renders a state; `updateAuthScreen` completes a form in place. `authPage` in `account/app.js` supplies
only validated app context and registers one card entrance. Form builders own their existing events and retain
their DOM when changing a signup step or editing a recovery email. Account's signed-in settings keep their layout.

The same frame covers sign-in, remembered accounts, invites, signup, recovery and email sent, reset-link loading,
invalid/unavailable links, password reset, phone sign-in, Chat unlock, account continuation, sign-out confirmation
and completion, account deletion states, and account security links.

`functions/_acctapp.js` sends `AUTH_LOADING` from that module before auth JavaScript. Account's own loading shell
remains separate. Modules and their dependencies are fingerprinted by the existing server; regenerate minified
copies with `node .tools/minify.mjs`. Keep the CSP and auth-only API routing intact.

Checks: `node .tools/tests/signinrefined.mjs`, `node .tools/tests/authflows.mjs`, and the unit suite. Set
`AUTH_BROWSER=webkit` to check WebKit. Full local journeys: `.tools/tests/run.sh acctsignin acctjoin qrsignin`.
