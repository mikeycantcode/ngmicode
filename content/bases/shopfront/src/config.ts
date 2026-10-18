// Global tunables. Prefer passing these through constructors in new code;
// several modules still import them directly.

export const DEFAULT_REGION = "US-CA";

/** How long a checkout holds stock before the reservation expires. */
export const RESERVATION_TTL_MS = 15 * 60_000;

/** Pending (unpaid) orders older than this are cancelled by OrderService.expirePending(). */
export const PENDING_ORDER_TTL_MS = 15 * 60_000;

export const LOW_STOCK_THRESHOLD = 5;

export const MAX_LINE_QUANTITY = 99;

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** Session lifetime for login tokens. */
export const SESSION_TTL_MS = 24 * 60 * 60_000;

// Not wired up yet — returns are handled manually by support (see README "Roadmap").
export const RETURN_WINDOW_DAYS = 30;
