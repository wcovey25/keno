# Keno Scanner v44

A client-side analytics dashboard for **Stake Originals Keno**. It imports bet archives, verifies provably fair seeds and computes tile, overdue and RTP statistics.
All parsing, hashing and math run **in your browser, in Web Workers**. The server only serves static files, and your data and seeds never leave the tab.

## Stack

| Layer | Choice | Why |
|---|---|---|
| UI | React 19 + TypeScript, Tailwind CSS v4, Lucide icons | Typed components, zero-runtime CSS, small icon set |
| State | Zustand (+ `persist` for preferences only) | Selector subscriptions: a slider tick re-renders only what reads the range |
| Validation | Zod | Per-record schema validation of untrusted archive JSON |
| Compute | 2 module Web Workers + a tiny typed RPC (`src/workers/rpc.ts`) | Heavy work never touches the UI thread; scans can be hard-cancelled |
| Charts | Hand-rolled SVG (`src/components/charts.tsx`) | Series are downsampled in the worker (≤ 600 points), so no chart library is needed |
| Build / host | Vite 8 → Cloudflare Workers Static Assets (`wrangler.toml`) | Static SPA with security headers from `public/_headers` |
| Tests | Vitest | Engine is pure TS and tested against reference implementations |

## Architecture

```
┌──────────── UI thread (React) ────────────┐
│ store.ts (zustand) ◄── actions.ts ──┐     │   small, render-ready results only
└─────────────────────────────────────┼─────┘
          typed RPC (postMessage)     │
┌─────────── data.worker.ts ──────────▼─────┐   owns the datasets (typed-array columns)
│ parser.ts  → merge / dedupe / sort        │   ingest · generatePf · analyze · verify
│ provablyFair.ts + sha256.ts               │   draws (log paging) · export · timeToRange
│ stats.ts   → tiles, set tracker, RTP      │
└──────────────────┬────────────────────────┘
                   │ Uint8Array window (transferred, zero-copy)
┌──────────── scan.worker.ts ───────────────┐   stateless; cancel = terminate + respawn
│ scanner.ts → bit-sliced combo scanner     │
└───────────────────────────────────────────┘
```

* **Columnar dataset** (`src/core/dataset.ts`): each draw costs 10 bytes (`Uint8Array`) plus a few `Float64Array` columns. One million provably fair rounds take about 10 MB.
* **Coalesced analysis** (`startAnalysisScheduler`): changes to the source, window, config or data are debounced (60 ms). While one analysis runs, further changes collapse into a single follow-up with the latest parameters, so dragging the range slider never queues stale work.
* **Measured**: 1M rounds generate in about 2 s; full analysis of 1M draws takes about 0.5 s in the worker. Dragging the window over 1M draws produced **zero main-thread long tasks**.

### Core modules (`src/core`)

| File | Purpose |
|---|---|
| `sha256.ts` | Synchronous SHA-256 / HMAC-SHA256. The HMAC pads are precomputed per server seed, so each round costs about 4 compressions. Tested against `node:crypto`. |
| `provablyFair.ts` | Stake Keno draw generation and server-seed hash check. |
| `payouts.ts` | Stake payout tables for Classic / Low / Medium / High, with hypergeometric odds, theoretical RTP and σ. |
| `parser.ts` | Tolerant archive walker, per-record Zod schema, 0-/1-based detection, cross-file dedupe and chronological sort. |
| `stats.ts` | Tile frequency and hot/cold, χ² uniformity, droughts and gaps, pair co-occurrence, set tracker with simulated P&L, archive RTP. |
| `scanner.ts` | Ranks k-combinations by overdue ratio, drought, hot/cold or simulated RTP. |
| `exporters.ts` | CSV (formula-injection safe) and JSON serializers. |

## Provably fair algorithm

This is identical to Stake's published implementation. `test/provablyFair.test.ts` checks it against a line-by-line transcription of Stake's reference `byteGenerator` / `generateFloats` / Keno code, over 400 random seed and nonce pairs.

```
bytes  = HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:0`)
      ++ HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:1`)      // 40 bytes needed
float_i = b[4i]/256 + b[4i+1]/256² + b[4i+2]/256³ + b[4i+3]/256⁴               // i = 0..9
square_i = remaining.splice(⌊float_i × (40 − i)⌋, 1)   with remaining = [0..39]
```

Squares are 0-indexed like Stake's API; the UI shows board labels 1–40. The *hashed* server seed is `sha256(serverSeed)` as hex, and the app checks it when supplied.

## Data ingestion

* **Files**: drag and drop or pick any number of `.json` / NDJSON exports. The parser finds Keno bets anywhere in the document: bare arrays, GraphQL wrappers (`data.user.houseBetList`), `{ bet: { state } }` layers, and so on. Every record is validated on its own: exactly 10 distinct drawn squares, 1–10 distinct picks, and a known risk.
  * Bad records are counted with reasons.
  * Non-Keno bets are skipped.
  * One bad row never sinks a file.
  * Files are capped at 1 GiB.
* **Merge**: dedupes by bet id (or a content fingerprint when ids are missing), then sorts by timestamp with nonce as the tie-breaker.
  * **Numbering is auto-detected.** A `0` proves 0-based, a `40` proves 1-based. You can override it in the sidebar.
* **Seeds**: generate up to 5M rounds from a revealed server seed, client seed and nonce range.
* **Combined mode** (Verify tab): every archived bet in the window is re-derived from its nonce and compared with the recorded draw.

## Analytics

* **Tiles**:
  * Frequency, z-scores and a recent-window heatmap.
  * A χ² uniformity test corrected for drawing 10 of 40 *without replacement*: `χ² = Σ(O−E)²·(M−1)/(n·p(1−p)·M)`, 39 df. Its calibration is tested.
  * Row and column balance, pair co-occurrence, repeats per draw.
* **Tracker** (K = 3–10, threshold = minimum matches):
  * Current and longest drought, mean and σ of gaps vs the expected 1/p, overdue ratio, and P(drought this long).
  * Observed vs expected match histogram with a pooled χ².
  * Simulated P&L and RTP with a 95% band.
* **Scanner**: per-tile bitsets and 4-bit bit-sliced counters process 32 draws per word operation. It is exhaustive when C(pool, k) fits the budget and otherwise a reproducible random sample. Results are checked against the per-draw engine in tests.
* **RTP**:
  * Actual RTP in bet units (currency-agnostic).
  * Per-currency weighted RTP.
  * Risk × picks groups against theoretical RTP and a 95% band.
  * Streaks, drawdown, top wins.
  * Flags multipliers that disagree with the payout table.
* **Export**: draws, tile stats and scan results as CSV or JSON; the full analysis as JSON; a merged, deduplicated archive backup.

> Keno rounds are independent. "Overdue" describes the past; it does not change the odds of the next round. The UI says so wherever it ranks droughts.

## Development

```bash
npm install
npm run dev          # Vite dev server
npm test             # Vitest: PF vs reference, parser, stats & scanner vs brute force
npm run typecheck
npm run sample       # writes samples/*.json (3,000 bets, 2 overlapping files) + prints the seeds
```

`npm run sample` derives its draws with `node:crypto`, independently of the app. Import both files, then generate rounds from the printed seeds with **Use archive nonce span**. The Verify tab should report 3,000 / 3,000 matched and 300 duplicates removed.

## Deploy to Cloudflare

`wrangler.toml` deploys the built SPA as a **Worker with static assets**. There is no server code. `not_found_handling = "single-page-application"` serves `index.html` for deep links.

```bash
npx wrangler login          # once
npm run deploy              # = npm run build && wrangler deploy
npm run cf:dev              # build + run locally on the Workers runtime (http://localhost:8787)
```

* `public/_headers` adds a strict CSP (`script-src 'self'`, `worker-src 'self' blob:`, `connect-src 'self'`), `X-Frame-Options: DENY` and immutable caching for hashed assets.
* **CI / Workers Builds**: build command `npm ci && npm run build`, deploy command `npx wrangler deploy`.
* **Cloudflare Pages** (alternative): framework preset *None*, build command `npm run build`, output directory `dist`. `_headers` works there too.
