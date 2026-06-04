# shippified-sdk

Official TypeScript client for the Shippified API. Cooks, tracking, profitability, share cards — typed wrapper around the same REST surface the Shippified dashboard uses.

## Install

```bash
npm install shippified-sdk
```

## Quick start

```ts
import { ShippifiedClient } from "shippified-sdk";

const client = new ShippifiedClient({
  baseUrl: "https://shippified.net",
  token: process.env.SHIPPIFIED_TOKEN, // bearer token from /api/auth/login
});

// Public — no token required
const stats = await client.getLandingStats();
console.log(`${stats.ordersTracked} orders tracked, ${stats.platformsSupported} platforms`);

// Authed
const state = await client.getState();
console.log(`${state.user.displayName} has ${state.orders.length} orders.`);

// Generate a share card for the last 30 days
const share = await client.createShare({
  timeframe: "30d",
  include: { stats: true, checkouts: true },
  theme: { id: "sunset", c1: "#fcd34d", c2: "#fb7185", c3: "#b794f6", buttonColor: "#fb7185" },
});
console.log(`Share at https://shippified.net/share/${share.share.slug}`);
```

## Authentication

`token` is the bearer token returned by `POST /api/auth/login`. Treat it like any API key — keep it out of source, rotate when needed.

```ts
const res = await fetch("https://shippified.net/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "you@example.com", password: "…" }),
});
const { token } = await res.json();
```

## Errors

All non-2xx responses throw `ShippifiedApiError` with the status code and parsed body so you can branch cleanly:

```ts
import { ShippifiedApiError } from "shippified-sdk";

try {
  await client.getState();
} catch (err) {
  if (err instanceof ShippifiedApiError) {
    if (err.status === 401) await reauth();
    else if (err.status === 429) await backoff();
    else throw err;
  }
}
```

## Custom fetch (Node <18)

```ts
import { ShippifiedClient } from "shippified-sdk";
import fetch from "node-fetch";

const client = new ShippifiedClient({ token, fetch: fetch as any });
```

## What's NOT covered yet

The SDK ships with the most-used endpoints. Roadmap:

- Streaming order updates over SSE
- Webhook intake — submit cooks programmatically without going through Discord
- Tracking refresh + per-order detail
- Embed-copier sample submission (already public via the bot)

Open an issue or PR if you need something now.
