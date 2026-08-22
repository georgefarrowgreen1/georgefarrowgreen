---
description: Run every suite and report what broke
---
Run `./test.sh` and report the result.

If anything fails, fix it — but first check whether the *probe* is wrong
rather than the code. Several probes have been wrong before: one matched a
regex against source containing `&amp;` and truncated at the semicolon,
another assumed a fresh approval queue and threw IndexError when run after
another test.

Two probes report `ok` deliberately and must not be "fixed": A1 (loopback
trusted without a token) and A7 (episodes outliving their approvals).
