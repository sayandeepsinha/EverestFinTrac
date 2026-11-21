# EverestFinTracker — India

A personal INR finance dashboard for manually entered NSE and BSE stock and Indian mutual-fund holdings, plus income and expense records.

## Architecture

- A dependency-free browser UI runs calculations locally. Current INR records live in the `northstar-india-v2` browser storage key. Legacy USD records are kept separately under `northstar-v1` and can be exported from Data backup; they are never converted or added to INR totals.
- A Cloudflare Worker serves the page and exposes bounded same-origin quote/search endpoints. It fetches NSE's public MCP stock quotes, Yahoo Finance BSE quotes and MFapi mutual-fund NAV history; no API key is required. Name searches use Yahoo Finance for NSE/BSE company names and MFapi for fund schemes; search terms are sent to those services. In-memory cache TTL is one minute for stocks and one hour for funds, per Worker isolate. Cache and provider availability are not guaranteed.
- Stock day change uses the latest NSE price minus previous close. Mutual-fund day change uses the latest published NAV minus the preceding NAV. Portfolio day change is the sum for priced holdings with a previous value and shows coverage; holdings with missing prices are excluded from totals and flagged.
- NSE quotes are typically delayed 1–3 minutes; BSE quotes can be delayed and have no guaranteed freshness and are for informational, non-commercial use under NSE terms. NAVs are daily, not intraday, and publication may be delayed. Quotes can be unavailable or stale outside market hours. This app does not connect to broker accounts or place trades.
- Manually adding holdings does not change cash; record any associated cash movement separately. This is a personal tracker, not a tax or accounting ledger.

## Build and test

Run `bash scripts/build.sh`, `node scripts/validate-artifact.mjs`, `node tests/india.test.mjs` and `node tests/frontend.test.cjs`. Tests mock provider responses and do not replace a real deployed browser test. The Worker is generated from `worker/index.js` and `public/index.html`; do not edit generated `dist` files.
