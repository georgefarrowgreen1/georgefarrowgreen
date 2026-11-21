# InFlite email delivery

## Test the real sending paths

Use **Account → Admin → Email** to send one test each from Account, Chat, Weather and Status. The default destination is the configured admin inbox. To compare providers, add the `EMAIL_DELIVERY_TEST_INBOXES` secret to the InFlite Apps Worker with a comma-separated list of operator-controlled mailboxes. Use Gmail, Outlook and iCloud if available. The admin can select one configured inbox per run. The server checks the selection and requires recent admin authentication before sending.

The report shows the sender, provider outcome and message ID when available. Use the ID to find the message in Cloudflare Email Service’s Activity log. A queued message may need more time. A recipient server can accept a message and place it in Spam. Check both Inbox and Spam in each test mailbox. [Cloudflare Activity log](https://developers.cloudflare.com/email-service/observability/logs/)

Send a short test from InFlite Mail separately. It uses the Email Sending Worker binding, while automated InFlite mail normally uses Cloudflare’s REST API. Use a representative test from the affected workflow if generic tests pass. Keep sign-in and reset links out of shared diagnostics. [Cloudflare sending APIs](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/)

## Check authentication and placement

1. Inspect the recipient’s original headers for `Authentication-Results`, `From` and `Return-Path`. In Gmail, use **Show original**. Record the mailbox provider, sender, folder, message ID and the SPF, DKIM and DMARC results for the affected message.
2. Verify the returned DKIM signing domain and the envelope sender against the `From` domain. With a root-domain `From` address and a `cf-bounce.inflite.ai` envelope sender, strict DMARC alignment depends on a passing `inflite.ai` DKIM signature. Compare the public records with **Email Service → Email Sending → Settings**. [Cloudflare DNS setup](https://developers.cloudflare.com/email-service/configuration/domains/#sending-records)
3. For authentication failures, fix the affected sender or signing configuration and repeat the same test. Add a `rua` address to the existing DMARC record once a reporting mailbox or collector is verified. Keep the existing policy and alignment tags when adding reporting. [Cloudflare email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/)
4. For authenticated mail in Spam, compare results across recipients and sending paths. Check provider activity for deferrals, permanent bounces and suppressions. Verify an address before retrying a suppressed send. Keep login and security mail separate from optional campaigns, send subscribed mail at a predictable frequency, and keep the one-click unsubscribe and visible unsubscribe link on Weather and Chat notification emails. [Gmail sender guidelines](https://support.google.com/mail/answer/81126) · [Yahoo sender best practices](https://senders.yahooinc.com/best-practices/)

Use Google Postmaster Tools to review Gmail reputation, authentication and complaints when volume allows. Google recommends a reported spam rate below 0.1%. For low-volume senders, use the mailbox tests and provider activity log to track changes. [Gmail sender FAQ](https://support.google.com/mail/answer/14229414) · [Postmaster dashboards](https://support.google.com/mail/answer/14668346)
