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
 *   const orders = await shippified.orders.list({ status: "tracking", limit: 50 });
 *   const fresh = await shippified.orders.refreshTracking(order.id);
 *   await shippified.webhookSubscriptions.create({
 *     url: "https://your-app.com/shippified-webhook",
 *     eventTypes: ["order.created", "order.shipped"],
 *   });
 *
 * Resource sub-clients:
 *   .orders, .bots, .emailSources, .templates, .subscriptions,
 *   .shares, .embedSamples, .account, .apiKeys, .webhookLogs,
 *   .webhookSubscriptions, .tracking, .public
 *
 * Errors throw `ShippifiedApiError` with .status and .body.
 */

export interface ShippifiedClientOptions {
  /** Base URL of your Shippified instance. Default: https://shippified.net */
  baseUrl?: string;
  /** Bearer token — either an API key (`sk_…`) or a session token. */
  token?: string;
  /** Custom fetch impl (e.g. node-fetch shim). Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
}

export class ShippifiedApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ShippifiedApiError";
  }
}

/* ─── Shared types — mirror the API's wire schemas ──────────────────── */

export type OrderStatus = "needs_review" | "ready" | "tracking" | "forwarded";
export type OrderSource = "discord" | "email" | "manual";
export type EmailProvider = "imap" | "google" | "microsoft" | "forwarding";
export type EmailSourceStatus = "connected" | "needs_auth" | "paused" | "auth_failed";
export type SubscriptionFrequency = "weekly" | "monthly" | "quarterly" | "yearly";
export type ShareTimeframe = "7d" | "30d" | "90d" | "ytd" | "all";

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface PostalAddress {
  name?: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface Order {
  id: string;
  userId: string;
  source: OrderSource;
  store: string;
  storeLabel: string;
  itemSummary: string;
  orderNumber?: string;
  total?: string;
  salePriceCents?: number;
  costCents?: number;
  /** Units in this order; defaults to 1 when the parser couldn't
   *  extract a quantity. */
  quantity?: number;
  trackingNumber?: string;
  carrier?: string;
  shippingAddress?: PostalAddress;
  estimatedDelivery?: string;
  actualDelivery?: string;
  status: OrderStatus;
  receivedAt: string;
  [extra: string]: unknown;
}

export interface Bot {
  id: string;
  userId: string;
  slug: string;
  name: string;
  avatar: string;
  templateId?: string;
  templateHint: string;
  samplePayload?: string;
  outputWebhook: string;
  createdAt: string;
}

export interface EmailSource {
  id: string;
  userId: string;
  provider: EmailProvider;
  label: string;
  address: string;
  status: EmailSourceStatus;
  templateIds: string[];
  allowedSenders: string[];
  imapConfig?: { host: string; port: number; tls: boolean; username: string; lastSeenUid?: number };
  googleConfig?: { gmailAddress: string; lastHistoryId?: string };
  microsoftConfig?: { mail: string; deltaToken?: string };
  forwardingConfig?: { slug: string; inboundAddress: string };
  lastPolledAt?: string;
  lastError?: string;
}

export interface Subscription {
  id: string;
  userId: string;
  name: string;
  costCents: number;
  currency: string;
  frequency: SubscriptionFrequency;
  startDate: string;
  endDate?: string;
  category: string;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export interface ShareCard {
  slug: string;
  userId: string;
  displayName: string;
  createdAt: string;
  timeframe: ShareTimeframe;
  include: { stats: boolean; checkouts: boolean };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface WebhookLog {
  id: string;
  channel: "discord" | "email";
  parser: string;
  outcome: "created" | "merged" | "review" | "rejected";
  parsedOrderId?: string;
  error?: string;
  receivedAt: string;
}

export type WebhookEventType =
  | "order.created"
  | "order.merged"
  | "order.shipped"
  | "order.delivered"
  | "order.updated"
  | "tracking.refreshed"
  | "share.created";

export interface WebhookSubscription {
  id: string;
  userId: string;
  url: string;
  /** Only present in the response to POST /api/webhook-subscriptions —
   *  the dashboard / SDK must capture and store it client-side; we only
   *  store a hash server-side. */
  secret?: string;
  prefix: string;
  eventTypes: WebhookEventType[];
  active: boolean;
  failureCount: number;
  lastFiredAt?: string;
  lastError?: string;
  createdAt: string;
}

export interface PublicProfile {
  userId: string;
  username: string;
  displayName: string;
  memberSince: string;
  publicProfile: boolean;
  level: { level: number; name: string; threshold: number; nextThreshold: number | null; progressInTier: number; toNext: number };
  counts: { lifetime: number; week: number; month: number };
  rank: { position: number | null; of: number };
  daily30: number[];
  retailers: Array<{ name: string; count: number }>;
}

export interface AppState {
  user: { id: string; username: string; email: string; displayName: string; createdAt: string; publicProfile: boolean };
  bots: Bot[];
  orders: Order[];
  analytics: { total: number; tracking: number; review: number; forwarded: number; withTracking: number };
  [k: string]: unknown;
}

export interface LandingStats {
  generatedAt: string;
  totalValueCents: number;
  ordersTracked: number;
  platformsSupported: number;
}

/* ─── Core client + transport ──────────────────────────────────────── */

interface Transport {
  baseUrl: string;
  token?: string;
  fetchImpl: typeof globalThis.fetch;
  request<T>(method: string, path: string, body?: unknown, auth?: boolean): Promise<T>;
}

class TransportImpl implements Transport {
  constructor(
    public baseUrl: string,
    public token: string | undefined,
    public fetchImpl: typeof globalThis.fetch,
  ) {}

  async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (auth) {
      if (!this.token) throw new Error(`ShippifiedClient: token required for ${method} ${path}`);
      headers["authorization"] = `Bearer ${this.token}`;
    }
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok) {
      const message = parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${res.status}`;
      throw new ShippifiedApiError(res.status, parsed, message);
    }
    return parsed as T;
  }
}

function qs(params: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/* ─── Resource sub-clients ─────────────────────────────────────────── */

export interface OrderListFilters {
  limit?: number;
  offset?: number;
  status?: OrderStatus;
  store?: string;
  source?: OrderSource;
  carrier?: string;
  hasTracking?: boolean;
  from?: string;
  to?: string;
  q?: string;
}

export interface OrderCreateInput {
  /** Required — the only field the server insists on. */
  itemSummary: string;
  /** One of "target" | "walmart" | "amazon" | "bestbuy" | "unknown". */
  store?: string;
  storeLabel?: string;
  orderNumber?: string;
  trackingNumber?: string;
  /** Free-form. The server auto-detects from the tracking number when omitted. */
  carrier?: string;
  total?: string;
  costCents?: number;
  salePriceCents?: number;
  quantity?: number;
  productUrl?: string;
  imageUrl?: string;
  sku?: string;
  size?: string;
  /** ISO date or datetime. Defaults to now. */
  receivedAt?: string;
  /** Tie this manual order to an inbox so its update emails get
   *  routed through that source's allowlist + dedup pipeline. */
  emailSourceId?: string;
}

class OrdersClient {
  constructor(private readonly t: Transport) {}
  list(filters: OrderListFilters = {}): Promise<Paginated<Order>> {
    return this.t.request("GET", `/api/orders${qs(filters as Record<string, unknown>)}`);
  }
  get(id: string): Promise<Order> { return this.t.request("GET", `/api/orders/${encodeURIComponent(id)}`); }
  /** Manual order import — hand-enter an order from anywhere.
   *  If `trackingNumber` is set and the carrier is one we support
   *  (UPS / FedEx / DHL / DHL Express), the background tracker
   *  starts refreshing it automatically. Otherwise updates are
   *  manual. */
  create(input: OrderCreateInput): Promise<{ order: Order; merged: boolean }> {
    return this.t.request("POST", "/api/orders", input);
  }
  patch(id: string, patch: Partial<Order>): Promise<Order> { return this.t.request("PATCH", `/api/orders/${encodeURIComponent(id)}`, patch); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/orders/${encodeURIComponent(id)}`); }
  getTracking(id: string): Promise<unknown> { return this.t.request("GET", `/api/orders/${encodeURIComponent(id)}/tracking`); }
  refreshTracking(id: string): Promise<unknown> { return this.t.request("POST", `/api/orders/${encodeURIComponent(id)}/tracking/refresh`); }
}

class BotsClient {
  constructor(private readonly t: Transport) {}
  list(opts: { limit?: number; offset?: number } = {}): Promise<Paginated<Bot>> { return this.t.request("GET", `/api/bots${qs(opts as Record<string, unknown>)}`); }
  get(id: string): Promise<Bot> { return this.t.request("GET", `/api/bots/${encodeURIComponent(id)}`); }
  create(body: { name: string; templateId?: string; avatar?: string; templateHint?: string; outputWebhook?: string; samplePayload?: string }): Promise<Bot> { return this.t.request("POST", "/api/bots", body); }
  update(id: string, patch: Partial<Bot>): Promise<Bot> { return this.t.request("PATCH", `/api/bots/${encodeURIComponent(id)}`, patch); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/bots/${encodeURIComponent(id)}`); }
}

class EmailSourcesClient {
  constructor(private readonly t: Transport) {}
  list(opts: { limit?: number; offset?: number } = {}): Promise<Paginated<EmailSource>> { return this.t.request("GET", `/api/email-sources${qs(opts as Record<string, unknown>)}`); }
  get(id: string): Promise<EmailSource> { return this.t.request("GET", `/api/email-sources/${encodeURIComponent(id)}`); }
  create(body: Partial<EmailSource> & { provider: EmailProvider; imapConfig?: { host: string; port: number; tls: boolean; username: string; password: string } }): Promise<EmailSource> { return this.t.request("POST", "/api/email-sources", body); }
  update(id: string, patch: Partial<EmailSource>): Promise<EmailSource> { return this.t.request("PATCH", `/api/email-sources/${encodeURIComponent(id)}`, patch); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/email-sources/${encodeURIComponent(id)}`); }
  poll(id: string): Promise<{ ingested: number; error?: string; source?: EmailSource }> { return this.t.request("POST", `/api/email-sources/${encodeURIComponent(id)}/poll`); }
  import(body: { raw: string; emailSourceId: string; from?: string }): Promise<unknown> { return this.t.request("POST", "/api/email/import", body); }
}

class SubscriptionsClient {
  constructor(private readonly t: Transport) {}
  list(opts: { limit?: number; offset?: number } = {}): Promise<Paginated<Subscription>> { return this.t.request("GET", `/api/subscriptions${qs(opts as Record<string, unknown>)}`); }
  get(id: string): Promise<Subscription> { return this.t.request("GET", `/api/subscriptions/${encodeURIComponent(id)}`); }
  create(body: Partial<Subscription>): Promise<Subscription> { return this.t.request("POST", "/api/subscriptions", body); }
  update(id: string, patch: Partial<Subscription>): Promise<Subscription> { return this.t.request("PATCH", `/api/subscriptions/${encodeURIComponent(id)}`, patch); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/subscriptions/${encodeURIComponent(id)}`); }
}

class TemplatesClient {
  constructor(private readonly t: Transport) {}
  list(): Promise<{ webhookTemplates: unknown[]; emailTemplates: unknown[] }> { return this.t.request("GET", "/api/templates"); }
  preview(body: { source: "webhook" | "email"; sample: string; mappings: unknown[] }): Promise<{ extracted: Record<string, string> }> { return this.t.request("POST", "/api/templates/custom/preview", body); }
  createCustom(body: unknown): Promise<unknown> { return this.t.request("POST", "/api/templates/custom", body); }
  deleteCustom(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/templates/custom/${encodeURIComponent(id)}`); }
}

class SharesClient {
  constructor(private readonly t: Transport) {}
  list(): Promise<{ shares: ShareCard[] }> { return this.t.request("GET", "/api/shares"); }
  create(body: {
    timeframe?: ShareTimeframe;
    include?: { stats?: boolean; checkouts?: boolean };
    theme?: { id: string; c1: string; c2: string; c3: string; buttonColor: string; backgroundImage?: string };
  }): Promise<{ share: ShareCard }> {
    return this.t.request("POST", "/api/shares", body);
  }
  delete(slug: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/shares/${encodeURIComponent(slug)}`); }
  /** Public URL of the share's OG image. No request — pure URL math. */
  imageUrl(slug: string): string { return `${this.t.baseUrl}/share/${encodeURIComponent(slug)}/image.png`; }
  pageUrl(slug: string): string { return `${this.t.baseUrl}/share/${encodeURIComponent(slug)}`; }
}

class ApiKeysClient {
  constructor(private readonly t: Transport) {}
  list(): Promise<{ items: ApiKey[] }> { return this.t.request("GET", "/api/account/api-keys"); }
  create(name: string): Promise<{ key: string; record: ApiKey }> { return this.t.request("POST", "/api/account/api-keys", { name }); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/account/api-keys/${encodeURIComponent(id)}`); }
}

class AccountClient {
  constructor(private readonly t: Transport) {}
  setUsername(username: string): Promise<{ username: string; state: AppState }> { return this.t.request("POST", "/api/account/username", { username }); }
  checkAvailability(candidate: string): Promise<{ available: boolean; reason?: string }> { return this.t.request("GET", `/api/account/username/available?u=${encodeURIComponent(candidate)}`, undefined, false); }
  setVisibility(publicProfile: boolean): Promise<{ publicProfile: boolean; state: AppState }> { return this.t.request("POST", "/api/account/visibility", { publicProfile }); }
  /** Set the user's IANA timezone (e.g. "America/New_York"). Drives
   *  the free-plan quota window. */
  setTimezone(timezone: string): Promise<{ timezone: string }> { return this.t.request("POST", "/api/account/timezone", { timezone }); }
}

export interface BillingUsage {
  ok: boolean;
  plan: "free" | "pro";
  used: number;
  cap: number | null;
  resetsAt: string | null;
  windowStart: string;
  stripeConfigured: boolean;
  subscriptionStatus?: string;
  subscriptionPeriodEnd?: string;
  subscriptionPriceId?: string;
}

class BillingClient {
  constructor(private readonly t: Transport) {}
  /** Current month usage + cap + reset date. */
  getUsage(): Promise<BillingUsage> { return this.t.request("GET", "/api/billing/usage"); }
  /** Create a Stripe Checkout session for the chosen plan. The
   *  returned URL is hosted by Stripe — redirect the user to it. */
  createCheckout(plan: "monthly" | "yearly", opts: { successUrl?: string; cancelUrl?: string } = {}): Promise<{ url: string; sessionId: string }> {
    return this.t.request("POST", "/api/billing/checkout", { plan, ...opts });
  }
  /** Create a Stripe Customer Portal session for managing the
   *  current subscription (change card, plan, cancel). */
  createPortal(returnUrl?: string): Promise<{ url: string }> {
    return this.t.request("POST", "/api/billing/portal", { returnUrl });
  }
}

class WebhookLogsClient {
  constructor(private readonly t: Transport) {}
  list(opts: { limit?: number } = {}): Promise<{ logs: WebhookLog[] }> { return this.t.request("GET", `/api/webhook-logs${qs(opts as Record<string, unknown>)}`); }
  clear(): Promise<{ removed: number }> { return this.t.request("DELETE", "/api/webhook-logs"); }
}

export interface WebhookSubscriptionInput {
  url: string;
  eventTypes: WebhookEventType[];
  active?: boolean;
}

class WebhookSubscriptionsClient {
  constructor(private readonly t: Transport) {}
  list(opts: { limit?: number; offset?: number } = {}): Promise<Paginated<WebhookSubscription>> { return this.t.request("GET", `/api/webhook-subscriptions${qs(opts as Record<string, unknown>)}`); }
  get(id: string): Promise<WebhookSubscription> { return this.t.request("GET", `/api/webhook-subscriptions/${encodeURIComponent(id)}`); }
  create(body: WebhookSubscriptionInput): Promise<WebhookSubscription> { return this.t.request("POST", "/api/webhook-subscriptions", body); }
  update(id: string, patch: Partial<WebhookSubscriptionInput>): Promise<WebhookSubscription> { return this.t.request("PATCH", `/api/webhook-subscriptions/${encodeURIComponent(id)}`, patch); }
  delete(id: string): Promise<{ ok: true }> { return this.t.request("DELETE", `/api/webhook-subscriptions/${encodeURIComponent(id)}`); }
  /** Fires a synthetic event of the chosen type — useful for verifying the
   *  receiver works end-to-end during setup. */
  test(id: string, eventType: WebhookEventType): Promise<{ ok: boolean; status?: number; error?: string }> {
    return this.t.request("POST", `/api/webhook-subscriptions/${encodeURIComponent(id)}/test`, { eventType });
  }
}

class PublicClient {
  constructor(private readonly t: Transport) {}
  getLandingStats(): Promise<LandingStats> { return this.t.request("GET", "/api/landing-stats", undefined, false); }
  getProfile(usernameOrUserId: string): Promise<PublicProfile> { return this.t.request("GET", `/api/profile/${encodeURIComponent(usernameOrUserId)}`, undefined, false); }
  getHealth(): Promise<{ ok: boolean; uptimeMs: number; version: string; node: string; snapshot: { ageMs: number | null; ok: boolean }; counts: { users: number; orders: number } }> {
    return this.t.request("GET", "/api/healthz", undefined, false);
  }
  getOpenApi(): Promise<Record<string, unknown>> { return this.t.request("GET", "/api/openapi.json", undefined, false); }
}

/* ─── Top-level client ─────────────────────────────────────────────── */

export class ShippifiedClient {
  readonly orders: OrdersClient;
  readonly bots: BotsClient;
  readonly emailSources: EmailSourcesClient;
  readonly subscriptions: SubscriptionsClient;
  readonly templates: TemplatesClient;
  readonly shares: SharesClient;
  readonly apiKeys: ApiKeysClient;
  readonly account: AccountClient;
  readonly webhookLogs: WebhookLogsClient;
  readonly webhookSubscriptions: WebhookSubscriptionsClient;
  readonly billing: BillingClient;
  readonly public: PublicClient;

  private readonly t: Transport;

  constructor(options: ShippifiedClientOptions = {}) {
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
  getState(): Promise<AppState> { return this.t.request("GET", "/api/state"); }
  getLandingStats(): Promise<LandingStats> { return this.public.getLandingStats(); }
  getPublicProfile(slug: string): Promise<PublicProfile> { return this.public.getProfile(slug); }
  async listOrders(): Promise<Order[]> {
    // Walk the paginated list. Used by older MCP tools that expect an array.
    const out: Order[] = [];
    let offset = 0;
    while (true) {
      const page = await this.orders.list({ offset, limit: 200 });
      out.push(...page.items);
      if (!page.hasMore) return out;
      offset += page.limit;
    }
  }
  listBots(): Promise<{ bots: Bot[] }> {
    return this.bots.list().then((p) => ({ bots: p.items }));
  }
  createBot(body: { name: string; templateId?: string; avatar?: string }): Promise<Bot> {
    return this.bots.create(body);
  }
  createShare(body: Parameters<SharesClient["create"]>[0]): Promise<{ share: ShareCard }> {
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

export async function verifyShippifiedSignature(opts: {
  /** The exact raw request body string. Don't re-JSON.stringify — use the
   *  raw bytes from your HTTP framework. */
  rawBody: string;
  /** The value of the `X-Shippified-Signature` header. */
  header: string;
  /** Your subscription's secret. */
  secret: string;
  /** Optional crypto override for environments without WebCrypto. */
  crypto?: Crypto;
}): Promise<boolean> {
  const c = opts.crypto ?? globalThis.crypto;
  if (!c?.subtle) throw new Error("verifyShippifiedSignature: WebCrypto unavailable. Pass crypto: webcrypto from node:crypto.");
  const expected = await hmacHex(c, opts.secret, opts.rawBody);
  const given = opts.header.replace(/^sha256=/, "");
  return constantTimeEqual(expected, given);
}

async function hmacHex(c: Crypto, secret: string, body: string): Promise<string> {
  const key = await c.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
