# shippified-sdk

TypeScript client for the Shippified REST API. It gives you typed access to the same endpoints the Shippified dashboard uses: orders, carrier tracking, email intake, parsing templates, outbound webhooks, share cards and billing.

Zero runtime dependencies. Works in Node 18+ (global `fetch`), browsers, and workers.

## Install

Install it from GitHub (the repository ships the built `dist/`):

```bash
npm install github:Shippified/shippified-sdk#v0.2.0
```

Leave off `#v0.2.0` to track the latest commit on `main`. The package isn't on the npm registry yet, so `npm install shippified-sdk` won't find it.

## Quick start

```ts
import { ShippifiedClient } from "shippified-sdk";

const client = new ShippifiedClient({
  baseUrl: "https://shippified.net",   // default
  token: process.env.SHIPPIFIED_TOKEN, // API key (sk_…) or session token
});

// Public, no token required
const stats = await client.public.getLandingStats();

// Orders: paginated { items, total, limit, offset, hasMore }
const shipped = await client.orders.list({ status: "shipped", limit: 50 });

// Fill in missing data / set the resale price (see "Editing orders")
await client.orders.patch(shipped.items[0].id, { salePriceCents: 18000 });

// After changing templates, re-parse stored messages
const summary = await client.orders.reparse(); // { reparsed, changed, merged, removed, skipped }
```

## Authentication

`token` is sent as `Authorization: Bearer <token>`. Use an **API key** (`sk_…`). You can create one in the dashboard, or with an existing session:

```ts
const { key } = await client.apiKeys.create("my-script"); // raw key is returned only once
```

A session token from `POST /api/auth/login` also works, but it expires.

## Resources

| Sub-client | Covers |
|---|---|
| `orders` | `list`, `get`, `create`, `patch`, `delete`, `getTracking`, `refreshTracking`, `syncTracking`, `reparse` |
| `bots` | Discord webhook bots CRUD |
| `emailSources` | CRUD, `poll`, `rebuild`, `import` |
| `templates` | `list` (built-ins), `listCustom`, `createCustom`, `updateCustom`, `deleteCustom`, `preview`, `matchPreview`, `detect` |
| `subscriptions` | recurring-cost records CRUD |
| `shares` | share cards (`create`, `list`, `delete`, `imageUrl`, `pageUrl`) |
| `webhookSubscriptions` | outbound webhooks CRUD, `test`, `rotateSecret` |
| `webhookLogs` | intake audit log |
| `apiKeys`, `account`, `billing` | keys, profile settings, plan usage and Stripe sessions |
| `public` | `getLandingStats`, `getProfile`, `getHealth`, `getOpenApi` |

## Order status

`OrderStatus` is `"ordered" | "canceled" | "shipped" | "delivered" | "issue"` (exported as `ORDER_STATUSES`). The server derives it from parser and carrier signals. **It cannot be set through the API.** If you filter `orders.list` with an unknown status, the server ignores the filter and returns unfiltered results. The types prevent this.

## Editing orders

`PATCH /api/orders/:id` is **fill-missing-only**. `salePriceCents` can always be changed. Every other field in `OrderPatch` is written only when the order has no value for it yet, so a value the parser extracted is kept. `status` and `actualDelivery` are ignored. Adding a tracking number to an `ordered` order moves it to `shipped`. Check the returned order to see what actually changed.

## Templates

```ts
// Which template would win for this email, and what order would it create? (read-only)
const result = await client.templates.detect({ source: "email", sample: rawEmail });

// Test an unsaved template before saving it
await client.templates.detect({ source: "webhook", sample: payloadJson, draft: { name: "Hayha", mappings, matchRules } });

const tmpl = await client.templates.createCustom({ source: "webhook", name: "Hayha", eventType: "order_placed", sample, mappings, matchRules });
await client.templates.updateCustom(tmpl.id, { name: "Renamed" }); // partial — omitted fields keep their values
await client.orders.reparse(); // apply to existing orders
```

## Email sources

```ts
await client.emailSources.poll(id);                    // fetch new mail now (IMAP / Google / Microsoft)
await client.emailSources.rebuild(id, { sinceDays: 30 }); // 202: re-read the mailbox in the background
// progress: (await client.emailSources.get(id)).rebuilding / .lastRebuild
```

## Errors

Every non-2xx response throws `ShippifiedApiError`, which carries `.status` and the parsed `.body`:

```ts
import { ShippifiedApiError } from "shippified-sdk";

try {
  await client.orders.reparse();
} catch (err) {
  if (err instanceof ShippifiedApiError && err.status === 401) { /* bad or expired token */ }
  else throw err;
}
```

## Verifying outbound webhooks

```ts
import { verifyShippifiedSignature } from "shippified-sdk";

const valid = await verifyShippifiedSignature({
  rawBody,                                   // exact request body string
  header: req.headers["x-shippified-signature"],
  secret: process.env.SHIPPIFIED_WEBHOOK_SECRET,
});
```

## Development

```bash
npm install
npm run typecheck
npm test        # builds, then runs node:test smoke tests against dist/ with a fake fetch
```

The source of truth is the Shippified monorepo; this repository is synced from it on each release, with `dist/` committed so GitHub installs work without a build step.

```bash
```

## License

MIT. See [LICENSE](./LICENSE).
