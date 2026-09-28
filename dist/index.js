/**
 * Shippified SDK — typed wrapper around the public REST API.
 *
 * Usage:
 *   import { ShippifiedClient } from "shippified-sdk";
 *
 *   const shippified = new ShippifiedClient({
 *     baseUrl: "https://shippified.net",
 *     token: process.env.SHIPPIFIED_TOKEN, // sk_… or a session token
 *   });
 *
 *   const orders = await shippified.orders.list({ status: "shipped", limit: 50 });
 *   const fresh = await shippified.orders.refreshTracking(order.id);
 *   await shippified.webhookSubscriptions.create({
 *     url: "https://your-app.com/shippified-webhook",
 *     eventTypes: ["order.created", "order.shipped"],
 *   });
 *
 * Resource sub-clients:
 *   .orders, .bots, .emailSources, .templates, .subscriptions,
 *   .shares, .account, .apiKeys, .billing, .webhookLogs,
 *   .webhookSubscriptions, .public
 *
 * Errors throw `ShippifiedApiError` with .status and .body.
 */
export class ShippifiedApiError extends Error {
    status;
    body;
    constructor(status, body, message) {
        super(message);
        this.status = status;
        this.body = body;
        this.name = "ShippifiedApiError";
    }
}
export const ORDER_STATUSES = ["ordered", "canceled", "shipped", "delivered", "issue"];
export const ORDER_EVENT_TYPES = [
    "order_placed", "order_shipped", "order_update", "order_delivered", "order_canceled", "unknown",
];
class TransportImpl {
    baseUrl;
    token;
    fetchImpl;
    constructor(baseUrl, token, fetchImpl) {
        this.baseUrl = baseUrl;
        this.token = token;
        this.fetchImpl = fetchImpl;
    }
    async request(method, path, body, auth = true) {
        const headers = { accept: "application/json" };
        if (body !== undefined)
            headers["content-type"] = "application/json";
        if (auth) {
            if (!this.token)
                throw new Error(`ShippifiedClient: token required for ${method} ${path}`);
            headers["authorization"] = `Bearer ${this.token}`;
        }
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        const text = await res.text();
        let parsed;
        try {
            parsed = text ? JSON.parse(text) : null;
        }
        catch {
            parsed = text;
        }
        if (!res.ok) {
            const message = parsed && typeof parsed === "object" && "error" in parsed
                ? String(parsed.error)
                : `HTTP ${res.status}`;
            throw new ShippifiedApiError(res.status, parsed, message);
        }
        return parsed;
    }
}
function qs(params) {
    const parts = [];
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "")
            continue;
        parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join("&")}` : "";
}
class OrdersClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list(filters = {}) {
        return this.t.request("GET", `/api/orders${qs(filters)}`);
    }
    get(id) { return this.t.request("GET", `/api/orders/${encodeURIComponent(id)}`); }
    /** Manual order import — hand-enter an order from anywhere.
     *  If `trackingNumber` is set and the carrier is one we support
     *  (UPS / FedEx / DHL / DHL Express), the background tracker
     *  starts refreshing it automatically. Otherwise updates are
     *  manual. */
    create(input) {
        return this.t.request("POST", "/api/orders", input);
    }
    /** Fill-missing-only edit; see `OrderPatch` for exactly what the
     *  server honors. Status and actualDelivery cannot be set. */
    patch(id, patch) { return this.t.request("PATCH", `/api/orders/${encodeURIComponent(id)}`, patch); }
    delete(id) { return this.t.request("DELETE", `/api/orders/${encodeURIComponent(id)}`); }
    getTracking(id) { return this.t.request("GET", `/api/orders/${encodeURIComponent(id)}/tracking`); }
    refreshTracking(id) { return this.t.request("POST", `/api/orders/${encodeURIComponent(id)}/tracking/refresh`); }
    /** Re-fetch carrier state for up to 50 "shipped" orders with tracking numbers. */
    /** Which carriers have live tracking enabled on this instance. Orders on
     *  other carriers move forward from retailer emails instead. */
    carrierStatus() {
        return this.t.request("GET", "/api/carrier-status");
    }
    syncTracking() {
        return this.t.request("POST", "/api/orders/sync-tracking");
    }
    /** Re-run parsing on every order that has stored source messages,
     *  using the current built-in shapes and your custom templates. Values
     *  you entered by hand and carrier data are kept. Synchronous: the
     *  response is the summary. */
    reparse() { return this.t.request("POST", "/api/orders/reparse"); }
}
class BotsClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list(opts = {}) { return this.t.request("GET", `/api/bots${qs(opts)}`); }
    get(id) { return this.t.request("GET", `/api/bots/${encodeURIComponent(id)}`); }
    create(body) { return this.t.request("POST", "/api/bots", body); }
    update(id, patch) { return this.t.request("PATCH", `/api/bots/${encodeURIComponent(id)}`, patch); }
    delete(id) { return this.t.request("DELETE", `/api/bots/${encodeURIComponent(id)}`); }
}
class EmailSourcesClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list(opts = {}) { return this.t.request("GET", `/api/email-sources${qs(opts)}`); }
    get(id) { return this.t.request("GET", `/api/email-sources/${encodeURIComponent(id)}`); }
    create(body) { return this.t.request("POST", "/api/email-sources", body); }
    update(id, patch) { return this.t.request("PATCH", `/api/email-sources/${encodeURIComponent(id)}`, patch); }
    delete(id) { return this.t.request("DELETE", `/api/email-sources/${encodeURIComponent(id)}`); }
    /** On-demand poll (IMAP / Google / Microsoft). Forwarding sources
     *  return `ingested: 0` with an explanatory `error`: nothing to poll. */
    poll(id) { return this.t.request("POST", `/api/email-sources/${encodeURIComponent(id)}/poll`); }
    /** Re-read the mailbox from `sinceDays` ago (1-365, default 30) through
     *  the current parser, replacing the orders this source produced in that
     *  window (only orders that came purely from this source's email and
     *  were never user-edited are deleted and re-created). Returns (202) as soon as it starts; the rebuild runs in the
     *  background, so watch `source.rebuilding` / `source.lastRebuild`.
     *  400 for forwarding sources, 409 if one is already running. */
    rebuild(id, opts = {}) {
        return this.t.request("POST", `/api/email-sources/${encodeURIComponent(id)}/rebuild`, opts);
    }
    /** Import one email by hand. `raw` may be full RFC822 source, HTML or
     *  plain text; `from` is only a fallback sender for pasted bodies with no
     *  headers (checked against the source's allowed senders). Responds with
     *  the full workspace state plus `order` / `merged` (and `duplicate` when
     *  the Message-ID was already imported). 403 sender blocked, 404 unknown
     *  source, 422 not readable as an order, 429 plan limit. */
    import(body) {
        return this.t.request("POST", "/api/email/import", body);
    }
}
class SubscriptionsClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list(opts = {}) { return this.t.request("GET", `/api/subscriptions${qs(opts)}`); }
    get(id) { return this.t.request("GET", `/api/subscriptions/${encodeURIComponent(id)}`); }
    create(body) { return this.t.request("POST", "/api/subscriptions", body); }
    update(id, patch) { return this.t.request("PATCH", `/api/subscriptions/${encodeURIComponent(id)}`, patch); }
    delete(id) { return this.t.request("DELETE", `/api/subscriptions/${encodeURIComponent(id)}`); }
}
class TemplatesClient {
    t;
    constructor(t) {
        this.t = t;
    }
    /** Built-in webhook + email templates. Custom templates are not
     *  included; use `listCustom()`. */
    list() { return this.t.request("GET", "/api/templates"); }
    /** Your custom templates, newest first — the order they're tried in. */
    async listCustom() {
        const r = await this.t.request("GET", "/api/templates/custom");
        return r.items ?? [];
    }
    /** Extract each mapping's value from a sample, using the live engine.
     *  Unresolved mappings come back as "". */
    preview(body) {
        return this.t.request("POST", "/api/templates/custom/preview", body);
    }
    /** Pass/fail for each detection rule against a sample. */
    matchPreview(body) {
        return this.t.request("POST", "/api/templates/custom/match-preview", body);
    }
    /** Full production parse of a sample: which template wins and the
     *  order it would create. Pass `draft` to test an unsaved template (or
     *  unsaved edits to an existing one via `draft.id`) where saving would
     *  put it. Read-only; nothing is stored. */
    detect(body) {
        return this.t.request("POST", "/api/templates/custom/detect", body);
    }
    createCustom(body) { return this.t.request("POST", "/api/templates/custom", body); }
    /** Partial update: fields you omit keep their current values. A
     *  template's `source` can't change after creation. */
    updateCustom(id, body) {
        return this.t.request("PATCH", `/api/templates/custom/${encodeURIComponent(id)}`, body);
    }
    deleteCustom(id) { return this.t.request("DELETE", `/api/templates/custom/${encodeURIComponent(id)}`); }
}
class SharesClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list() { return this.t.request("GET", "/api/shares"); }
    create(body) {
        return this.t.request("POST", "/api/shares", body);
    }
    delete(slug) { return this.t.request("DELETE", `/api/shares/${encodeURIComponent(slug)}`); }
    /** Public URL of the share's OG image. No request — pure URL math. */
    imageUrl(slug) { return `${this.t.baseUrl}/share/${encodeURIComponent(slug)}/image.png`; }
    pageUrl(slug) { return `${this.t.baseUrl}/share/${encodeURIComponent(slug)}`; }
}
class ApiKeysClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list() { return this.t.request("GET", "/api/account/api-keys"); }
    /** Mint a key. Needs a session token — called with an API key it
     *  throws a 403 (API keys can't manage API keys). `scope` defaults to
     *  `"write"` server-side. */
    create(name, opts = {}) {
        return this.t.request("POST", "/api/account/api-keys", opts.scope ? { name, scope: opts.scope } : { name });
    }
    /** Revoke a key. Needs a session token (403 with an API key). */
    delete(id) { return this.t.request("DELETE", `/api/account/api-keys/${encodeURIComponent(id)}`); }
}
class AccountClient {
    t;
    constructor(t) {
        this.t = t;
    }
    setUsername(username) { return this.t.request("POST", "/api/account/username", { username }); }
    checkAvailability(candidate) { return this.t.request("GET", `/api/account/username/available?u=${encodeURIComponent(candidate)}`, undefined, false); }
    setDisplayName(displayName) { return this.t.request("POST", "/api/account/display-name", { displayName }); }
    setVisibility(publicProfile) { return this.t.request("POST", "/api/account/visibility", { publicProfile }); }
    /** Opt in/out of showing your counts on the leaderboard and public profile. */
    setPublicStats(publicStats) { return this.t.request("POST", "/api/account/public-stats", { publicStats }); }
    /** Set the user's IANA timezone (e.g. "America/New_York"). Drives
     *  the free-plan quota window. */
    setTimezone(timezone) { return this.t.request("POST", "/api/account/timezone", { timezone }); }
}
class BillingClient {
    t;
    constructor(t) {
        this.t = t;
    }
    /** Current month usage + cap + reset date. */
    getUsage() { return this.t.request("GET", "/api/billing/usage"); }
    /** Create a Stripe Checkout session for the chosen plan. The
     *  returned URL is hosted by Stripe — redirect the user to it. */
    createCheckout(plan, opts = {}) {
        return this.t.request("POST", "/api/billing/checkout", { plan, ...opts });
    }
    /** Create a Stripe Customer Portal session for managing the
     *  current subscription (change card, plan, cancel). */
    createPortal(returnUrl) {
        return this.t.request("POST", "/api/billing/portal", { returnUrl });
    }
}
class WebhookLogsClient {
    t;
    constructor(t) {
        this.t = t;
    }
    /** Newest first. `limit` 1-500, default 100. */
    list(opts = {}) { return this.t.request("GET", `/api/webhook-logs${qs(opts)}`); }
    clear() { return this.t.request("DELETE", "/api/webhook-logs"); }
}
class WebhookSubscriptionsClient {
    t;
    constructor(t) {
        this.t = t;
    }
    list(opts = {}) { return this.t.request("GET", `/api/webhook-subscriptions${qs(opts)}`); }
    get(id) { return this.t.request("GET", `/api/webhook-subscriptions/${encodeURIComponent(id)}`); }
    create(body) { return this.t.request("POST", "/api/webhook-subscriptions", body); }
    update(id, patch) { return this.t.request("PATCH", `/api/webhook-subscriptions/${encodeURIComponent(id)}`, patch); }
    delete(id) { return this.t.request("DELETE", `/api/webhook-subscriptions/${encodeURIComponent(id)}`); }
    /** Fires a synthetic event of the chosen type — useful for verifying the
     *  receiver works end-to-end during setup. */
    test(id, eventType) {
        return this.t.request("POST", `/api/webhook-subscriptions/${encodeURIComponent(id)}/test`, { eventType });
    }
    /** Mint a new signing secret. The raw secret is in the response once;
     *  receivers on the old secret fail verification immediately. */
    rotateSecret(id) {
        return this.t.request("POST", `/api/webhook-subscriptions/${encodeURIComponent(id)}/rotate-secret`);
    }
}
class PublicClient {
    t;
    constructor(t) {
        this.t = t;
    }
    getLandingStats() { return this.t.request("GET", "/api/landing-stats", undefined, false); }
    getProfile(usernameOrUserId) { return this.t.request("GET", `/api/profile/${encodeURIComponent(usernameOrUserId)}`, undefined, false); }
    /** The server answers 503 when persistence is unhealthy; that is
     *  thrown as ShippifiedApiError whose `body` is the HealthStatus. */
    getHealth() {
        return this.t.request("GET", "/api/healthz", undefined, false);
    }
    getOpenApi() { return this.t.request("GET", "/api/openapi.json", undefined, false); }
}
/* ─── Top-level client ─────────────────────────────────────────────── */
export class ShippifiedClient {
    orders;
    bots;
    emailSources;
    subscriptions;
    templates;
    shares;
    apiKeys;
    account;
    webhookLogs;
    webhookSubscriptions;
    billing;
    public;
    t;
    constructor(options = {}) {
        const baseUrl = (options.baseUrl ?? "https://shippified.net").replace(/\/$/, "");
        const fetchImpl = options.fetch ?? globalThis.fetch;
        if (typeof fetchImpl !== "function") {
            throw new Error("ShippifiedClient: no global fetch available — pass `fetch` in options (Node <18).");
        }
        this.t = new TransportImpl(baseUrl, options.token, fetchImpl);
        this.orders = new OrdersClient(this.t);
        this.bots = new BotsClient(this.t);
        this.emailSources = new EmailSourcesClient(this.t);
        this.subscriptions = new SubscriptionsClient(this.t);
        this.templates = new TemplatesClient(this.t);
        this.shares = new SharesClient(this.t);
        this.apiKeys = new ApiKeysClient(this.t);
        this.account = new AccountClient(this.t);
        this.webhookLogs = new WebhookLogsClient(this.t);
        this.webhookSubscriptions = new WebhookSubscriptionsClient(this.t);
        this.billing = new BillingClient(this.t);
        this.public = new PublicClient(this.t);
    }
    /* ── Legacy top-level methods (kept for the existing MCP) ── */
    getState() { return this.t.request("GET", "/api/state"); }
    getLandingStats() { return this.public.getLandingStats(); }
    getPublicProfile(slug) { return this.public.getProfile(slug); }
    async listOrders() {
        // Walk the paginated list. Used by older MCP tools that expect an array.
        const out = [];
        let offset = 0;
        while (true) {
            const page = await this.orders.list({ offset, limit: 200 });
            out.push(...page.items);
            if (!page.hasMore)
                return out;
            offset += page.limit;
        }
    }
    async listBots() {
        // Walk every page — the endpoint defaults to 50 per page.
        const bots = [];
        let offset = 0;
        while (true) {
            const page = await this.bots.list({ offset, limit: 200 });
            bots.push(...page.items);
            if (!page.hasMore)
                return { bots };
            offset += page.limit;
        }
    }
    createBot(body) {
        return this.bots.create(body);
    }
    createShare(body) {
        return this.shares.create(body);
    }
}
/* ─── Webhook receiver helpers ──────────────────────────────────────
 *
 * Implementations that receive Shippified webhook deliveries need to verify
 * the X-Shippified-Signature header. We expose the verification helper
 * here so any TS/JS receiver can use it directly without re-implementing
 * the HMAC dance.
 *
 * The signature is HMAC-SHA256(raw_request_body, subscription.secret),
 * hex-encoded, prefixed with "sha256=".
 *
 * Constant-time comparison via a small loop — we don't ship Node's crypto
 * import here because the SDK targets browsers + workers as well.
 */
export async function verifyShippifiedSignature(opts) {
    const c = opts.crypto ?? globalThis.crypto;
    if (!c?.subtle)
        throw new Error("verifyShippifiedSignature: WebCrypto unavailable. Pass crypto: webcrypto from node:crypto.");
    const expected = await hmacHex(c, opts.secret, opts.rawBody);
    const given = opts.header.replace(/^sha256=/, "");
    return constantTimeEqual(expected, given);
}
async function hmacHex(c, secret, body) {
    const key = await c.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await c.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function constantTimeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}
