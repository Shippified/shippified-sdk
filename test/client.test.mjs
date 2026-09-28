// Smoke tests for request building. Runs against the compiled dist/
// (`npm test` builds first) with a fake fetch; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ShippifiedApiError, ShippifiedClient, verifyShippifiedSignature } from "../dist/index.js";

function fakeClient({ status = 200, response = {}, token = "sk_test" } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    return new Response(JSON.stringify(response), { status });
  };
  const client = new ShippifiedClient({ baseUrl: "https://example.test/", token: token ?? undefined, fetch });
  return { client, calls };
}

test("orders.list sends current status values as query params", async () => {
  const { client, calls } = fakeClient({ response: { items: [], total: 0, limit: 50, offset: 0, hasMore: false } });
  await client.orders.list({ status: "shipped", hasTracking: true, q: "ps5 pro", store: undefined });
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].url, "https://example.test/api/orders?status=shipped&hasTracking=true&q=ps5%20pro");
  assert.equal(calls[0].headers.authorization, "Bearer sk_test");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[0].headers["content-type"], undefined);
});

test("orders.patch / reparse hit the right routes", async () => {
  const { client, calls } = fakeClient();
  await client.orders.patch("ord 1", { salePriceCents: 12000, trackingNumber: "1Z" });
  await client.orders.reparse();
  assert.deepEqual(
    calls.map((c) => [c.method, c.url]),
    [
      ["PATCH", "https://example.test/api/orders/ord%201"],
      ["POST", "https://example.test/api/orders/reparse"],
    ],
  );
  assert.deepEqual(calls[0].body, { salePriceCents: 12000, trackingNumber: "1Z" });
  assert.equal(calls[0].headers["content-type"], "application/json");
});

test("custom template CRUD + detect", async () => {
  const { client, calls } = fakeClient();
  const body = { source: "webhook", name: "Hayha", eventType: "order_canceled", mappings: [] };
  await client.templates.createCustom(body);
  await client.templates.updateCustom("tmpl_1", body);
  await client.templates.deleteCustom("tmpl_1");
  await client.templates.detect({ source: "email", sample: "raw", draft: { id: "tmpl_1", ...body } });
  await client.templates.matchPreview({ source: "webhook", sample: "{}", rules: [] });
  assert.deepEqual(
    calls.map((c) => [c.method, c.url.replace("https://example.test", "")]),
    [
      ["POST", "/api/templates/custom"],
      ["PATCH", "/api/templates/custom/tmpl_1"],
      ["DELETE", "/api/templates/custom/tmpl_1"],
      ["POST", "/api/templates/custom/detect"],
      ["POST", "/api/templates/custom/match-preview"],
    ],
  );
  assert.equal(calls[3].body.draft.id, "tmpl_1");
});

test("listCustom reads GET /api/templates/custom", async () => {
  const { client, calls } = fakeClient({ response: { items: [{ id: "tmpl_1" }] } });
  const list = await client.templates.listCustom();
  assert.equal(calls[0].url, "https://example.test/api/templates/custom");
  assert.deepEqual(list, [{ id: "tmpl_1" }]);
});

test("email source poll / rebuild", async () => {
  const { client, calls } = fakeClient();
  await client.emailSources.poll("email_1");
  await client.emailSources.rebuild("email_1", { sinceDays: 14 });
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace("https://example.test", "")]), [
    ["POST", "/api/email-sources/email_1/poll"],
    ["POST", "/api/email-sources/email_1/rebuild"],
  ]);
  assert.deepEqual(calls[1].body, { sinceDays: 14 });
});

test("public endpoints skip auth and work without a token", async () => {
  const health = { ok: true, uptimeMs: 1, version: "dev", node: "v22", persistence: { mode: "postgres", ok: true, latencyMs: 2 }, counts: { users: 1, orders: 2 } };
  const { client, calls } = fakeClient({ response: health, token: null });
  const result = await client.public.getHealth();
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(result.persistence.mode, "postgres");
});

test("authed call without a token throws before fetching", async () => {
  const { client, calls } = fakeClient({ token: null });
  await assert.rejects(() => client.orders.reparse(), /token required/);
  assert.equal(calls.length, 0);
});

test("non-2xx throws ShippifiedApiError with status and body", async () => {
  const { client } = fakeClient({ status: 409, response: { error: "A rebuild is already running for this source." } });
  await assert.rejects(
    () => client.emailSources.rebuild("email_1"),
    (err) => err instanceof ShippifiedApiError && err.status === 409 && /already running/.test(err.message),
  );
});

test("verifyShippifiedSignature round-trips an HMAC", async () => {
  const { createHmac, webcrypto } = await import("node:crypto");
  const rawBody = JSON.stringify({ type: "order.created" });
  const header = `sha256=${createHmac("sha256", "whsec_x").update(rawBody).digest("hex")}`;
  assert.equal(await verifyShippifiedSignature({ rawBody, header, secret: "whsec_x", crypto: webcrypto }), true);
  assert.equal(await verifyShippifiedSignature({ rawBody, header, secret: "wrong", crypto: webcrypto }), false);
});

test("listBots walks every page, not just the first 50", async () => {
  const calls = [];
  const all = Array.from({ length: 230 }, (_, i) => ({ id: `bot_${i}` }));
  const fetch = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const limit = Math.min(200, Number(u.searchParams.get("limit") ?? 50));
    const offset = Number(u.searchParams.get("offset") ?? 0);
    const items = all.slice(offset, offset + limit);
    return new Response(JSON.stringify({ items, total: all.length, limit, offset, hasMore: offset + items.length < all.length }), { status: 200 });
  };
  const client = new ShippifiedClient({ baseUrl: "https://example.test/", token: "sk_test", fetch });
  const { bots } = await client.listBots();
  assert.equal(bots.length, 230);
  assert.equal(bots[229].id, "bot_229");
  assert.equal(calls.length, 2);
});

test("apiKeys.create sends the scope only when given", async () => {
  const { client, calls } = fakeClient({ response: { key: "sk_x", record: { id: "key_1", scope: "read" } } });
  await client.apiKeys.create("reader", { scope: "read" });
  await client.apiKeys.create("default");
  assert.deepEqual(calls[0].body, { name: "reader", scope: "read" });
  assert.deepEqual(calls[1].body, { name: "default" });
});

test("a read-only key's 403 surfaces as ShippifiedApiError", async () => {
  const { client } = fakeClient({ status: 403, response: { error: "This API key is read-only. Use a read & write key for this request." } });
  await assert.rejects(
    () => client.webhookSubscriptions.update("whsub_1", { eventTypes: ["order.created"] }),
    (err) => err instanceof ShippifiedApiError && err.status === 403 && /read-only/.test(err.message),
  );
});
