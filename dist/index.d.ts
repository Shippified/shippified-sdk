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
export interface ShippifiedClientOptions {
    /** Base URL of your Shippified instance. Default: https://shippified.net */
    baseUrl?: string;
    /** Bearer token — either an API key (`sk_…`) or a session token. */
    token?: string;
    /** Custom fetch impl (e.g. node-fetch shim). Defaults to globalThis.fetch. */
    fetch?: typeof globalThis.fetch;
}
export declare class ShippifiedApiError extends Error {
    readonly status: number;
    readonly body: unknown;
    constructor(status: number, body: unknown, message: string);
}
/** Derived by the server from parser + carrier signals; not user-settable.
 *  - "ordered"   placed, no tracking yet
 *  - "shipped"   tracking number known, not delivered
 *  - "delivered" carrier or email reported delivery
 *  - "canceled"  retailer/bot reported a cancellation
 *  - "issue"     the parser couldn't identify enough to be useful */
export type OrderStatus = "ordered" | "canceled" | "shipped" | "delivered" | "issue";
export declare const ORDER_STATUSES: readonly OrderStatus[];
export type OrderEventType = "order_placed" | "order_shipped" | "order_update" | "order_delivered" | "order_canceled" | "unknown";
export declare const ORDER_EVENT_TYPES: readonly OrderEventType[];
/** Built-in retailer keys. Anything else is stored as "unknown". */
export type StoreKey = "target" | "walmart" | "amazon" | "bestbuy" | "unknown";
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
    /** Intake channel of the most recent update. */
    source: OrderSource;
    /** Every channel that has surfaced this order. */
    sources: OrderSource[];
    botId?: string;
    botName?: string;
    botAvatar?: string;
    emailSourceId?: string;
    templateId?: string;
    templateName?: string;
    eventType: OrderEventType;
    parser: string;
    store: StoreKey;
    storeLabel: string;
    customerName?: string;
    orderNumber?: string;
    itemSummary: string;
    productUrl?: string;
    imageUrl?: string;
    total?: string;
    price?: string;
    eventTime?: string;
    sku?: string;
    size?: string;
    /** Units in this order; absent when the parser couldn't extract one
     *  (treat as 1). */
    quantity?: number;
    trackingNumber?: string;
    carrier?: string;
    /** ISO YYYY-MM-DD, set by carrier tracking. */
    estimatedDelivery?: string;
    /** ISO YYYY-MM-DD, set when the carrier reports delivery. Read-only. */
    actualDelivery?: string;
    shippingAddress?: PostalAddress;
    billingAddress?: PostalAddress;
    weightGrams?: number;
    dimensionsCm?: {
        length: number;
        width: number;
        height: number;
    };
    signedBy?: string;
    serviceLevel?: string;
    salePriceCents?: number;
    costCents?: number;
    custom?: Record<string, string>;
    status: OrderStatus;
    receivedAt: string;
    /** When Shippified first created the order (counts toward the monthly
     *  limit). Missing on orders created before this field existed. */
    createdAt?: string;
    updatedAt?: string;
    rawText: string;
    intakeIds?: string[];
    /** Fields the user filled in by hand; re-parsing never overwrites them. */
    userEdited?: string[];
    [extra: string]: unknown;
}
/** What PATCH /api/orders/:id actually honors.
 *
 *  The server uses a fill-missing-only model: every field except
 *  `salePriceCents` is written only when the order doesn't already have a
 *  value (parser-extracted values can't be overwritten). `itemSummary` is
 *  only accepted when the current summary is "Unparsed order". Anything
 *  else in the body (status, actualDelivery, ...) is silently ignored:
 *  status is derived, and setting a tracking number on an "ordered" order
 *  promotes it to "shipped". */
export interface OrderPatch {
    /** Always writable. Pass null to clear. */
    salePriceCents?: number | null;
    costCents?: number;
    /** ISO YYYY-MM-DD. */
    estimatedDelivery?: string;
    trackingNumber?: string;
    carrier?: string;
    orderNumber?: string;
    itemSummary?: string;
    quantity?: number;
}
export interface ReparseSummary {
    /** Orders rebuilt from their stored messages. */
    reparsed: number;
    /** Orders whose parsed content changed. */
    changed: number;
    /** Orders folded into another order with the same order number. */
    merged: number;
    /** Orders removed because none of their messages are order mail. */
    removed: number;
    /** Orders with no stored source messages (left untouched). */
    skipped: number;
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
    type?: "monitor" | "dropship" | "generic";
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
    imapConfig?: {
        host: string;
        port: number;
        tls: boolean;
        username: string;
        lastSeenUid?: number;
    };
    googleConfig?: {
        gmailAddress: string;
        lastHistoryId?: string;
    };
    microsoftConfig?: {
        mail: string;
        deltaToken?: string;
    };
    forwardingConfig?: {
        slug: string;
        inboundAddress: string;
        pendingVerification?: {
            provider: "gmail";
            code?: string;
            link?: string;
            requestedBy?: string;
            receivedAt: string;
        };
    };
    /** True while a mailbox rebuild is running for this source. */
    rebuilding?: boolean;
    /** Outcome of the last rebuild (see `emailSources.rebuild`). */
    lastRebuild?: {
        startedAt: string;
        finishedAt?: string;
        since: string;
        removed?: number;
        ingested?: number;
        duplicates?: number;
        ignored?: number;
        /** Messages skipped because you deleted their order by hand. */
        dismissed?: number;
        /** "interrupted" when the server restarted mid-rebuild. */
        status?: "running" | "done" | "failed" | "interrupted";
        /** One-line summary of the run. */
        message?: string;
        error?: string;
    };
    lastPolledAt?: string;
    lastError?: string;
}
export interface EmailPollResult {
    ingested: number;
    duplicates: number;
    ignored: number;
    error?: string;
    /** The source after the poll (updated lastPolledAt / status). */
    source?: EmailSource;
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
export interface ShareCardTheme {
    id: string;
    c1: string;
    c2: string;
    c3: string;
    buttonColor: string;
    backgroundImage?: string;
}
export interface ShareCard {
    slug: string;
    userId: string;
    displayName: string;
    createdAt: string;
    expiresAt?: string;
    timeframe: ShareTimeframe;
    windowLabel: string;
    include: {
        stats: boolean;
        checkouts: boolean;
    };
    theme: ShareCardTheme;
    /** Spend and delivery figures are left out when the card was created
     *  without Stats (`include.stats === false`). */
    snapshot: {
        totalSpendCents?: number;
        orderCount: number;
        unitCount: number;
        deliveredCount?: number;
        fulfillmentPct?: number;
        biggestDay?: {
            date: string;
            count: number;
        };
        checkouts: Array<{
            name: string;
            store: string;
            priceCents: number;
            quantity: number;
            date: string;
            imageUrl?: string;
        }>;
    };
}
/** What an API key may do. `read` keys may only make GET requests;
 *  `write` keys may also create / update / delete (including webhook
 *  subscriptions). A request outside the key's scope throws
 *  `ShippifiedApiError` with status 403. No API key can create or revoke
 *  API keys, export or delete the account — those need a session token. */
export type ApiKeyScope = "read" | "write";
export interface ApiKey {
    id: string;
    name: string;
    prefix: string;
    /** Keys minted before scopes existed report `"write"`. */
    scope: ApiKeyScope;
    createdAt: string;
    lastUsedAt?: string;
}
export interface WebhookLog {
    id: string;
    userId: string;
    channel: "discord" | "email";
    botId?: string;
    botName?: string;
    emailSourceId?: string;
    /** Raw payload (capped at 20KB). */
    rawPayload: string;
    parser: string;
    /** `skipped`: from an order you deleted by hand. `test`: a test post
     *  (`x-shippified-test: 1`) that created nothing. */
    outcome: "created" | "merged" | "review" | "rejected" | "skipped" | "test";
    parsedOrderId?: string;
    error?: string;
    receivedAt: string;
}
export type WebhookEventType = "order.created" | "order.merged" | "order.shipped" | "order.delivered" | "order.updated" | "tracking.refreshed" | "share.created";
export interface WebhookSubscription {
    id: string;
    userId: string;
    url: string;
    /** Only present when a subscription is created or its secret is
     *  rotated — capture it then. The server keeps it encrypted to sign
     *  deliveries and never returns it again. */
    secret?: string;
    /** Created before secrets were stored: deliveries are held until you
     *  rotate the secret. */
    needsSecretRotation?: boolean;
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
    publicStats: boolean;
    generatedAt: string;
    /** null when the workspace keeps its stats private. */
    level: {
        level: number;
        name: string;
        threshold: number;
        nextThreshold: number | null;
        progressInTier: number;
        toNext: number;
    } | null;
    counts: {
        lifetime: number;
        week: number;
        month: number;
    };
    rank: {
        position: number | null;
        of: number;
    };
    daily30: number[];
    retailers: Array<{
        name: string;
        count: number;
    }>;
}
export interface OrderSummary {
    total: number;
    units: number;
    /** shipped + delivered. */
    tracking: number;
    /** status "issue". */
    review: number;
    /** status "delivered". */
    forwarded: number;
    withTracking: number;
}
export interface AppState {
    user: {
        id: string;
        username: string;
        email: string;
        displayName: string;
        createdAt: string;
        publicProfile: boolean;
        publicStats: boolean;
        webhookHandle: string;
        timezone: string;
        plan: "free" | "pro";
        subscriptionStatus?: string;
        subscriptionPeriodEnd?: string;
        subscriptionPriceId?: string;
        emailVerified: boolean;
        [k: string]: unknown;
    };
    settings: Record<string, unknown>;
    bots: Array<Bot & {
        stats: OrderSummary;
        recentOrders: Order[];
    }>;
    emailSources: Array<EmailSource & {
        stats: OrderSummary;
        recentOrders: Order[];
    }>;
    orders: Order[];
    analytics: OrderSummary & {
        stores: Record<string, number>;
        sources: Record<string, number>;
    };
    templates: {
        webhookTemplates: unknown[];
        emailTemplates: unknown[];
        customTemplates: CustomTemplate[];
    };
    subscriptions: Subscription[];
    [k: string]: unknown;
}
export interface HealthStatus {
    ok: boolean;
    uptimeMs: number;
    version: string;
    node: string;
    /** Postgres: `{ mode, ok, latencyMs }` or `{ mode, ok, error }`.
     *  Snapshot (dev): `{ mode, ok, ageMs }`. */
    persistence: {
        mode: "postgres" | "snapshot";
        ok: boolean;
        latencyMs?: number;
        ageMs?: number | null;
        error?: string;
    };
    counts: {
        users: number;
        orders: number;
    };
}
export type CustomTemplateSource = "webhook" | "email";
export type CustomTemplateSelectorType = "json_path" | "field_name" | "regex";
export type NormalizedOrderField = "store" | "orderNumber" | "customerName" | "itemSummary" | "productUrl" | "imageUrl" | "total" | "price" | "eventTime" | "sku" | "size" | "quantity" | "trackingNumber" | "carrier" | "eventType" | "custom";
export interface CustomTemplateMapping {
    target: NormalizedOrderField;
    /** Required when target is "custom". */
    customKey?: string;
    selectorType: CustomTemplateSelectorType;
    selector: string;
    sampleValue?: string;
}
export type MatchRuleOp = "equals" | "contains" | "regex" | "exists";
export type MatchRuleScope = "auto" | "header" | "body";
export interface MatchRule {
    /** Optional on input; the server mints one. */
    id?: string;
    selectorType: CustomTemplateSelectorType;
    selector: string;
    op: MatchRuleOp;
    value?: string;
    scope?: MatchRuleScope;
    caseSensitive?: boolean;
}
export interface CustomTemplate {
    id: string;
    userId: string;
    source: CustomTemplateSource;
    name: string;
    eventType: OrderEventType;
    store?: StoreKey;
    sample: string;
    mappings: CustomTemplateMapping[];
    matchRules?: Array<MatchRule & {
        id: string;
    }>;
    createdAt: string;
}
/** Body for creating/updating a custom template.
 *
 *  Create: omitted fields default (source "webhook", eventType "unknown",
 *  no store, no mappings/rules). Update (PATCH) is partial — fields you
 *  omit keep their current values, and `source` never changes after
 *  creation. Invalid regexes return 400; unknown targets/ops/selector
 *  types are silently dropped. */
export interface CustomTemplateInput {
    source?: CustomTemplateSource;
    name?: string;
    eventType?: OrderEventType;
    store?: StoreKey;
    sample?: string;
    mappings?: CustomTemplateMapping[];
    matchRules?: MatchRule[];
}
export interface TemplateDetectResult {
    /** The shape (built-in or custom template) that won, or null. */
    shape: {
        id: string;
        name: string;
        origin: "builtin" | "custom";
    } | null;
    /** True when the sample doesn't look like order mail and would be dropped. */
    ignored: boolean;
    order: {
        store: StoreKey;
        eventType: OrderEventType;
        status: OrderStatus;
        orderNumber?: string;
        itemSummary: string;
        total?: string;
        quantity?: number;
        trackingNumber?: string;
        carrier?: string;
        customerName?: string;
        imageUrl?: string;
        custom?: Record<string, string>;
    };
}
export interface LandingStats {
    generatedAt: string;
    totalValueCents: number;
    ordersTracked: number;
    platformsSupported: number;
}
interface Transport {
    baseUrl: string;
    token?: string;
    fetchImpl: typeof globalThis.fetch;
    request<T>(method: string, path: string, body?: unknown, auth?: boolean): Promise<T>;
}
export interface OrderListFilters {
    limit?: number;
    offset?: number;
    status?: OrderStatus;
    store?: string;
    source?: OrderSource;
    carrier?: string;
    hasTracking?: boolean;
    /** ISO yyyy-mm-dd, inclusive. */
    from?: string;
    /** ISO yyyy-mm-dd, inclusive. */
    to?: string;
    q?: string;
}
export interface OrderCreateInput {
    /** Required — the only field the server insists on. */
    itemSummary: string;
    /** Unrecognized values are stored as "unknown". */
    store?: StoreKey;
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
    /** Defaults to "order_shipped" with a tracking number, else
     *  "order_placed". Drives the derived status. */
    eventType?: OrderEventType;
}
declare class OrdersClient {
    private readonly t;
    constructor(t: Transport);
    list(filters?: OrderListFilters): Promise<Paginated<Order>>;
    get(id: string): Promise<Order>;
    /** Manual order import — hand-enter an order from anywhere.
     *  If `trackingNumber` is set and the carrier is one we support
     *  (UPS / FedEx / DHL / DHL Express), the background tracker
     *  starts refreshing it automatically. Otherwise updates are
     *  manual. */
    create(input: OrderCreateInput): Promise<{
        order: Order;
        merged: boolean;
    }>;
    /** Fill-missing-only edit; see `OrderPatch` for exactly what the
     *  server honors. Status and actualDelivery cannot be set. */
    patch(id: string, patch: OrderPatch): Promise<Order>;
    delete(id: string): Promise<{
        ok: true;
    }>;
    getTracking(id: string): Promise<unknown>;
    refreshTracking(id: string): Promise<unknown>;
    /** Re-fetch carrier state for up to 50 "shipped" orders with tracking numbers. */
    /** Which carriers have live tracking enabled on this instance. Orders on
     *  other carriers move forward from retailer emails instead. */
    carrierStatus(): Promise<{
        carriers: Array<{
            key: string;
            label: string;
            configured: boolean;
            note?: string;
        }>;
    }>;
    syncTracking(): Promise<{
        total: number;
        refreshed: number;
        failed: number;
        delivered: number;
    }>;
    /** Re-run parsing on every order that has stored source messages,
     *  using the current built-in shapes and your custom templates. Values
     *  you entered by hand and carrier data are kept. Synchronous: the
     *  response is the summary. */
    reparse(): Promise<ReparseSummary>;
}
declare class BotsClient {
    private readonly t;
    constructor(t: Transport);
    list(opts?: {
        limit?: number;
        offset?: number;
    }): Promise<Paginated<Bot>>;
    get(id: string): Promise<Bot>;
    create(body: {
        name: string;
        slug?: string;
        templateId?: string;
        avatar?: string;
        templateHint?: string;
        outputWebhook?: string;
        samplePayload?: string;
        type?: Bot["type"];
    }): Promise<Bot>;
    update(id: string, patch: Partial<Bot>): Promise<Bot>;
    delete(id: string): Promise<{
        ok: true;
    }>;
}
declare class EmailSourcesClient {
    private readonly t;
    constructor(t: Transport);
    list(opts?: {
        limit?: number;
        offset?: number;
    }): Promise<Paginated<EmailSource>>;
    get(id: string): Promise<EmailSource>;
    create(body: Partial<EmailSource> & {
        provider: EmailProvider;
        imapConfig?: {
            host: string;
            port: number;
            tls: boolean;
            username: string;
            password: string;
        };
    }): Promise<EmailSource>;
    update(id: string, patch: Partial<EmailSource>): Promise<EmailSource>;
    delete(id: string): Promise<{
        ok: true;
    }>;
    /** On-demand poll (IMAP / Google / Microsoft). Forwarding sources
     *  return `ingested: 0` with an explanatory `error`: nothing to poll. */
    poll(id: string): Promise<EmailPollResult>;
    /** Re-read the mailbox from `sinceDays` ago (1-365, default 30) through
     *  the current parser, replacing the orders this source produced in that
     *  window (only orders that came purely from this source's email and
     *  were never user-edited are deleted and re-created). Returns (202) as soon as it starts; the rebuild runs in the
     *  background, so watch `source.rebuilding` / `source.lastRebuild`.
     *  400 for forwarding sources, 409 if one is already running. */
    rebuild(id: string, opts?: {
        sinceDays?: number;
    }): Promise<{
        started: true;
        since: string;
    }>;
    /** Import one email by hand. `raw` may be full RFC822 source, HTML or
     *  plain text; `from` is only a fallback sender for pasted bodies with no
     *  headers (checked against the source's allowed senders). Responds with
     *  the full workspace state plus `order` / `merged` (and `duplicate` when
     *  the Message-ID was already imported). 403 sender blocked, 404 unknown
     *  source, 422 not readable as an order, 429 plan limit. */
    import(body: {
        raw: string;
        emailSourceId: string;
        from?: string;
    }): Promise<AppState & {
        order: Order;
        merged: boolean;
        duplicate?: boolean;
    }>;
}
declare class SubscriptionsClient {
    private readonly t;
    constructor(t: Transport);
    list(opts?: {
        limit?: number;
        offset?: number;
    }): Promise<Paginated<Subscription>>;
    get(id: string): Promise<Subscription>;
    create(body: Partial<Subscription>): Promise<Subscription>;
    update(id: string, patch: Partial<Subscription>): Promise<Subscription>;
    delete(id: string): Promise<{
        ok: true;
    }>;
}
declare class TemplatesClient {
    private readonly t;
    constructor(t: Transport);
    /** Built-in webhook + email templates. Custom templates are not
     *  included; use `listCustom()`. */
    list(): Promise<{
        webhookTemplates: unknown[];
        emailTemplates: unknown[];
    }>;
    /** Your custom templates, newest first — the order they're tried in. */
    listCustom(): Promise<CustomTemplate[]>;
    /** Extract each mapping's value from a sample, using the live engine.
     *  Unresolved mappings come back as "". */
    preview(body: {
        source: CustomTemplateSource;
        sample: string;
        mappings: CustomTemplateMapping[];
    }): Promise<{
        extracted: Record<string, string>;
    }>;
    /** Pass/fail for each detection rule against a sample. */
    matchPreview(body: {
        source: CustomTemplateSource;
        sample: string;
        rules: MatchRule[];
    }): Promise<{
        allPassed: boolean;
        results: Array<{
            rule: MatchRule & {
                id: string;
            };
            passed: boolean;
            resolved?: string;
        }>;
    }>;
    /** Full production parse of a sample: which template wins and the
     *  order it would create. Pass `draft` to test an unsaved template (or
     *  unsaved edits to an existing one via `draft.id`) where saving would
     *  put it. Read-only; nothing is stored. */
    detect(body: {
        source: CustomTemplateSource;
        sample: string;
        draft?: CustomTemplateInput & {
            id?: string;
        };
    }): Promise<TemplateDetectResult>;
    createCustom(body: CustomTemplateInput): Promise<CustomTemplate>;
    /** Partial update: fields you omit keep their current values. A
     *  template's `source` can't change after creation. */
    updateCustom(id: string, body: Partial<CustomTemplateInput>): Promise<CustomTemplate>;
    deleteCustom(id: string): Promise<{
        ok: true;
    }>;
}
declare class SharesClient {
    private readonly t;
    constructor(t: Transport);
    list(): Promise<{
        shares: ShareCard[];
    }>;
    create(body: {
        timeframe?: ShareTimeframe;
        include?: {
            stats?: boolean;
            checkouts?: boolean;
        };
        theme?: ShareCardTheme;
        /** ISO timestamp; omit for a share that never expires. */
        expiresAt?: string;
    }): Promise<{
        share: ShareCard;
    }>;
    delete(slug: string): Promise<{
        ok: true;
    }>;
    /** Public URL of the share's OG image. No request — pure URL math. */
    imageUrl(slug: string): string;
    pageUrl(slug: string): string;
}
declare class ApiKeysClient {
    private readonly t;
    constructor(t: Transport);
    list(): Promise<{
        items: ApiKey[];
    }>;
    /** Mint a key. Needs a session token — called with an API key it
     *  throws a 403 (API keys can't manage API keys). `scope` defaults to
     *  `"write"` server-side. */
    create(name: string, opts?: {
        scope?: ApiKeyScope;
    }): Promise<{
        key: string;
        record: ApiKey;
    }>;
    /** Revoke a key. Needs a session token (403 with an API key). */
    delete(id: string): Promise<{
        ok: true;
    }>;
}
declare class AccountClient {
    private readonly t;
    constructor(t: Transport);
    setUsername(username: string): Promise<{
        username: string;
        state: AppState;
    }>;
    checkAvailability(candidate: string): Promise<{
        available: boolean;
        reason?: string;
    }>;
    setDisplayName(displayName: string): Promise<{
        displayName: string;
        state: AppState;
    }>;
    setVisibility(publicProfile: boolean): Promise<{
        publicProfile: boolean;
        state: AppState;
    }>;
    /** Opt in/out of showing your counts on the leaderboard and public profile. */
    setPublicStats(publicStats: boolean): Promise<{
        publicStats: boolean;
        state: AppState;
    }>;
    /** Set the user's IANA timezone (e.g. "America/New_York"). Drives
     *  the free-plan quota window. */
    setTimezone(timezone: string): Promise<{
        timezone: string;
    }>;
}
export interface BillingUsage {
    ok: boolean;
    plan: "free" | "pro";
    used: number;
    cap: number | null;
    resetsAt: string | null;
    windowStart: string;
    /** False when the instance runs in free-for-everyone mode. */
    billingEnabled: boolean;
    stripeConfigured: boolean;
    prices: {
        monthly: "monthly" | null;
        yearly: "yearly" | null;
    };
    subscriptionStatus?: string;
    subscriptionPeriodEnd?: string;
    subscriptionPriceId?: string;
}
declare class BillingClient {
    private readonly t;
    constructor(t: Transport);
    /** Current month usage + cap + reset date. */
    getUsage(): Promise<BillingUsage>;
    /** Create a Stripe Checkout session for the chosen plan. The
     *  returned URL is hosted by Stripe — redirect the user to it. */
    createCheckout(plan: "monthly" | "yearly", opts?: {
        successUrl?: string;
        cancelUrl?: string;
    }): Promise<{
        url: string;
        sessionId: string;
    }>;
    /** Create a Stripe Customer Portal session for managing the
     *  current subscription (change card, plan, cancel). */
    createPortal(returnUrl?: string): Promise<{
        url: string;
    }>;
}
declare class WebhookLogsClient {
    private readonly t;
    constructor(t: Transport);
    /** Newest first. `limit` 1-500, default 100. */
    list(opts?: {
        limit?: number;
    }): Promise<{
        logs: WebhookLog[];
    }>;
    clear(): Promise<{
        removed: number;
    }>;
}
export interface WebhookSubscriptionInput {
    url: string;
    eventTypes: WebhookEventType[];
    active?: boolean;
}
declare class WebhookSubscriptionsClient {
    private readonly t;
    constructor(t: Transport);
    list(opts?: {
        limit?: number;
        offset?: number;
    }): Promise<Paginated<WebhookSubscription>>;
    get(id: string): Promise<WebhookSubscription>;
    create(body: WebhookSubscriptionInput): Promise<WebhookSubscription>;
    update(id: string, patch: Partial<WebhookSubscriptionInput>): Promise<WebhookSubscription>;
    delete(id: string): Promise<{
        ok: true;
    }>;
    /** Fires a synthetic event of the chosen type — useful for verifying the
     *  receiver works end-to-end during setup. */
    test(id: string, eventType: WebhookEventType): Promise<{
        ok: boolean;
        status?: number;
        error?: string;
    }>;
    /** Mint a new signing secret. The raw secret is in the response once;
     *  receivers on the old secret fail verification immediately. */
    rotateSecret(id: string): Promise<WebhookSubscription & {
        secret: string;
    }>;
}
declare class PublicClient {
    private readonly t;
    constructor(t: Transport);
    getLandingStats(): Promise<LandingStats>;
    getProfile(usernameOrUserId: string): Promise<PublicProfile>;
    /** The server answers 503 when persistence is unhealthy; that is
     *  thrown as ShippifiedApiError whose `body` is the HealthStatus. */
    getHealth(): Promise<HealthStatus>;
    getOpenApi(): Promise<Record<string, unknown>>;
}
export declare class ShippifiedClient {
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
    private readonly t;
    constructor(options?: ShippifiedClientOptions);
    getState(): Promise<AppState>;
    getLandingStats(): Promise<LandingStats>;
    getPublicProfile(slug: string): Promise<PublicProfile>;
    listOrders(): Promise<Order[]>;
    listBots(): Promise<{
        bots: Bot[];
    }>;
    createBot(body: {
        name: string;
        templateId?: string;
        avatar?: string;
    }): Promise<Bot>;
    createShare(body: Parameters<SharesClient["create"]>[0]): Promise<{
        share: ShareCard;
    }>;
}
export declare function verifyShippifiedSignature(opts: {
    /** The exact raw request body string. Don't re-JSON.stringify — use the
     *  raw bytes from your HTTP framework. */
    rawBody: string;
    /** The value of the `X-Shippified-Signature` header. */
    header: string;
    /** Your subscription's secret. */
    secret: string;
    /** Optional crypto override for environments without WebCrypto. */
    crypto?: Crypto;
}): Promise<boolean>;
export {};
