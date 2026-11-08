# Keyless price stream prototype

The optional **Live prices (experimental)** switch uses Yahoo Finance's public
WebSocket at `wss://streamer.finance.yahoo.com/?version=2`. It needs no API key,
Yahoo sign-in, cookie forwarding or server secret. Enable it in Markets Settings
on its own address, or **About These Prices** inside InFlite. The preference is
per account and device, off by default. Only followed/opened market symbols are
sent directly from that device to Yahoo; quantities, costs and account details
stay in InFlite.

This first implementation subscribes to supported US shares/funds and crypto.
It rejects ticks older than 90 seconds, future timestamps, wrong currencies,
unknown symbols and updates older than the current quote. London shares and
indices retain HTTP quotes: receiving a delayed price over a WebSocket does not
make it real time. Pre-market and after-hours ticks remain separate from regular
prices and portfolio totals. The source's timestamp is always retained.

HTTP refreshes continue every 15 seconds. A newer stream tick survives an older
HTTP response. UI updates are batched at most four times per second. Connections
stop when the view is hidden, the option is disabled or the account signs out;
reconnect delay grows from 2 to 60 seconds and the subscription is renewed every
15 seconds. No new server infrastructure is needed. Server alerts and historical
charts continue to use the existing HTTP source; this prototype changes prices
in the open view only.

## Evidence and limits

On 8 November 2026, unauthenticated connections to both Yahoo's pricing stream
and Coinbase Exchange's ticker stream succeeded and delivered crypto ticks.
Yahoo's chart HTTP endpoint returned 429 from this environment at the same time.
US and London exchanges were closed, so live US-share delivery must still be
checked during a trading session. This is an experimental, undocumented Yahoo
interface, with no availability or redistribution guarantee. It can change.
The existing polling path remains available if it fails.

Coinbase's public WebSocket is a verified alternative for crypto, but is not
integrated into this prototype. It cannot supply London or US equity prices.
No reliable supported keyless real-time London equity feed was established.

References:

- [Yahoo's exchange coverage and delays](https://help.yahoo.com/kb/SLN2352.html)
- [London Stock Exchange real-time data access](https://www.londonstockexchange.com/en/markets-products/market-data/real-time-data-access)
- [London Stock Exchange public site: prices delayed at least 15 minutes](https://www.londonstockexchange.com/index.html)
- [Yahoo wire schema used by yfinance](https://github.com/ranaroussi/yfinance/blob/main/yfinance/pricing.proto)
- [Coinbase public exchange WebSocket](https://docs.cdp.coinbase.com/exchange/websocket-feed/overview)

## Validation

Run `node --test .tools/tests/unit/marketslive.test.mjs` for protocol validation,
freshness, session separation, reconnection, batching, old-poll protection and
cleanup. Run `CHROMIUM=/usr/bin/chromium node .tools/tests/marketslive.mjs` for
both real UIs with a controlled WebSocket; no external source is contacted.
The companion inflite branch permits only Yahoo's exact WebSocket host in the
page's `connect-src` policy. Deploying the app alone leaves the hub's stream
blocked by its old policy, with polling continuing normally.
