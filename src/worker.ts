import type {
  BookingServiceLine,
  AddEmployeeInput,
  AuthSession,
  BookingLinkItem,
  BookingStatus,
  CalendarBookingCard,
  CalendarStaffColumn,
  ClientHistoryItem,
  ClientRow,
  CreatePaymentInput,
  ChangeOwnPasswordInput,
  CreateCrmBookingInput,
  CreatePublicBookingInput,
  CrmPayload,
  EmployeeRevenueItem,
  EmployeeRow,
  KpiCard,
  PaymentEntry,
  PaymentMethod,
  PaymentSummary,
  ServiceCatalogItem,
  StaffAccessRow,
  UpdateCrmCredentialsInput,
  UpdateBusinessProfileInput,
  UpdateBookingStatusInput,
  UpdateEmployeeInput,
  UpdateServiceInput,
  UpdateEmployeeSlotsInput,
  UpsertServiceInput,
} from "./types";
import type { ActorRole } from "./server/auth";
import { can, isScopedToOwnBookings, type Capability } from "./server/permissions";
import {
  clearSessionCookie,
  createSessionCookie,
  generateCrmTempPassword,
  hashCrmPassword,
  isValidCrmUsername,
  normalizeCrmUsernameBase,
  normalizeCrmUsername,
  readSession,
  verifyAgainstDecoy,
  verifyCrmPassword,
} from "./server/auth";
import { issueCaptcha, verifyCaptcha } from "./server/captcha";
import { clientIp, consumeRateLimit, LIMITS, type RateLimitRule } from "./server/rateLimit";
import { slugProblem, type SlugProblem } from "./shared/slug";
import { toStoragePhone } from "./shared/phone";
import { normalizeBrandColor, normalizeBrandTheme, parseBrandTheme, serializeBrandTheme } from "./shared/brand";
import {
  addDays,
  PAID_PLANS,
  planById,
  planCoversStaff,
  readSubscription,
  recommendPlan,
  TRIAL_DAYS,
} from "./shared/plans";
import { openShiftSlots } from "./shared/availability";
import { buildBasket, legacyServiceName, requestedServiceIds } from "./shared/basket";
import { writeBasketLines } from "./server/publicBooking";
import { BOOKING_FLOWS, normalizeBookingFlow, type BookingFlow } from "./shared/bookingFlow";
import {
  checkImageBytes,
  safeImageContentType,
  type ImageKind,
  type RejectionReason,
} from "./shared/imageFile";
import { createPublicBooking, getPublicBusiness, getPublicSlots } from "./server/publicBooking";
import { buildBookingMeta, injectBookingMeta } from "./server/bookingMeta";
import {
  consumeVerification,
  contactBelongsToSender,
  createVerification,
  generateNonce,
  getVerification,
  isUsable,
  markVerified,
  parseStartPayload,
  releaseVerification,
  type TelegramUpdate,
} from "./server/verification";

interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_TIMEZONE?: string;
  /** Extra origins allowed to frame the CRM, comma-separated. See withSecurityHeaders. */
  EMBED_ANCESTORS?: string;
  CRM_BUSINESS_ID?: string;
  CRM_BUSINESS_TELEGRAM_ID?: string;
  CRM_SESSION_SECRET?: string;
  CLIENT_BOT_USERNAME?: string;
  BUSINESS_BOT_USERNAME?: string;
  BUSINESS_BOT_TOKEN?: string;
  /**
   * Comma-separated roots under which `<slug>.<root>` resolves to a business CRM.
   * Not in wrangler.toml (which carries no [vars] block) — this is only an override.
   */
  TENANT_ROOT_DOMAINS?: string;
  /**
   * Dedicated phone-verification bot. Separate from BUSINESS_BOT_TOKEN because a bot
   * has one webhook, and reusing the business bot's would steal its updates.
   */
  VERIFY_BOT_TOKEN?: string;
  VERIFY_BOT_USERNAME?: string;
  /** Echoed by Telegram in X-Telegram-Bot-Api-Secret-Token; gates the webhook. */
  VERIFY_WEBHOOK_SECRET?: string;
}

type BusinessRow = {
  id: number;
  user_id: number | null;
  name: string;
  type: string;
  address: string;
  phone: string;
  schedule: string;
  description: string | null;
  photo_file_id: string | null;
  photo_file_unique_id: string | null;
  crm_username: string | null;
  crm_password_hash: string | null;
  crm_temp_password_pending: number | null;
  crm_credentials_updated_at: string | null;
  slug: string | null;
  session_version: number;
  brand_color: string | null;
  brand_theme: string | null;
  booking_flow: string | null;
  plan: string | null;
  plan_started_at: string | null;
  plan_expires_at: string | null;
};

type LoginRow = {
  id: number;
  name: string;
  crm_username: string | null;
  crm_password_hash: string | null;
  crm_temp_password_pending: number | null;
  slug: string | null;
  session_version: number;
};

type ServiceRow = {
  id: number;
  business_id: number;
  name: string;
  category: string | null;
  price: number;
  duration: number;
  is_active: number;
};

type StaffRow = {
  id: number;
  business_id: number;
  name: string;
  role: string | null;
  phone: string | null;
  photo_file_id: string | null;
  crm_username: string | null;
  crm_temp_password_pending: number | null;
  access_role: string | null;
  access_enabled: number;
};

type StaffServiceRow = {
  staff_id: number;
  service_id: number;
  staff_name: string;
  service_name: string;
  service_active: number;
};

type StaffSlotRow = {
  id: number;
  staff_id: number;
  weekday: number;
  slot_time: string;
};

type StaffUnavailabilityRow = {
  id: number;
  staff_id: number;
  kind: "break" | "day_off";
  weekday: number | null;
  date: string | null;
  slot_time: string | null;
  is_full_day: number;
};

type BookingRow = {
  id: number;
  business_id: number;
  user_id: number | null;
  service_id: number | null;
  staff_id: number | null;
  client_name: string;
  service_name: string;
  staff_name: string;
  datetime: string;
  status: BookingStatus;
  price_snapshot: number;
  duration_snapshot: number | null;
  notes: string | null;
  client_phone: string | null;
};

/** One row of `booking_services`. Snapshots, not joins — see the migration. */
type BookingServiceRow = {
  booking_id: number;
  service_id: number | null;
  service_name: string;
  price: number;
  duration: number;
};

type PaymentRow = {
  id: number;
  booking_id: number;
  business_id: number;
  staff_id: number | null;
  amount: number;
  method: PaymentMethod;
  flow: "in" | "out";
  note: string | null;
  created_at: string;
};

type TelegramGetFileResult = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
};

const CARD_COLORS = ["#c9ebdd", "#eaf59e", "#dff1c4", "#d4ede2", "#f1f6cf", "#c4e5d4"];
const WEEKDAY_LABELS = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const ALLOWED_BUSINESS_TYPES = new Set([
  "barbershop",
  "beauty_salon",
  "carwash",
  "spa_salon",
  "dentistry",
  "medical_services",
  "other",
]);

function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init.headers,
    },
  });
}

class HttpResponseError extends Error {
  constructor(public response: Response) {
    super(`HTTP ${response.status}`);
    this.name = "HttpResponseError";
    Object.setPrototypeOf(this, HttpResponseError.prototype);
  }
}

function getHttpErrorResponse(error: unknown) {
  if (error instanceof HttpResponseError) {
    return error.response;
  }

  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: unknown }).response;
    if (response instanceof Response) {
      return response;
    }
  }

  return null;
}

function toAuthSession(business: BusinessRow): AuthSession {
  return {
    businessId: business.id,
    businessName: business.name,
    username: business.crm_username ?? "",
    isTemporaryPassword: Boolean(Number(business.crm_temp_password_pending)),
    slug: business.slug ?? null,
    role: "owner",
    staffId: null,
    staffName: null,
  };
}

async function getBusinessById(db: D1Database, businessId: number) {
  return (
    (await db
      .prepare(
        `SELECT
           id,
           user_id,
           name,
           type,
           address,
           phone,
           schedule,
           description,
           photo_file_id,
           photo_file_unique_id,
           booking_flow,
           crm_username,
           crm_password_hash,
           crm_temp_password_pending,
           crm_credentials_updated_at,
           slug,
           session_version,
           brand_color,
           brand_theme,
           plan,
           plan_started_at,
           plan_expires_at
         FROM businesses
         WHERE id = ?
         LIMIT 1`
      )
      .bind(businessId)
      .first<BusinessRow>()) ?? null
  );
}

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year ?? "1970"}-${map.month ?? "01"}-${map.day ?? "01"}`;
}

function getTodayIso(timeZone = "UTC") {
  return formatDateInTimeZone(new Date(), timeZone);
}

/**
 * Current local `HH:MM` in the business's zone.
 *
 * The booking page hides slots that have already passed, and "passed" has to mean passed
 * for the shop. A Worker runs in UTC, so comparing against UTC time would keep offering
 * 09:00 in Tashkent until lunchtime.
 */
function getNowMinuteInTimeZone(timeZone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.hour ?? "00"}:${map.minute ?? "00"}`;
}

function getSelectedDate(request: Request, timeZone = "UTC") {
  const url = new URL(request.url);
  const requested = url.searchParams.get("date");
  return isIsoDate(requested) ? requested! : getTodayIso(timeZone);
}

function getDatePart(datetime: string) {
  return datetime.replace("T", " ").slice(0, 10);
}

function getTimePart(datetime: string) {
  return datetime.replace("T", " ").slice(11, 16);
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    // UZS, not KZT. This is an Uzbek product (+998 numbers, easyq.uz, Tashkent addresses)
    // and the tenge was a leftover — the dashboard was quoting takings in Kazakh currency.
    // Every other money display in the UI already labels itself UZS via fmtSom.
    currency: "UZS",
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function normalizeBusinessType(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "salon") {
    return "beauty_salon";
  }

  return ALLOWED_BUSINESS_TYPES.has(normalized) ? normalized : null;
}

async function tgCallJson<T>(token: string, method: string, payload: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

async function getTelegramFileResponse(token: string, fileId: string) {
  const payload = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`
  );

  if (!payload.ok) {
    const text = await payload.text().catch(() => "");
    throw new Error(`Telegram getFile failed: ${payload.status} ${text}`);
  }

  const data = (await payload.json()) as TelegramGetFileResult;
  if (!data.ok || !data.result?.file_path) {
    throw new Error("Telegram did not return a file path for this photo.");
  }

  const fileResponse = await fetch(`https://api.telegram.org/file/bot${token}/${data.result.file_path}`);
  if (!fileResponse.ok) {
    const text = await fileResponse.text().catch(() => "");
    throw new Error(`Telegram file download failed: ${fileResponse.status} ${text}`);
  }

  return fileResponse;
}

function summarizePayments(totalAmount: number, payments: PaymentRow[]): PaymentSummary {
  const incoming = payments
    .filter((payment) => payment.flow === "in")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const outgoing = payments
    .filter((payment) => payment.flow === "out")
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const net = Number((incoming - outgoing).toFixed(2));
  const remaining = Number((totalAmount - net).toFixed(2));

  let status: PaymentSummary["status"] = "unpaid";
  if (net > 0 && remaining > 0) status = "partial";
  if (remaining === 0) status = "paid";
  if (remaining < 0) status = "overpaid";

  return {
    incoming,
    outgoing,
    net,
    remaining,
    status,
    history: payments.map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount || 0),
      method: payment.method,
      flow: payment.flow,
      note: payment.note,
      createdAt: payment.created_at,
    })) satisfies PaymentEntry[],
  };
}

function sumPaymentsInRange(payments: PaymentRow[], predicate: (payment: PaymentRow) => boolean) {
  return payments
    .filter(predicate)
    .reduce(
      (acc, payment) => {
        if (payment.flow === "in") acc.incoming += Number(payment.amount || 0);
        else acc.outgoing += Number(payment.amount || 0);
        return acc;
      },
      { incoming: 0, outgoing: 0 }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tenant hosts: `<slug>.easyq.uz` serves that business's CRM.
//
// Everything else — crm.easyq.uz, *.workers.dev, localhost — resolves to `null`
// and takes exactly the code path it took before this feature existed. That is
// what makes this safe to ship to a live production CRM.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TENANT_ROOTS = "easyq.uz,localhost";

/**
 * Host labels the platform serves itself; these never resolve to a business.
 * Distinct from RESERVED_SLUGS (claim-time) — `business-<id>` must stay routable
 * because the migration assigns it, even though nobody may claim it at signup.
 */
const RESERVED_HOST_LABELS = new Set(["crm", "www", "api", "app", "admin", "assets", "static", "cdn", "mail"]);

type TenantContext = { slug: string; businessId: number; businessName: string };

function tenantLabelFromHost(hostname: string, roots: string[]): string | null {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return null;
  if (host.endsWith(".workers.dev")) return null;

  for (const root of roots) {
    if (host === root) return null; // apex
    if (!host.endsWith(`.${root}`)) continue;
    const label = host.slice(0, -(root.length + 1));
    if (!label || label.includes(".")) return null; // deeper than one level
    return label;
  }
  return null; // unrecognized host → behave like the apex
}

function tenantRoots(env: Env): string[] {
  return (env.TENANT_ROOT_DOMAINS ?? DEFAULT_TENANT_ROOTS)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/** Public origin for a business's own CRM, e.g. https://vidok-barber.easyq.uz */
function tenantOrigin(slug: string, env: Env): string {
  const root = tenantRoots(env).find((value) => value !== "localhost" && value !== "127.0.0.1") ?? "easyq.uz";
  return `https://${slug}.${root}/`;
}

async function getTenantBySlug(db: D1Database, slug: string): Promise<TenantContext | null> {
  const row = await db
    .prepare("SELECT id, name, slug FROM businesses WHERE slug = ? LIMIT 1")
    .bind(slug)
    .first<{ id: number; name: string; slug: string }>();
  return row ? { slug: row.slug, businessId: row.id, businessName: row.name } : null;
}

/**
 * A subdomain nobody owns. Critically this must NOT fall through to
 * env.ASSETS.fetch — that would serve a fully working CRM login screen on every
 * random subdomain once the wildcard route is live.
 */
function unknownWorkspaceResponse(url: URL): Response {
  if (url.pathname.startsWith("/api/")) {
    return json({ error: "Unknown workspace", code: "unknown_tenant" }, { status: 404 });
  }

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EasyQ — адрес не найден</title>
<style>
  :root { color-scheme: light }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#F6F7F5;
         font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#12140F }
  .card { max-width:420px; padding:40px 32px; text-align:center }
  h1 { font-size:22px; font-weight:800; letter-spacing:-.02em; margin:0 0 10px }
  p { font-size:15px; line-height:1.55; color:#5B6053; margin:0 0 24px }
  code { background:#E9EBE4; padding:2px 7px; border-radius:6px; font-size:14px }
  a { display:inline-block; background:#B4D94E; color:#12140F; font-weight:800; font-size:15px;
      padding:13px 24px; border-radius:12px; text-decoration:none }
</style></head><body><div class="card">
  <h1>Здесь пока никого нет</h1>
  <p>Адрес <code>${url.hostname.replace(/[<>&"]/g, "")}</code> не принадлежит ни одному бизнесу на EasyQ.</p>
  <a href="https://easyq.uz">Перейти на easyq.uz</a>
</div></body></html>`;

  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Who is making the request, and what they may do.
 *
 * `business` is the tenant; `role` is the permission level; `staffId` identifies which
 * staff member for non-owner sessions. Handlers take this rather than a bare BusinessRow
 * so a capability check cannot be forgotten by accident — every mutating endpoint has to
 * name the capability it needs.
 */
type Actor = {
  business: BusinessRow;
  role: ActorRole;
  staffId: number | null;
};

function forbidden(capability: Capability) {
  return new HttpResponseError(
    json(
      { error: "Your role does not allow this action.", code: "forbidden", capability },
      { status: 403 }
    )
  );
}

/** Throws unless the actor holds `capability`. */
function requireCapability(actor: Actor, capability: Capability) {
  if (!can(actor.role, capability)) throw forbidden(capability);
}

/**
 * Count a hit and throw a 429 if it is over the limit.
 *
 * Throws rather than returning a verdict so a caller cannot check the limit and then forget to
 * act on it — the same reason `requireCapability` throws. `extraHeaders` carries the CORS
 * headers of whichever endpoint is being limited, or the browser reports a CORS failure instead
 * of the 429 and the visitor sees nothing useful.
 */
async function requireUnderRateLimit(
  env: Env,
  request: Request,
  rule: RateLimitRule,
  identifier?: string,
  extraHeaders: Record<string, string> = {}
) {
  const verdict = await consumeRateLimit(env.DB, rule, identifier ?? clientIp(request));
  if (verdict.allowed) return;

  throw new HttpResponseError(
    json(
      { error: "Too many requests. Please wait a moment and try again.", code: "rate_limited" },
      {
        status: 429,
        headers: { ...extraHeaders, "retry-after": String(verdict.retryAfter) },
      }
    )
  );
}

async function requireAuthenticatedBusiness(
  env: Env,
  request: Request,
  tenant: TenantContext | null
): Promise<Actor> {
  const session = await readSession(request, env.CRM_SESSION_SECRET);
  if (!session) {
    throw new HttpResponseError(
      json(
        { error: "Authentication required" },
        {
          status: 401,
          headers: {
            "set-cookie": clearSessionCookie(request),
          },
        }
      )
    );
  }

  // The session HMAC secret is shared across all hosts, so a token minted on one
  // host is cryptographically valid on another. HttpOnly stops scripts reading the
  // cookie but not the owner copying it out of DevTools, so the host↔business bond
  // has to be enforced here. Clearing is safe: the cookie carries no Domain= (see
  // buildCookie in ./server/auth.ts), so this only clears the copy on THIS host.
  if (tenant && session.businessId !== tenant.businessId) {
    throw new HttpResponseError(
      json(
        { error: "This session belongs to a different workspace. Please sign in again.", code: "wrong_workspace" },
        {
          status: 401,
          headers: {
            "set-cookie": clearSessionCookie(request),
          },
        }
      )
    );
  }

  const business = await getBusinessById(env.DB, session.businessId);
  if (!business || !business.crm_username) {
    throw new HttpResponseError(
      json(
        { error: "Your CRM session is no longer valid. Please sign in again." },
        {
          status: 401,

          headers: {
            "set-cookie": clearSessionCookie(request),
          },
        }
      )
    );
  }

  /**
   * Every cookie carries the credential row's `session_version` from when it was minted.
   * A mismatch means the password has been changed since — on this device or another — so
   * the cookie is retired. This is what makes changing a password actually evict a session
   * somebody else is holding, rather than leaving it live until the 14-day expiry.
   */
  const staleSession = (currentVersion: number) => {
    if (session.sv === currentVersion) return null;
    return new HttpResponseError(
      json(
        { error: "Your password was changed. Please sign in again.", code: "session_stale" },
        { status: 401, headers: { "set-cookie": clearSessionCookie(request) } }
      )
    );
  };

  // A staff session is only as good as the access still granted to that row. Revoking
  // access must take effect immediately, not in 14 days when the cookie expires — so the
  // staff row is re-read and re-checked on every request rather than trusted from the
  // signed cookie. The role is taken from the DB too, so a demotion applies at once.
  if (session.role !== "owner") {
    const member = await env.DB
      .prepare("SELECT id, access_role, access_enabled, session_version FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
      .bind(session.staffId, business.id)
      .first<{ id: number; access_role: string | null; access_enabled: number; session_version: number }>();

    if (!member || Number(member.access_enabled) !== 1) {
      throw new HttpResponseError(
        json(
          { error: "Your access has been turned off. Please contact the business owner.", code: "access_revoked" },
          { status: 401, headers: { "set-cookie": clearSessionCookie(request) } }
        )
      );
    }

    const stale = staleSession(Number(member.session_version ?? 0));
    if (stale) throw stale;

    return {
      business,
      role: member.access_role === "manager" ? "manager" : "specialist",
      staffId: Number(member.id),
    };
  }

  const stale = staleSession(Number(business.session_version ?? 0));
  if (stale) throw stale;

  return { business, role: "owner", staffId: null };
}

async function getSessionState(env: Env, request: Request, tenant: TenantContext | null) {
  const session = await readSession(request, env.CRM_SESSION_SECRET);
  if (!session) {
    return json(
      { error: "Authentication required" },
      {
        status: 401,
        headers: {
          "set-cookie": clearSessionCookie(request),
        },
      }
    );
  }

  // Same host↔business bond as requireAuthenticatedBusiness, so the SPA's boot
  // check reports "signed out" rather than flashing another business's name.
  if (tenant && session.businessId !== tenant.businessId) {
    return json(
      { error: "This session belongs to a different workspace. Please sign in again.", code: "wrong_workspace" },
      {
        status: 401,
        headers: {
          "set-cookie": clearSessionCookie(request),
        },
      }
    );
  }

  const business = await getBusinessById(env.DB, session.businessId);
  if (!business || !business.crm_username) {
    return json(
      { error: "Your CRM session is no longer valid. Please sign in again." },
      {
        status: 401,
        headers: {
          "set-cookie": clearSessionCookie(request),
        },
      }
    );
  }

  // A staff session must report its own role and name, not the owner's. The role comes
  // from the staff row rather than the cookie, so a demotion or revocation applies on the
  // very next page load instead of when the cookie expires.
  if (session.role !== "owner") {
    const member = await env.DB
      .prepare("SELECT id, name, crm_username, crm_temp_password_pending, access_role, access_enabled FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
      .bind(session.staffId, business.id)
      .first<{ id: number; name: string; crm_username: string | null; crm_temp_password_pending: number | null; access_role: string | null; access_enabled: number }>();

    if (!member || Number(member.access_enabled) !== 1) {
      return json(
        { error: "Your access has been turned off. Please contact the business owner.", code: "access_revoked" },
        { status: 401, headers: { "set-cookie": clearSessionCookie(request) } }
      );
    }

    return json({
      ...toAuthSession(business),
      username: member.crm_username ?? "",
      isTemporaryPassword: Boolean(Number(member.crm_temp_password_pending)),
      role: staffAccessRole(member.access_role),
      staffId: Number(member.id),
      staffName: member.name,
    } satisfies AuthSession);
  }

  return json(toAuthSession(business));
}

async function login(env: Env, request: Request, tenant: TenantContext | null) {
  const input = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = normalizeCrmUsername(input.username ?? "");
  const password = String(input.password ?? "");

  if (!username || !password) {
    return json({ error: "Введите логин и пароль." }, { status: 400 });
  }

  // Both buckets, and BEFORE the first password hash. Per-IP stops one machine grinding; the
  // per-username bucket is what catches a distributed attempt on a single account, where every
  // request comes from a different address and no IP bucket ever fills. Counting before the
  // hash is the point — the 100k PBKDF2 iterations are the cost being defended.
  await requireUnderRateLimit(env, request, LIMITS.loginPerIp);
  await requireUnderRateLimit(env, request, LIMITS.loginPerUser, username);

  const row = await env.DB
    .prepare(
      `SELECT
         id,
         name,
         crm_username,
         crm_password_hash,
         crm_temp_password_pending,
         slug,
         session_version
       FROM businesses
       WHERE crm_username = ?
       LIMIT 1`
    )
    .bind(username)
    .first<LoginRow>();

  // Staff share one username namespace with businesses (see the unique index in
  // migrations/2026-07-28-staff-access.sql), so this is a fallback, not an alternative
  // path: a name resolves to exactly one account of one kind.
  if (!row || !(await verifyCrmPassword(password, row.crm_password_hash))) {
    return await loginStaff(env, request, tenant, username, password);
  }

  // Deliberately AFTER the password check, and with the identical error string, so
  // a tenant host cannot be used to probe which logins exist elsewhere.
  if (tenant && row.id !== tenant.businessId) {
    return json({ error: "Неверный логин или пароль." }, { status: 401 });
  }

  const business = await getBusinessById(env.DB, row.id);
  if (!business) {
    return json({ error: "Бизнес для этого логина не найден." }, { status: 404 });
  }

  const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
    businessId: business.id,
    username: business.crm_username ?? username,
    role: "owner",
    sessionVersion: Number(business.session_version ?? 0),
  });

  return json(
    {
      ok: true,
      session: toAuthSession(business),
    },
    {
      headers: {
        "set-cookie": cookie,
      },
    }
  );
}

// ───────────────────────────────────────────────────── Staff logins (owner-managed)
//
// The owner is the business account. Managers and specialists are staff rows that the
// owner has granted a login to; their permissions live in server/permissions.ts and are
// enforced on every request, not in the browser.

type StaffLoginRow = {
  id: number;
  business_id: number;
  name: string;
  crm_username: string | null;
  crm_password_hash: string | null;
  crm_temp_password_pending: number | null;
  access_role: string | null;
  access_enabled: number;
  session_version: number;
};

function staffAccessRole(value: string | null): ActorRole {
  // Anything unrecognized is the least privileged, never the most.
  return value === "manager" ? "manager" : "specialist";
}

/**
 * Second half of `login`. Reached only when no BUSINESS matched those credentials, and it
 * returns the identical error string in every failure case so the response cannot be used
 * to work out whether a username exists, or whether it belongs to a business or a person.
 */
async function loginStaff(
  env: Env,
  request: Request,
  tenant: TenantContext | null,
  username: string,
  password: string
) {
  const invalid = json({ error: "Неверный логин или пароль." }, { status: 401 });

  const member = await env.DB
    .prepare(
      `SELECT id, business_id, name, crm_username, crm_password_hash, crm_temp_password_pending,
              access_role, access_enabled, session_version
       FROM staff WHERE crm_username = ? LIMIT 1`
    )
    .bind(username)
    .first<StaffLoginRow>();

  // The decoy on the not-found branch is what stops response time from answering "does this
  // account exist". This is the LAST place a username can fail to resolve — login() falls
  // through to here — so it is the only branch that needs it.
  if (!member) {
    await verifyAgainstDecoy(password);
    return invalid;
  }
  if (!(await verifyCrmPassword(password, member.crm_password_hash))) {
    return invalid;
  }

  // Checked after the password so a revoked account is indistinguishable from a wrong one.
  if (Number(member.access_enabled) !== 1) return invalid;
  if (tenant && member.business_id !== tenant.businessId) return invalid;

  const business = await getBusinessById(env.DB, member.business_id);
  if (!business) return invalid;

  const role = staffAccessRole(member.access_role);
  const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
    businessId: business.id,
    username: member.crm_username ?? username,
    role,
    staffId: member.id,
    sessionVersion: Number(member.session_version ?? 0),
  });

  return json(
    {
      ok: true,
      session: {
        businessId: business.id,
        businessName: business.name,
        username: member.crm_username ?? username,
        isTemporaryPassword: Boolean(Number(member.crm_temp_password_pending)),
        slug: business.slug ?? null,
        role,
        staffId: member.id,
        staffName: member.name,
      } satisfies AuthSession,
    },
    { headers: { "set-cookie": cookie } }
  );
}

/** Free username for a staff member, unique across BOTH tables (one login namespace). */
async function allocateStaffUsername(db: D1Database, name: string, staffId: number) {
  const base = normalizeCrmUsernameBase(name);
  let candidate = `${base}${staffId}`;
  for (let suffix = 1; ; suffix += 1) {
    const [biz, member] = await Promise.all([
      db.prepare("SELECT 1 AS x FROM businesses WHERE crm_username = ? LIMIT 1").bind(candidate).first(),
      db.prepare("SELECT 1 AS x FROM staff WHERE crm_username = ? AND id != ? LIMIT 1").bind(candidate, staffId).first(),
    ]);
    if (!biz && !member) return candidate;
    candidate = `${base}${staffId}_${suffix}`;
  }
}

type StaffAccessInput = { accessRole?: string; enabled?: boolean };

/**
 * Grant access, change the role, or reset the password — one endpoint because from the
 * owner's side it is one screen, and each variant needs the same ownership check.
 *
 * Returns the temp password exactly once, in the response. It is stored in the clear
 * alongside the hash only so the owner can read it out; login always goes through the
 * hash, and the plaintext is cleared the moment the person sets their own.
 */
async function grantStaffAccess(env: Env, actor: Actor, staffId: number, input: StaffAccessInput) {
  const member = await env.DB
    .prepare("SELECT id, name, crm_username FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, actor.business.id)
    .first<{ id: number; name: string; crm_username: string | null }>();

  if (!member) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  const accessRole = input.accessRole === "manager" ? "manager" : "specialist";
  const username = member.crm_username ?? (await allocateStaffUsername(env.DB, member.name, member.id));
  const tempPassword = generateCrmTempPassword();
  const passwordHash = await hashCrmPassword(tempPassword);

  await env.DB
    .prepare(
      `UPDATE staff
       SET crm_username = ?, crm_password_hash = ?, crm_temp_password_pending = 1, access_role = ?,
           access_enabled = 1, session_version = session_version + 1,
           access_updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`
    )
    .bind(username, passwordHash, accessRole, staffId, actor.business.id)
    .run();

  return json({ ok: true, username, password: tempPassword, accessRole }, { status: 201 });
}

/** Change the role without touching the password. */
async function updateStaffAccessRole(env: Env, actor: Actor, staffId: number, input: StaffAccessInput) {
  const accessRole = input.accessRole === "manager" ? "manager" : "specialist";

  const result = await env.DB
    .prepare(
      `UPDATE staff SET access_role = ?, access_updated_at = datetime('now')
       WHERE id = ? AND business_id = ? AND crm_username IS NOT NULL`
    )
    .bind(accessRole, staffId, actor.business.id)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    return json({ error: "This employee does not have CRM access yet." }, { status: 400 });
  }

  return json({ ok: true, accessRole });
}

/**
 * Turn access off. The username and hash are kept: requireAuthenticatedBusiness re-reads
 * access_enabled on every request, so this takes effect immediately even for someone
 * already signed in, and re-granting later does not have to reissue the username.
 */
async function revokeStaffAccess(env: Env, actor: Actor, staffId: number) {
  const result = await env.DB
    .prepare(
      `UPDATE staff SET access_enabled = 0, crm_temp_password_pending = 0, access_updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`
    )
    .bind(staffId, actor.business.id)
    .run();

  if (Number(result.meta.changes ?? 0) !== 1) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  return json({ ok: true });
}

async function logout(request: Request) {
  return json(
    { ok: true },
    {
      headers: {
        "set-cookie": clearSessionCookie(request),
      },
    }
  );
}

// Top-level (form-POST) login that sets the session cookie first-party and redirects into the CRM.
// Used by the landing's /signup "Open CRM" button so a fresh signup lands in its OWN account,
// overwriting any stale session (e.g. a previously logged-in business).
async function sessionLogin(env: Env, request: Request, tenant: TenantContext | null) {
  const form = await request.formData().catch(() => null);
  const username = normalizeCrmUsername(String(form?.get("username") ?? ""));
  const password = String(form?.get("password") ?? "");

  // The SAME buckets `login` uses, and for the same reason.
  //
  // This endpoint checks the identical credentials against the identical tables and hands back
  // the identical session cookie — it just takes a form POST instead of JSON. Rate limiting one
  // door and not the other does not slow an attacker down, it only decides which URL they use.
  // The throttle on /api/auth/login was effectively decorative while this was open.
  //
  // Counted BEFORE the first password hash, so the 100k PBKDF2 iterations are what is being
  // protected rather than what pays for the check.
  await requireUnderRateLimit(env, request, LIMITS.loginPerIp);
  await requireUnderRateLimit(env, request, LIMITS.loginPerUser, username);

  if (username && password) {
    const row = await env.DB
      .prepare("SELECT id, name, crm_username, crm_password_hash, crm_temp_password_pending, slug, session_version FROM businesses WHERE crm_username = ? LIMIT 1")
      .bind(username)
      .first<LoginRow>();
    // The tenant check rides along with the credential check: a mismatch falls
    // through to the same "bad creds" redirect below, revealing nothing.
    if (row && (await verifyCrmPassword(password, row.crm_password_hash)) && (!tenant || row.id === tenant.businessId)) {
      const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
        businessId: row.id,
        username: row.crm_username ?? username,
        role: "owner",
        // Must carry the CURRENT version. Defaulting to 0 would mint a cookie that
        // requireAuthenticatedBusiness immediately rejects as stale for any business that
        // has ever changed its password — a 401 loop straight out of the signup flow.
        sessionVersion: Number(row.session_version ?? 0),
      });
      return new Response(null, { status: 303, headers: { location: "/", "set-cookie": cookie } });
    }

    // Staff fall back the same way `login` does. Without this, a manager or specialist
    // following the post-login redirect to their business's subdomain would silently land
    // back on the login screen — the credentials are valid, they are just not in
    // `businesses`.
    const member = await env.DB
      .prepare(
        `SELECT id, business_id, name, crm_username, crm_password_hash, crm_temp_password_pending,
                access_role, access_enabled, session_version
         FROM staff WHERE crm_username = ? LIMIT 1`
      )
      .bind(username)
      .first<StaffLoginRow>();

    if (
      member &&
      (await verifyCrmPassword(password, member.crm_password_hash)) &&
      Number(member.access_enabled) === 1 &&
      (!tenant || member.business_id === tenant.businessId)
    ) {
      const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
        businessId: member.business_id,
        username: member.crm_username ?? username,
        role: staffAccessRole(member.access_role),
        staffId: member.id,
        sessionVersion: Number(member.session_version ?? 0),
      });
      return new Response(null, { status: 303, headers: { location: "/", "set-cookie": cookie } });
    }
  }

  // Bad/missing creds → clear any stale session and land on the login screen. Deliberately
  // the same response for a wrong password, a revoked account and a wrong tenant, so this
  // endpoint cannot be used to probe which of those it was.
  //
  // The decoy hash makes that true of the TIMING as well, which the identical response alone
  // does not: a real username spends ~100k PBKDF2 iterations failing, an unknown one returned
  // immediately, and the gap is measurable from outside. `login` already did this; this door
  // did not, so usernames stayed enumerable through it.
  if (username && password) {
    await verifyAgainstDecoy(password);
  }

  return new Response(null, { status: 303, headers: { location: "/", "set-cookie": clearSessionCookie(request) } });
}

/**
 * Signup captcha, currently OFF at the client's request.
 *
 * A constant rather than an env var on purpose: turning this back on is a code change that
 * goes through review and CI, not a dashboard toggle somebody forgets they flipped. The
 * captcha module, its table and the landing's field all stay in place, so flipping this to
 * `true` restores it with no other edit.
 */
const SIGNUP_CAPTCHA_ENABLED = false;

/**
 * Telegram phone verification, currently OFF at the client's request.
 *
 * ON since 2026-07-30, verified end to end before flipping: a nonce issued here, opened in
 * @easyqueue_business_bot, confirmed by a shared contact, and read back as `verified` with the
 * real number — 49 seconds, no HTTP between the two Workers.
 *
 * While false, signup falls back to the demo code `1111`, shown on the form, and takes the
 * phone number from the request body. That is not verification of anything — it is a
 * placeholder so registration works with no bot at all.
 *
 * Turning it back off is safe at any time and needs nothing else changed: the landing still
 * sends the demo code alongside the nonce, so the fallback path stays intact.
 *
 * A constant rather than an env var for the same reason as the captcha: changing a control
 * like this should go through review and CI.
 */
const PHONE_VERIFICATION_ENABLED = true;

/** Accepted while PHONE_VERIFICATION_ENABLED is false. Displayed on the form. */
const DEMO_SIGNUP_CODE = "1111";

// Public sign-up endpoint — called cross-origin by the static landing's /signup wizard.
// Fetch sends no credentials, so a permissive CORS allow-list is sufficient.
const SIGNUP_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const PUBLIC_GET_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
};

type SignupInput = {
  name?: string;
  type?: string;
  address?: string;
  lang?: string;
  slug?: string;
  captchaToken?: string;
  captchaAnswer?: string;
  acceptedTerms?: boolean;
  /**
   * Proof that a Telegram account confirmed a phone number. Used only while
   * PHONE_VERIFICATION_ENABLED is true, in which case the phone comes from the
   * verification row and `phone` below is ignored — a client-supplied number would make
   * the verification decorative.
   */
  verificationNonce?: string;
  /** Demo path only: the `1111` code, and the number the visitor typed. */
  code?: string;
  phone?: string;
};

// ─────────────────────────────────────────────────────── Telegram phone verification

/**
 * The bot that answers the verification deep link.
 *
 * This is the BUSINESS bot, not a bot of our own. The original plan was a dedicated
 * verification bot, because a bot has exactly one webhook and this one's already points at
 * `easyqueue-business-bot` — a second service could not also receive its updates.
 *
 * That turned out to be the wrong thing to route around. All three Workers bind the same D1,
 * so the bot writes the verification row itself and the CRM simply reads it. No second bot for
 * an owner to be confused by, no webhook to repoint, and no HTTP between services.
 *
 * The handler lives in `easyqueue-business-bot/src/handlers/signup.handler.ts`.
 */
function verifyBotUsername(env: Env) {
  return env.BUSINESS_BOT_USERNAME || "easyqueue_business_bot";
}

/**
 * Payload for `t.me/<bot>?start=<payload>`.
 *
 * `easyq_` marks it as ours, so the bot can tell a sign-up link from a bare /start or any
 * future payload. The language rides along so the bot answers in the language the visitor was
 * already reading, instead of asking again at the one step that has to feel effortless.
 *
 * Telegram allows 64 characters of [A-Za-z0-9_-]; a 22-character base64url nonce plus the
 * eight-character prefix is well inside that.
 */
function verifyStartPayload(nonce: string, lang: string) {
  const safe = lang === "uz" || lang === "ru" || lang === "en" ? lang : "uz";
  return `easyq_${safe}_${nonce}`;
}

async function startVerification(env: Env, request: Request) {
  // Each call writes a row and starts a 15-minute clock. Cheap to ask for, so worth bounding.
  await requireUnderRateLimit(env, request, LIMITS.verifyStart, undefined, SIGNUP_CORS);

  // No token check any more. Issuing a nonce is a database write and a string; nothing here
  // talks to Telegram, so there is no secret this endpoint could be missing.
  const input = (await request.json().catch(() => ({}))) as { lang?: string };

  const nonce = generateNonce();
  const created = await createVerification(env.DB, nonce);
  const payload = verifyStartPayload(created.nonce, String(input.lang ?? ""));

  return json(
    {
      nonce: created.nonce,
      // `startapp` is for mini-apps; plain `start` is what delivers "/start <payload>".
      deepLink: `https://t.me/${verifyBotUsername(env)}?start=${payload}`,
      botUsername: verifyBotUsername(env),
      expiresIn: created.expiresIn,
    },
    { status: 201, headers: { ...SIGNUP_CORS, "cache-control": "no-store" } }
  );
}

/**
 * Polled by the signup wizard. Deliberately thin: it reveals only whether THIS nonce
 * has been confirmed and, once it has, the number that was confirmed. The nonce is
 * unguessable, so holding it is what authorizes seeing the phone.
 */
async function verificationStatus(env: Env, url: URL) {
  const nonce = url.searchParams.get("nonce") ?? "";
  const row = await getVerification(env.DB, nonce);

  if (!row || !isUsable(row)) {
    return json(
      { status: row?.status === "consumed" ? "consumed" : "expired" },
      { headers: { ...PUBLIC_GET_CORS, "cache-control": "no-store" } }
    );
  }

  return json(
    {
      status: row.status,
      phone: row.status === "verified" ? row.phone : null,
    },
    { headers: { ...PUBLIC_GET_CORS, "cache-control": "no-store" } }
  );
}

const VERIFY_PROMPT: Record<string, { ask: string; done: string; bad: string; stale: string }> = {
  ru: {
    ask: "Нажмите кнопку ниже, чтобы подтвердить свой номер телефона и продолжить регистрацию на EasyQ.",
    done: "Номер подтверждён ✅ Вернитесь на страницу регистрации — она продолжится сама.",
    bad: "Пожалуйста, нажмите кнопку «Поделиться номером», а не отправляйте чужой контакт.",
    stale: "Ссылка устарела. Откройте регистрацию на easyq.uz заново.",
  },
  uz: {
    ask: "Telefon raqamingizni tasdiqlash va EasyQ’da ro‘yxatdan o‘tishni davom ettirish uchun pastdagi tugmani bosing.",
    done: "Raqam tasdiqlandi ✅ Ro‘yxatdan o‘tish sahifasiga qayting — u o‘zi davom etadi.",
    bad: "Iltimos, «Raqamni yuborish» tugmasini bosing, boshqa odamning kontaktini yubormang.",
    stale: "Havola eskirgan. easyq.uz’da ro‘yxatdan o‘tishni qaytadan boshlang.",
  },
  en: {
    ask: "Tap the button below to confirm your phone number and continue signing up for EasyQ.",
    done: "Number confirmed ✅ Head back to the signup page — it will continue on its own.",
    bad: "Please tap the “Share my number” button rather than forwarding someone else's contact.",
    stale: "This link has expired. Start the signup again at easyq.uz.",
  },
};

const SHARE_BUTTON: Record<string, string> = {
  ru: "📱 Поделиться номером",
  uz: "📱 Raqamni yuborish",
  en: "📱 Share my number",
};

function promptLang(code: string | undefined) {
  const lang = String(code ?? "").slice(0, 2).toLowerCase();
  return lang === "ru" || lang === "uz" || lang === "en" ? lang : "ru";
}

/**
 * Webhook for the dedicated verification bot.
 *
 * Register it once with:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" -d url=... -d secret_token=...
 *
 * Telegram echoes that secret in X-Telegram-Bot-Api-Secret-Token. Checking it is not
 * optional: this endpoint writes verified phone numbers, so without the check anyone
 * who knows the URL could POST a forged contact and verify any number they like.
 */
async function telegramVerifyWebhook(env: Env, request: Request) {
  if (!env.VERIFY_BOT_TOKEN || !env.VERIFY_WEBHOOK_SECRET) {
    return json({ error: "Not found" }, { status: 404 });
  }

  const presented = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!timingSafeEqualString(presented, env.VERIFY_WEBHOOK_SECRET)) {
    // 404 rather than 401: an unauthenticated caller learns nothing about the route.
    return json({ error: "Not found" }, { status: 404 });
  }

  const update = (await request.json().catch(() => ({}))) as TelegramUpdate;
  const message = update.message;
  const chatId = message?.chat?.id;
  const senderId = message?.from?.id;
  const lang = promptLang(message?.from?.language_code);
  const copy = VERIFY_PROMPT[lang];

  // Always 200. A non-2xx makes Telegram retry the same update for hours, so failures
  // are swallowed here and surfaced through the browser's polling instead.
  if (!chatId) return json({ ok: true });

  const startPayload = parseStartPayload(message?.text);
  if (startPayload) {
    const row = await getVerification(env.DB, startPayload);
    if (!row || !isUsable(row)) {
      await sendVerifyMessage(env, chatId, copy.stale);
      return json({ ok: true });
    }

    await sendVerifyMessage(env, chatId, copy.ask, {
      keyboard: [[{ text: SHARE_BUTTON[lang], request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
    // The nonce is remembered against the chat, because the contact message that
    // follows carries no payload of its own.
    await rememberPendingChat(env.DB, chatId, startPayload);
    return json({ ok: true });
  }

  if (message?.contact) {
    if (!contactBelongsToSender(message.contact, senderId)) {
      await sendVerifyMessage(env, chatId, copy.bad);
      return json({ ok: true });
    }

    const nonce = await takePendingChat(env.DB, chatId);
    if (!nonce) {
      await sendVerifyMessage(env, chatId, copy.stale);
      return json({ ok: true });
    }

    const phone = toStoragePhone(String(message.contact.phone_number ?? ""));
    if (!phone) {
      await sendVerifyMessage(env, chatId, copy.stale);
      return json({ ok: true });
    }

    const outcome = await markVerified(env.DB, nonce, phone, Number(senderId));
    await sendVerifyMessage(env, chatId, outcome.ok ? copy.done : copy.stale, { remove_keyboard: true });
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function sendVerifyMessage(env: Env, chatId: number, text: string, replyMarkup?: unknown) {
  if (!env.VERIFY_BOT_TOKEN) return;
  await tgCallJson(env.VERIFY_BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }).catch((error) => {
    console.log("verify sendMessage error:", error);
    return null;
  });
}

/**
 * The contact message Telegram sends has no /start payload, so the nonce has to be
 * carried across the two updates. It is parked on the verification row itself
 * (telegram_id doubles as "this chat is mid-flow") to avoid a second table.
 */
async function rememberPendingChat(db: D1Database, chatId: number, nonce: string) {
  await db
    .prepare("UPDATE signup_verification SET telegram_id = ? WHERE nonce = ? AND status = 'pending'")
    .bind(chatId, nonce)
    .run();
}

/** Most recent still-pending nonce this chat opened. */
async function takePendingChat(db: D1Database, chatId: number) {
  const row = await db
    .prepare(
      `SELECT nonce FROM signup_verification
       WHERE telegram_id = ? AND status = 'pending' AND expires_at >= ?
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .bind(chatId, Math.floor(Date.now() / 1000))
    .first<{ nonce: string }>();
  return row?.nonce ?? null;
}

/** Length-independent comparison, so a wrong secret leaks nothing through timing. */
function timingSafeEqualString(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function crmUsernameExists(db: D1Database, username: string) {
  const row = await db.prepare("SELECT 1 AS x FROM businesses WHERE crm_username = ? LIMIT 1").bind(username).first();
  return Boolean(row);
}

async function slugExists(db: D1Database, slug: string) {
  const row = await db.prepare("SELECT 1 AS x FROM businesses WHERE slug = ? LIMIT 1").bind(slug).first();
  return Boolean(row);
}

/**
 * Live "is this subdomain free?" probe for the landing wizard.
 *
 * Always 200 — this is a lookup, not a failure. Syntax is checked in CPU before
 * D1 is touched, so malformed input never becomes a query. It is not an
 * enumeration risk worth worrying about: slugs are public DNS names, so anyone
 * could already probe `https://x.easyq.uz` directly.
 */
async function checkSubdomain(env: Env, url: URL) {
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();

  const problem: SlugProblem | null = slugProblem(slug);
  if (problem) {
    return json({ slug, available: false, reason: problem }, { headers: PUBLIC_GET_CORS });
  }

  const taken = await slugExists(env.DB, slug);
  return json(
    { slug, available: !taken, reason: taken ? "taken" : null },
    { headers: PUBLIC_GET_CORS }
  );
}

// ───────────────────────────────────────────── Public booking page (tenant hosts only)
//
// These are the only endpoints a stranger can reach with no session. Each one derives the
// business from `tenant` — resolved from the HOSTNAME — and never from the request body,
// so one shop's page cannot read or write another's data.

async function publicBusinessEndpoint(env: Env, tenant: TenantContext) {
  const timeZone = env.APP_TIMEZONE || "UTC";
  const payload = await getPublicBusiness(env.DB, tenant.businessId, timeZone, getTodayIso(timeZone));
  if (!payload) return json({ error: "Not found" }, { status: 404 });

  // Short cache: services and staff change rarely, and this is the page's first request.
  return json(payload, { headers: { "cache-control": "public, max-age=60" } });
}

async function publicSlotsEndpoint(env: Env, tenant: TenantContext, url: URL) {
  const timeZone = env.APP_TIMEZONE || "UTC";
  const today = getTodayIso(timeZone);
  const date = url.searchParams.get("date") ?? "";
  const staffId = Number(url.searchParams.get("staffId") ?? 0);
  // `serviceIds` is what the booking page sends now; `serviceId` is kept for an older cached
  // bundle. Both go through the same resolver the write path uses, so a slot list and the
  // booking that follows it can never be sized by different rules.
  const wanted = requestedServiceIds({
    serviceId: Number(url.searchParams.get("serviceId") ?? 0) || undefined,
    serviceIds: (url.searchParams.get("serviceIds") ?? "")
      .split(",")
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v) && v > 0),
  });

  if (!isIsoDate(date) || !Number.isInteger(staffId) || staffId <= 0) {
    return json({ error: "A date and staffId are required." }, { status: 400 });
  }
  if (date < today) {
    return json({ date, staffId, slots: [] });
  }

  // Durations are looked up, never taken from the query string: a client could otherwise
  // claim fifteen minutes and be offered slots that a ninety-minute basket would overrun.
  // Scoped to this business and to active services, like every other public lookup.
  let serviceDuration: number | null = null;
  if (wanted.length > 0) {
    const placeholders = wanted.map(() => "?").join(", ");
    const rows = await env.DB
      .prepare(`SELECT id, name, price, duration FROM services WHERE business_id = ? AND is_active = 1 AND id IN (${placeholders})`)
      .bind(tenant.businessId, ...wanted)
      .all<{ id: number; name: string; price: number; duration: number }>();
    const basket = buildBasket(wanted, rows.results ?? []);
    // A basket that will not resolve gets no duration rather than a partial one — offering
    // slots sized to the services that DID resolve would advertise times the booking then
    // refuses, which reads as the shop losing the slot between one screen and the next.
    serviceDuration = basket ? basket.totalDuration : null;
  }

  const slots = await getPublicSlots(
    env.DB,
    tenant.businessId,
    staffId,
    date,
    date === today ? getNowMinuteInTimeZone(timeZone) : null,
    serviceDuration
  );

  // Never cached: a slot list is stale the moment somebody else books.
  return json({ date, staffId, slots }, { headers: { "cache-control": "no-store" } });
}

async function publicBookingEndpoint(env: Env, tenant: TenantContext, request: Request) {
  const timeZone = env.APP_TIMEZONE || "UTC";
  const input = (await request.json().catch(() => ({}))) as CreatePublicBookingInput;

  const result = await createPublicBooking(
    env.DB,
    tenant.businessId,
    input,
    getTodayIso(timeZone),
    getNowMinuteInTimeZone(timeZone)
  );

  if (!result.ok) {
    // 409 for "someone got there first", which the UI retries by refreshing slots;
    // 429 for the per-phone cap; 400 for anything the client can fix by editing.
    const status = result.error === "slot_taken" ? 409 : result.error === "rate_limited" ? 429 : 400;
    return json({ error: result.error, code: result.error }, { status });
  }

  return json(result, { status: 201 });
}

/** The shop's photo, for the public page. Same proxy, without the session requirement. */
async function publicPhotoEndpoint(env: Env, tenant: TenantContext) {
  const business = await getBusinessById(env.DB, tenant.businessId);
  if (!business) return new Response("Not found", { status: 404 });
  return proxyBusinessPhoto(env, business);
}

async function getCaptcha(env: Env, request: Request) {
  const captcha = await issueCaptcha(request, env.CRM_SESSION_SECRET);
  return json(captcha, {
    headers: { ...PUBLIC_GET_CORS, "cache-control": "no-store" },
  });
}

async function signupBusiness(env: Env, request: Request) {
  // Ahead of everything. With SIGNUP_CAPTCHA_ENABLED off this endpoint writes a `users` row and
  // a `businesses` row per call with nothing in between, so until the captcha comes back this
  // is the only thing standing between a script and an unbounded pile of fake businesses.
  await requireUnderRateLimit(env, request, LIMITS.signup, undefined, SIGNUP_CORS);

  const input = (await request.json().catch(() => ({}))) as SignupInput;
  const name = (input.name ?? "").trim();
  const type = (input.type ?? "").trim() || "other";
  const address = (input.address ?? "").trim() || "—";
  const language = input.lang === "ru" || input.lang === "uz" ? input.lang : null;
  const slug = String(input.slug ?? "").trim().toLowerCase();

  // Captcha is the cheapest way to turn a bot away before any row is written, but it is
  // OFF at the client's request. Turned off behind a flag rather than deleted, because
  // this is temporary — flip SIGNUP_CAPTCHA_ENABLED to true to bring it back, and the
  // landing still sends captchaToken/captchaAnswer so nothing else has to change.
  //
  // While it is off, POST /api/signup is completely unauthenticated and creates a `users`
  // row and a `businesses` row per call. Nothing else stands between a script and the
  // table. See TODO.md.
  if (SIGNUP_CAPTCHA_ENABLED) {
    const captcha = await verifyCaptcha(
      env.DB,
      request,
      String(input.captchaToken ?? ""),
      String(input.captchaAnswer ?? ""),
      env.CRM_SESSION_SECRET
    );
    if (!captcha.ok) {
      const message =
        captcha.code === "captcha_expired"
          ? "The captcha expired. Please try the new one."
          : captcha.code === "captcha_replay"
            ? "That captcha was already used. Please try the new one."
            : "The captcha answer is incorrect.";
      return json({ error: message, code: captcha.code }, { status: 400, headers: SIGNUP_CORS });
    }
  }

  if (input.acceptedTerms !== true) {
    return json(
      { error: "You must accept the Terms and the Privacy Policy.", code: "terms_required" },
      { status: 400, headers: SIGNUP_CORS }
    );
  }

  if (name.length < 2) {
    return json({ error: "Business name is required." }, { status: 400, headers: SIGNUP_CORS });
  }

  const slugIssue = slugProblem(slug);
  if (slugIssue) {
    return json(
      { error: "That subdomain can't be used.", code: slugIssue === "reserved" ? "slug_reserved" : "slug_invalid" },
      { status: 400, headers: SIGNUP_CORS }
    );
  }
  if (await slugExists(env.DB, slug)) {
    return json({ error: "That subdomain is already taken.", code: "slug_taken" }, { status: 409, headers: SIGNUP_CORS });
  }

  // Phone verification is spent LAST among the checks and immediately before the first
  // write, because consuming is a compare-and-swap: it is what stops two concurrent
  // requests holding the same nonce from creating two businesses. Everything cheap and
  // rejectable therefore runs first, so a slug collision does not burn a good nonce.
  let storedPhone: string;
  /** Set only on the verified path; null keeps the synthetic-id fallback below. */
  let verifiedTelegramId: number | null = null;

  if (PHONE_VERIFICATION_ENABLED) {
    const verification = await consumeVerification(env.DB, String(input.verificationNonce ?? ""));
    if (!verification.ok) {
      return json(
        {
          error:
            verification.reason === "already_used"
              ? "That confirmation was already used. Please verify your number again."
              : "Please confirm your phone number in Telegram first.",
          code: `verify_${verification.reason}`,
        },
        { status: 400, headers: SIGNUP_CORS }
      );
    }
    // Telegram vouched for this number, so it never came from the request body.
    storedPhone = verification.phone;
    verifiedTelegramId = verification.telegramId;
  } else {
    // Demo path. The code is a constant the form prints, so this proves nothing about
    // whoever is registering — it only keeps the shape of the flow while verification is
    // switched off.
    if (String(input.code ?? "") !== DEMO_SIGNUP_CODE) {
      return json({ error: "Invalid verification code.", code: "invalid_code" }, { status: 400, headers: SIGNUP_CORS });
    }

    // Still validated and canonicalized: an unusable number in the row is worse than a
    // rejected signup, because the business can never be phoned back.
    const typedPhone = toStoragePhone(String(input.phone ?? ""));
    if (!typedPhone) {
      return json({ error: "A valid phone number is required.", code: "invalid_phone" }, { status: 400, headers: SIGNUP_CORS });
    }
    storedPhone = typedPhone;
  }

  // The Telegram account that verified the phone, when there was one.
  //
  // This is the point of routing verification through the business bot rather than a bot of
  // our own: the same person now has ONE account. Before this, a web sign-up got a synthetic
  // negative id, so the business existed for the CRM and did not exist for the bots — the
  // owner could not manage it in Telegram, and anything that resolved an owner's chat failed
  // silently. Logo upload was broken that way for months.
  let userId = 0;
  if (verifiedTelegramId) {
    // telegram_id is UNIQUE, and this person may well have used the bot before — that is the
    // normal case, not an error. Reuse their row instead of failing the sign-up.
    const existing = await env.DB
      .prepare("SELECT id FROM users WHERE telegram_id = ? LIMIT 1")
      .bind(verifiedTelegramId)
      .first<{ id: number }>();

    if (existing?.id) {
      userId = Number(existing.id);
      // They picked a language on the website just now; that is more current than whatever
      // the bot recorded whenever they last used it.
      await env.DB.prepare("UPDATE users SET language = ? WHERE id = ?").bind(language, userId).run().catch(() => undefined);
    } else {
      const res = await env.DB
        .prepare("INSERT INTO users (telegram_id, language) VALUES (?, ?)")
        .bind(verifiedTelegramId, language)
        .run()
        .catch(() => null);
      userId = Number(res?.meta.last_row_id ?? 0);
    }
  }

  // No verified Telegram account — the demo path with verification switched off. Falls back
  // to a synthetic NEGATIVE id, since real Telegram ids are positive and the column is
  // NOT NULL UNIQUE. Such a business cannot be managed from the bots.
  for (let attempt = 0; attempt < 4 && !userId; attempt += 1) {
    const syntheticTelegramId = -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
    try {
      const res = await env.DB
        .prepare("INSERT INTO users (telegram_id, language) VALUES (?, ?)")
        .bind(syntheticTelegramId, language)
        .run();
      userId = Number(res.meta.last_row_id ?? 0);
    } catch {
      userId = 0;
    }
  }
  if (!userId) {
    return json({ error: "Could not create the account. Please try again." }, { status: 500, headers: SIGNUP_CORS });
  }

  const signupToday = getTodayIso(env.APP_TIMEZONE || "UTC");

  // The slug is claimed in the INSERT, not in the credentials UPDATE below, so the
  // partial unique index rejects a concurrent duplicate atomically. Losing that race
  // after the row exists would leave an orphaned business.
  let insertBiz;
  try {
    insertBiz = await env.DB
      // The free month starts the day they sign up, in the shop's timezone rather than UTC -
      // a trial that begins at 5am local because the server said midnight is off by a day for
      // anyone who signs up in the evening.
      .prepare(
        `INSERT INTO businesses (user_id, name, type, address, phone, schedule, slug, plan, plan_started_at, plan_expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'trial', ?, ?)`
      )
      .bind(
        userId,
        name,
        type,
        address,
        storedPhone,
        "09:00 - 19:00",
        slug,
        signupToday,
        addDays(signupToday, TRIAL_DAYS)
      )
      .run();
  } catch (error) {
    // Someone claimed this slug between the check above and here. Undo both writes so
    // the visitor can just pick another subdomain instead of re-verifying in Telegram.
    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run().catch(() => undefined);
    await releaseVerification(env.DB, String(input.verificationNonce ?? ""));
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      return json({ error: "That subdomain is already taken.", code: "slug_taken" }, { status: 409, headers: SIGNUP_CORS });
    }
    throw error;
  }
  const businessId =
    Number(insertBiz.meta.last_row_id ?? 0) ||
    Number((await env.DB.prepare("SELECT id FROM businesses WHERE user_id = ? LIMIT 1").bind(userId).first<{ id: number }>())?.id ?? 0);
  if (!businessId) {
    return json({ error: "The business was created but could not be loaded." }, { status: 500, headers: SIGNUP_CORS });
  }

  const base = normalizeCrmUsernameBase(name);
  let username = `${base}_${businessId}`;
  for (let suffix = 1; await crmUsernameExists(env.DB, username); suffix += 1) {
    username = `${base}_${businessId}_${suffix}`;
  }
  const tempPassword = generateCrmTempPassword();
  const passwordHash = await hashCrmPassword(tempPassword);
  await env.DB
    .prepare(
      "UPDATE businesses SET crm_username = ?, crm_password_hash = ?, crm_temp_password_pending = 1, crm_credentials_updated_at = datetime('now') WHERE id = ?"
    )
    .bind(username, passwordHash, businessId)
    .run();

  return json(
    {
      ok: true,
      username,
      password: tempPassword,
      businessName: name,
      slug,
      crmUrl: tenantOrigin(slug, env),
    },
    { status: 201, headers: SIGNUP_CORS }
  );
}

// Public feedback endpoints — called cross-origin by the static landing page. GET is read-only
// (approved rows only); POST stores a submission for moderation (approved = 0 until reviewed).
const FEEDBACK_CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

type FeedbackInput = { name?: string; text?: string; rating?: number | null };
type FeedbackRow = { id: number; name: string; text: string; rating: number | null; created_at: string };

async function submitFeedback(env: Env, request: Request) {
  // Unauthenticated and uncaptcha'd. Rows land with approved = 0 so nothing reaches the public
  // page, which means the damage was never publication — it was drowning the moderation queue.
  await requireUnderRateLimit(env, request, LIMITS.feedback, undefined, FEEDBACK_CORS);

  const input = (await request.json().catch(() => ({}))) as FeedbackInput;
  const name = (input.name ?? "").trim().slice(0, 80);
  const text = (input.text ?? "").trim().slice(0, 1000);
  let rating: number | null = null;
  if (typeof input.rating === "number" && input.rating >= 1 && input.rating <= 5) {
    rating = Math.round(input.rating);
  }

  if (name.length < 2) {
    return json({ error: "Name is required." }, { status: 400, headers: FEEDBACK_CORS });
  }
  if (text.length < 2) {
    return json({ error: "Feedback text is required." }, { status: 400, headers: FEEDBACK_CORS });
  }

  const res = await env.DB
    .prepare("INSERT INTO landing_feedback (name, text, rating) VALUES (?, ?, ?)")
    .bind(name, text, rating)
    .run();

  return json({ ok: true, id: Number(res.meta.last_row_id ?? 0) }, { status: 201, headers: FEEDBACK_CORS });
}

async function listFeedback(env: Env) {
  const res = await env.DB
    .prepare("SELECT id, name, text, rating, created_at FROM landing_feedback WHERE approved = 1 ORDER BY created_at DESC, id DESC LIMIT 20")
    .all<FeedbackRow>();
  return json({ items: res.results ?? [] }, { headers: FEEDBACK_CORS });
}

/** Shared with updateBusinessCredentials so both paths agree on what counts as a password. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Change your OWN password. Self-service, so it needs no capability — every role may do
 * this for themselves, and only for themselves.
 *
 * This exists because staff previously had no way to change their password at all:
 * updateBusinessCredentials writes to `businesses` and requires credentials:write, so a
 * staff member was stuck on the owner-issued temporary password indefinitely and the
 * plaintext copy in crm_temp_password was never cleared.
 *
 * The target row comes from the ACTOR, never from the request body. There is deliberately
 * no staffId parameter — with one, this would become an account-takeover endpoint.
 */
async function changeOwnPassword(
  env: Env,
  request: Request,
  actor: Actor,
  input: { currentPassword?: string; newPassword?: string }
) {
  const currentPassword = String(input.currentPassword ?? "");
  // Not trimmed: whitespace is a legal password character, and trimming here would store
  // something different from what was validated — and from what the person typed.
  const newPassword = String(input.newPassword ?? "");

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return json(
      { error: `Новый пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`, code: "password_too_short" },
      { status: 400 }
    );
  }

  if (newPassword === currentPassword) {
    return json({ error: "Новый пароль должен отличаться от текущего.", code: "password_unchanged" }, { status: 400 });
  }

  const nextHash = await hashCrmPassword(newPassword);

  if (actor.role === "owner") {
    if (!(await verifyCrmPassword(currentPassword, actor.business.crm_password_hash))) {
      return json({ error: "Текущий пароль указан неверно.", code: "wrong_password" }, { status: 400 });
    }

    // Bumping session_version retires every cookie minted before now, which is the point:
    // other devices, and anyone holding a stolen session, are signed out.
    await env.DB
      .prepare(
        `UPDATE businesses
         SET crm_password_hash = ?, crm_temp_password_pending = 0, session_version = session_version + 1,
             crm_credentials_updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(nextHash, actor.business.id)
      .run();

    const refreshed = await getBusinessById(env.DB, actor.business.id);
    if (!refreshed) {
      return json({ error: "Не удалось перечитать бизнес после смены пароля." }, { status: 500 });
    }

    // ...including the cookie in THIS request, so it has to be re-issued or the person who
    // just changed their password would be the first one logged out.
    const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
      businessId: refreshed.id,
      username: refreshed.crm_username ?? "",
      role: "owner",
      sessionVersion: Number(refreshed.session_version ?? 0),
    });

    return json({ ok: true, session: toAuthSession(refreshed) }, { headers: { "set-cookie": cookie } });
  }

  // Staff: the hash is re-read here rather than carried on the Actor, because Actor holds
  // only what authorization needs and a stale hash would let an old password keep working.
  const member = await env.DB
    .prepare("SELECT id, name, crm_username, crm_password_hash FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(actor.staffId, actor.business.id)
    .first<{ id: number; name: string; crm_username: string | null; crm_password_hash: string | null }>();

  if (!member) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  if (!(await verifyCrmPassword(currentPassword, member.crm_password_hash))) {
    return json({ error: "Текущий пароль указан неверно.", code: "wrong_password" }, { status: 400 });
  }

  // Clearing crm_temp_password is the point: it is the plaintext the owner read out, and
  // it should not outlive the moment the person picks their own.
  await env.DB
    .prepare(
      `UPDATE staff
       SET crm_password_hash = ?, crm_temp_password_pending = 0, session_version = session_version + 1,
           access_updated_at = datetime('now')
       WHERE id = ? AND business_id = ?`
    )
    .bind(nextHash, member.id, actor.business.id)
    .run();

  const bumped = await env.DB
    .prepare("SELECT session_version FROM staff WHERE id = ? LIMIT 1")
    .bind(member.id)
    .first<{ session_version: number }>();

  // Re-issued for the same reason as the owner path: the bump above invalidated this
  // request's own cookie too.
  const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
    businessId: actor.business.id,
    username: member.crm_username ?? "",
    role: actor.role,
    staffId: member.id,
    sessionVersion: Number(bumped?.session_version ?? 0),
  });

  return json(
    {
      ok: true,
      session: {
        ...toAuthSession(actor.business),
        username: member.crm_username ?? "",
        isTemporaryPassword: false,
        role: actor.role,
        staffId: member.id,
        staffName: member.name,
      } satisfies AuthSession,
    },
    { headers: { "set-cookie": cookie } }
  );
}

async function updateBusinessCredentials(env: Env, request: Request, business: BusinessRow, input: UpdateCrmCredentialsInput) {
  const username = normalizeCrmUsername(input.username ?? "");
  const currentPassword = String(input.currentPassword ?? "");
  const newPassword = input.newPassword?.trim();

  if (!isValidCrmUsername(username)) {
    return json(
      {
        error: "Логин должен быть длиной 4-32 символа и содержать только латинские буквы, цифры, точку, дефис или подчёркивание.",
      },
      { status: 400 }
    );
  }

  if (!(await verifyCrmPassword(currentPassword, business.crm_password_hash))) {
    return json({ error: "Текущий пароль указан неверно." }, { status: 400 });
  }

  const usernameOwner = await env.DB
    .prepare("SELECT id FROM businesses WHERE crm_username = ? AND id != ? LIMIT 1")
    .bind(username, business.id)
    .first<{ id: number }>();

  if (usernameOwner?.id) {
    return json({ error: "Такой логин уже занят другим бизнесом." }, { status: 400 });
  }

  let nextPasswordHash = business.crm_password_hash;
  // Carries the FLAG forward, not a plaintext password. Setting a password of your own is
  // exactly what stops it being a temporary one, so this clears; changing only the username
  // leaves it as it was.
  let nextTempPending = Number(business.crm_temp_password_pending) ? 1 : 0;

  if (newPassword) {
    if (newPassword.length < 8) {
      return json({ error: "Новый пароль должен содержать минимум 8 символов." }, { status: 400 });
    }

    nextPasswordHash = await hashCrmPassword(newPassword);
    nextTempPending = 0;
  }

  if (username === business.crm_username && !newPassword) {
    return json({ error: "Измените логин или задайте новый пароль." }, { status: 400 });
  }

  await env.DB
    .prepare(
      `UPDATE businesses
       SET crm_username = ?, crm_password_hash = ?, crm_temp_password_pending = ?,
           session_version = session_version + CASE WHEN ? THEN 1 ELSE 0 END,
           crm_credentials_updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(username, nextPasswordHash, nextTempPending, newPassword ? 1 : 0, business.id)
    .run();

  const refreshed = await getBusinessById(env.DB, business.id);
  if (!refreshed) {
    return json({ error: "Не удалось перечитать бизнес после обновления данных доступа." }, { status: 500 });
  }

  // Carries the post-bump version so this session survives its own password change.
  const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
    businessId: refreshed.id,
    username: refreshed.crm_username ?? username,
    role: "owner",
    sessionVersion: Number(refreshed.session_version ?? 0),
  });

  return json(
    {
      ok: true,
      session: toAuthSession(refreshed),
    },
    {
      headers: {
        "set-cookie": cookie,
      },
    }
  );
}

async function normalizeStaffIdsForBusiness(db: D1Database, businessId: number, staffIds: number[] | undefined) {
  const normalized = Array.from(
    new Set(
      (staffIds ?? [])
        .map((staffId) => Number(staffId))
        .filter((staffId) => Number.isInteger(staffId) && staffId > 0)
    )
  );

  if (normalized.length === 0) {
    return [];
  }

  const placeholders = normalized.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT id FROM staff WHERE business_id = ? AND id IN (${placeholders})`)
    .bind(businessId, ...normalized)
    .all<{ id: number }>();

  const existingIds = new Set((rows.results ?? []).map((row) => Number((row as { id: number }).id)));
  if (normalized.some((staffId) => !existingIds.has(staffId))) {
    return null;
  }

  return normalized;
}

async function replaceServiceBindings(db: D1Database, serviceId: number, staffIds: number[]) {
  await db.prepare("DELETE FROM staff_services WHERE service_id = ?").bind(serviceId).run();

  for (const staffId of staffIds) {
    await db
      .prepare("INSERT OR IGNORE INTO staff_services (staff_id, service_id) VALUES (?, ?)")
      .bind(staffId, serviceId)
      .run();
  }
}

async function getCrmPayload(env: Env, business: BusinessRow, selectedDate: string): Promise<CrmPayload> {
  const weekday = new Date(`${selectedDate}T00:00:00`).getDay();

  // Which images this business has, WITHOUT reading any blob — the ids alone answer "show a
  // photo or fall back to initials?", and pulling the bytes into every payload would put a
  // logo and a photo per specialist on the wire on every poll.
  const imageIds = await storedImageIds(env, business.id);
  const serviceImageIds = await storedServiceImageIds(env, business.id);

  const [servicesRes, staffRes, staffServicesRes, staffSlotsRes, staffUnavailabilityRes, bookingsRes, paymentsRes, bookingServicesRes] =
    await Promise.all([
    env.DB
      .prepare(
        "SELECT id, business_id, name, category, price, duration, is_active FROM services WHERE business_id = ? ORDER BY is_active DESC, name ASC"
      )
      .bind(business.id)
      .all<ServiceRow>(),
    env.DB
      .prepare("SELECT id, business_id, name, role, phone, photo_file_id, crm_username, crm_temp_password_pending, access_role, access_enabled FROM staff WHERE business_id = ? ORDER BY name ASC")
      .bind(business.id)
      .all<StaffRow>(),
    env.DB
      .prepare(
        `SELECT ss.staff_id, ss.service_id, st.name AS staff_name, s.name AS service_name, s.is_active AS service_active
         FROM staff_services ss
         INNER JOIN services s ON s.id = ss.service_id
         INNER JOIN staff st ON st.id = ss.staff_id
         WHERE st.business_id = ?
         ORDER BY s.name ASC, st.name ASC`
      )
      .bind(business.id)
      .all<StaffServiceRow>(),
    env.DB
      .prepare(
        `SELECT id, staff_id, weekday, slot_time
         FROM staff_slots
         WHERE staff_id IN (SELECT id FROM staff WHERE business_id = ?)
         ORDER BY weekday ASC, slot_time ASC`
      )
      .bind(business.id)
      .all<StaffSlotRow>(),
    env.DB
      .prepare(
        `SELECT id, staff_id, kind, weekday, date, slot_time, is_full_day
         FROM staff_unavailability
         WHERE staff_id IN (SELECT id FROM staff WHERE business_id = ?)
         ORDER BY date ASC, weekday ASC, slot_time ASC`
      )
      .bind(business.id)
      .all<StaffUnavailabilityRow>(),
    env.DB
      .prepare(
        `SELECT id, business_id, user_id, service_id, staff_id, client_name, client_phone, service_name, staff_name, datetime, status, price_snapshot, duration_snapshot, notes
         FROM bookings
         WHERE business_id = ?
         ORDER BY datetime DESC`
      )
      .bind(business.id)
      .all<BookingRow>(),
    env.DB
      .prepare(
        `SELECT id, booking_id, business_id, staff_id, amount, method, flow, note, created_at
         FROM payments
         WHERE business_id = ?
         ORDER BY created_at DESC, id DESC`
      )
      .bind(business.id)
      .all<PaymentRow>(),
    // The lines behind a multi-service booking. These were being WRITTEN and never read, so a
    // two-service visit showed up everywhere as "Haircut +1" — the summary string — and the
    // second service was invisible to the owner who has to perform it.
    //
    // Joined through `bookings` rather than trusting a business_id on the line, because the
    // line table does not carry one: the booking owns the tenancy and duplicating it would be
    // a second place for it to be wrong.
    env.DB
      .prepare(
        `SELECT bs.booking_id, bs.service_id, bs.service_name, bs.price, bs.duration
         FROM booking_services bs
         JOIN bookings b ON b.id = bs.booking_id
         WHERE b.business_id = ?
         ORDER BY bs.booking_id ASC, bs.position ASC`
      )
      .bind(business.id)
      .all<BookingServiceRow>()
      // Older deployments may not have the table yet, and a missing one must not take the whole
      // CRM payload down — the summary string still renders, just without the breakdown.
      .catch(() => ({ results: [] as BookingServiceRow[] })),
    ]);

  const services = (servicesRes.results ?? []) as unknown as ServiceRow[];
  const staff = (staffRes.results ?? []) as unknown as StaffRow[];
  const staffServices = (staffServicesRes.results ?? []) as unknown as StaffServiceRow[];
  const staffSlots = (staffSlotsRes.results ?? []) as unknown as StaffSlotRow[];
  const staffUnavailability = (staffUnavailabilityRes.results ?? []) as unknown as StaffUnavailabilityRow[];
  const bookings = (bookingsRes.results ?? []) as unknown as BookingRow[];
  const payments = (paymentsRes.results ?? []) as unknown as PaymentRow[];

  // booking id -> its lines, in the order they were chosen.
  const linesByBooking = new Map<number, BookingServiceLine[]>();
  for (const row of (bookingServicesRes.results ?? []) as unknown as BookingServiceRow[]) {
    const list = linesByBooking.get(row.booking_id) ?? [];
    list.push({
      serviceId: row.service_id,
      name: row.service_name,
      price: Number(row.price || 0),
      duration: Number(row.duration || 0),
    });
    linesByBooking.set(row.booking_id, list);
  }

  /**
   * The lines for a booking, or one line synthesised from the booking's own columns.
   *
   * The fallback is what keeps every caller free of "might be empty" branches. It fires for a
   * booking written by either Telegram bot: those repos deploy separately and still insert a
   * single service straight onto `bookings`, with no lines at all.
   */
  const servicesFor = (booking: BookingRow): BookingServiceLine[] =>
    linesByBooking.get(booking.id) ?? [
      {
        serviceId: booking.service_id,
        name: booking.service_name,
        price: Number(booking.price_snapshot || 0),
        duration: Number(booking.duration_snapshot || 60),
      },
    ];

  const servicesByStaff = new Map<number, string[]>();
  for (const row of staffServices) {
    if (Number(row.service_active) !== 1) continue;
    const list = servicesByStaff.get(row.staff_id) ?? [];
    list.push(row.service_name);
    servicesByStaff.set(row.staff_id, list);
  }

  const staffIdsByService = new Map<number, number[]>();
  const staffNamesByService = new Map<number, string[]>();
  for (const row of staffServices) {
    const idList = staffIdsByService.get(row.service_id) ?? [];
    if (!idList.includes(row.staff_id)) {
      idList.push(row.staff_id);
      staffIdsByService.set(row.service_id, idList);
    }

    const nameList = staffNamesByService.get(row.service_id) ?? [];
    if (!nameList.includes(row.staff_name)) {
      nameList.push(row.staff_name);
      staffNamesByService.set(row.service_id, nameList);
    }
  }

  const slotsByStaff = new Map<number, StaffSlotRow[]>();
  for (const slot of staffSlots) {
    const list = slotsByStaff.get(slot.staff_id) ?? [];
    list.push(slot);
    slotsByStaff.set(slot.staff_id, list);
  }

  const weeklyBreaksByStaff = new Map<number, Map<number, string[]>>();
  const dayOffsByStaff = new Map<number, Map<string, { isFullDay: boolean; slots: string[] }>>();

  for (const entry of staffUnavailability) {
    if (entry.date) {
      const byDate = dayOffsByStaff.get(entry.staff_id) ?? new Map<string, { isFullDay: boolean; slots: string[] }>();
      const current = byDate.get(entry.date) ?? { isFullDay: false, slots: [] };
      if (Number(entry.is_full_day) === 1) {
        current.isFullDay = true;
        current.slots = [];
      } else if (entry.slot_time && !current.isFullDay && !current.slots.includes(entry.slot_time)) {
        current.slots.push(entry.slot_time);
      }
      byDate.set(entry.date, current);
      dayOffsByStaff.set(entry.staff_id, byDate);
      continue;
    }

    if (entry.weekday == null || !entry.slot_time) continue;
    const byWeekday = weeklyBreaksByStaff.get(entry.staff_id) ?? new Map<number, string[]>();
    const current = byWeekday.get(entry.weekday) ?? [];
    if (!current.includes(entry.slot_time)) {
      current.push(entry.slot_time);
    }
    byWeekday.set(entry.weekday, current);
    weeklyBreaksByStaff.set(entry.staff_id, byWeekday);
  }

  const paymentsByBooking = new Map<number, PaymentRow[]>();
  for (const payment of payments) {
    const list = paymentsByBooking.get(payment.booking_id) ?? [];
    list.push(payment);
    paymentsByBooking.set(payment.booking_id, list);
  }

  const paymentSummaryByBooking = new Map<number, PaymentSummary>();
  for (const booking of bookings) {
    paymentSummaryByBooking.set(
      booking.id,
      summarizePayments(Number(booking.price_snapshot || 0), paymentsByBooking.get(booking.id) ?? [])
    );
  }

  const bookingsToday = bookings
    .filter((booking) => getDatePart(booking.datetime) === selectedDate)
    .sort((a, b) => a.datetime.localeCompare(b.datetime));

  const completedToday = bookingsToday.filter((booking) => booking.status === "done");
  const paymentsToday = sumPaymentsInRange(payments, (payment) => getDatePart(payment.created_at) === selectedDate);
  const paymentsMonth = sumPaymentsInRange(payments, (payment) => payment.created_at.startsWith(selectedDate.slice(0, 7)));
  const paymentsAll = sumPaymentsInRange(payments, () => true);
  const dayRevenue = paymentsToday.incoming - paymentsToday.outgoing;
  const totalRevenue = paymentsAll.incoming - paymentsAll.outgoing;
  const monthRevenue = paymentsMonth.incoming - paymentsMonth.outgoing;
  const totalOutstanding = bookings
    .filter((booking) => booking.status !== "cancelled")
    .reduce((sum, booking) => sum + Math.max(paymentSummaryByBooking.get(booking.id)?.remaining ?? booking.price_snapshot, 0), 0);

  const calendarColumns: CalendarStaffColumn[] = staff.map((person) => {
    const serviceNames = servicesByStaff.get(person.id) ?? [];
    const rawDaySlots = (slotsByStaff.get(person.id) ?? []).filter((slot) => slot.weekday === weekday);
    const dayOff = dayOffsByStaff.get(person.id)?.get(selectedDate);
    // Shared with the public booking API so the two can never disagree about what is
    // open — see src/shared/availability.ts.
    const openTimes = new Set(
      openShiftSlots({
        shiftSlots: rawDaySlots.map((slot) => slot.slot_time),
        weeklyBreaks: weeklyBreaksByStaff.get(person.id)?.get(weekday) ?? [],
        dayOff,
      })
    );
    const daySlots = rawDaySlots.filter((slot) => openTimes.has(slot.slot_time));
    const staffBookingsToday = bookingsToday.filter((booking) => booking.staff_id === person.id && booking.status !== "cancelled");
    const completedRevenue = staffBookingsToday.reduce(
      (sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0),
      0
    );

    return {
      id: person.id,
      name: person.name,
      // Role, or "" — never a server-side default. This used to return the Russian
      // "Выходной"/"Специалист", which the UI printed verbatim to Uzbek owners; the
      // day-off state is already carried by an empty slots array.
      role: person.role?.trim() || serviceNames[0] || "",
      serviceNames,
      slots: daySlots.map((slot) => ({ id: slot.id, time: slot.slot_time })),
      utilization: daySlots.length > 0 ? Math.round((staffBookingsToday.length / daySlots.length) * 100) : 0,
      completedRevenue,
    };
  });

  const bookingsWithoutStaff = bookingsToday.filter((booking) => booking.staff_id == null);
  if (bookingsWithoutStaff.length > 0) {
    calendarColumns.push({
      id: 0,
      // Empty, not Russian prose. Same rule as `role` above, and the same reason: an Uzbek
      // owner with an unassigned booking got a calendar column headed "Без сотрудника".
      //
      // `id: 0` is what identifies this column, so the client names it — see t.cal.noStaff.
      name: "",
      role: "",
      serviceNames: [],
      slots: [],
      utilization: 0,
      completedRevenue: bookingsWithoutStaff.reduce(
        (sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0),
        0
      ),
    });
  }

  const calendarBookings: CalendarBookingCard[] = bookingsToday.map((booking) => ({
    id: booking.id,
    clientName: booking.client_name,
    serviceName: booking.service_name,
    services: servicesFor(booking),
    staffName: booking.staff_name,
    date: getDatePart(booking.datetime),
    time: getTimePart(booking.datetime),
    datetime: booking.datetime,
    status: booking.status,
    price: Number(booking.price_snapshot || 0),
    duration: Number(booking.duration_snapshot || 60),
    userId: booking.user_id,
    payment: paymentSummaryByBooking.get(booking.id)!,
    staffId: booking.staff_id,
    serviceId: booking.service_id,
    color: CARD_COLORS[(booking.staff_id ?? booking.id) % CARD_COLORS.length],
  }));

  const reservationsToday = bookingsToday.map((booking) => ({
    id: booking.id,
    clientName: booking.client_name,
    serviceName: booking.service_name,
    services: servicesFor(booking),
    staffName: booking.staff_name,
    date: getDatePart(booking.datetime),
    time: getTimePart(booking.datetime),
    datetime: booking.datetime,
    status: booking.status,
    price: Number(booking.price_snapshot || 0),
    duration: Number(booking.duration_snapshot || 60),
    userId: booking.user_id,
    payment: paymentSummaryByBooking.get(booking.id)!,
  }));

  const employees: EmployeeRow[] = staff.map((person) => {
    const serviceNames = servicesByStaff.get(person.id) ?? [];
    const weeklySlots = Array.from({ length: 7 }, (_, dayIndex) => ({
      weekday: dayIndex,
      label: WEEKDAY_LABELS[dayIndex],
      slots: (slotsByStaff.get(person.id) ?? [])
        .filter((slot) => slot.weekday === dayIndex)
        .map((slot) => slot.slot_time),
    }));
    const weeklyBreaks = Array.from({ length: 7 }, (_, dayIndex) => ({
      weekday: dayIndex,
      label: WEEKDAY_LABELS[dayIndex],
      slots: [...(weeklyBreaksByStaff.get(person.id)?.get(dayIndex) ?? [])].sort(),
    }));
    const dayOffs = Array.from(dayOffsByStaff.get(person.id)?.entries() ?? [])
      .map(([date, value]) => ({
        date,
        isFullDay: value.isFullDay,
        slots: [...value.slots].sort(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const relevantBookings = bookings.filter((booking) => booking.staff_id === person.id);
    const todayEmployeeBookings = bookingsToday.filter((booking) => booking.staff_id === person.id && booking.status !== "cancelled");
    const upcomingBookings = bookings.filter(
      (booking) =>
        booking.staff_id === person.id &&
        booking.status !== "cancelled" &&
        booking.datetime >= `${selectedDate} 00:00:00`
    ).length;
    const todayAvailableSlotCount = openShiftSlots({
      shiftSlots: weeklySlots[weekday].slots,
      weeklyBreaks: weeklyBreaksByStaff.get(person.id)?.get(weekday) ?? [],
      dayOff: dayOffsByStaff.get(person.id)?.get(selectedDate),
    }).length;

    return {
      id: person.id,
      name: person.name,
      role: person.role?.trim() || serviceNames[0] || "",
      phone: person.phone,
      // A flag, not an id. Either store counts; the CRM asks /api/staff/<id>/photo for bytes.
      hasPhoto: imageIds.has(person.id) || Boolean(person.photo_file_id),
      // Same cache-busting as services. Null for a photo that lives in Telegram rather than
      // crm_images — that one cannot change without an upload, which writes a row here anyway.
      photoVersion: imageIds.get(person.id) ?? null,
      linkedServices: serviceNames,
      totalLinkedServices: serviceNames.length,
      weeklySlotCount: weeklySlots.reduce((sum, day) => sum + day.slots.length, 0),
      todayBookings: todayEmployeeBookings.length,
      upcomingBookings,
      completedRevenue: relevantBookings.reduce((sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0), 0),
      todayRevenue: todayEmployeeBookings.reduce((sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0), 0),
      outstandingRevenue: relevantBookings.reduce(
        (sum, booking) => sum + Math.max(paymentSummaryByBooking.get(booking.id)?.remaining ?? booking.price_snapshot, 0),
        0
      ),
      utilization: todayAvailableSlotCount > 0 ? Math.round((todayEmployeeBookings.length / todayAvailableSlotCount) * 100) : 0,
      weeklySlots,
      weeklyBreaks,
      dayOffs,
    };
  });

  const servicesCatalog: ServiceCatalogItem[] = services.map((service) => {
    const serviceBookings = bookings.filter((booking) => booking.service_id === service.id);

    return {
      id: service.id,
      name: service.name,
      // "" rather than null, so the UI never has to decide what a missing category means.
      category: service.category?.trim() || "",
      price: Number(service.price || 0),
      duration: Number(service.duration || 0),
      isActive: Number(service.is_active) === 1,
      hasPhoto: serviceImageIds.has(service.id),
      // When it was last written. Goes into the <img> URL so replacing a picture is a NEW url
      // and the browser cannot serve the old one from cache.
      photoVersion: serviceImageIds.get(service.id) ?? null,
      linkedStaffIds: staffIdsByService.get(service.id) ?? [],
      linkedStaffNames: staffNamesByService.get(service.id) ?? [],
      bookingsCount: serviceBookings.length,
      upcomingBookings: serviceBookings.filter(
        (booking) =>
          booking.status !== "cancelled" && booking.datetime >= `${selectedDate} 00:00:00`
      ).length,
      completedRevenue: serviceBookings.reduce(
        (sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0),
        0
      ),
    };
  });

  const clientsMap = new Map<string, ClientRow>();
  for (const booking of bookings) {
    // Identity is the PHONE where there is one. Keying on user_id or name split the same
    // person into several clients the moment they booked once on the web and once by
    // phone — different user_id, or a name typed slightly differently. The number is the
    // one thing that stays the same, and it is stored canonically so it compares cleanly.
    //
    // Telegram bookings carry no phone (the bots do not populate the column), so they
    // still key on user_id and will not merge with a web booking by the same person.
    // Closing that needs the bots to record a phone.
    const key = booking.client_phone
      ? `phone:${booking.client_phone}`
      : booking.user_id
        ? `user:${booking.user_id}`
        : `name:${booking.client_name}`;
    const existing = clientsMap.get(key) ?? {
      key,
      name: booking.client_name,
      userId: booking.user_id,
      phone: booking.client_phone,
      totalVisits: 0,
      completedVisits: 0,
      upcomingVisits: 0,
      cancelledVisits: 0,
      spentTotal: 0,
      lastVisit: null,
      favoriteStaff: "—",
      history: [],
    };

    // Bookings arrive newest-first, so an existing entry already holds the most recent
    // spelling of the name; only fill a blank phone from an older row.
    if (!existing.phone && booking.client_phone) existing.phone = booking.client_phone;

    existing.totalVisits += 1;
    if (booking.status === "done") {
      existing.completedVisits += 1;
      existing.spentTotal += Math.max(paymentSummaryByBooking.get(booking.id)?.net ?? 0, 0);
    }
    if (booking.status === "cancelled") {
      existing.cancelledVisits += 1;
    }
    if ((booking.status === "pending" || booking.status === "confirmed") && booking.datetime >= `${selectedDate} 00:00:00`) {
      existing.upcomingVisits += 1;
    }
    if (!existing.lastVisit || booking.datetime > existing.lastVisit) {
      existing.lastVisit = booking.datetime;
    }

    existing.history.push({
      id: booking.id,
      businessName: business.name,
      clientName: booking.client_name,
      serviceName: booking.service_name,
      services: servicesFor(booking),
      staffName: booking.staff_name,
      staffId: booking.staff_id,
      date: getDatePart(booking.datetime),
      time: getTimePart(booking.datetime),
      datetime: booking.datetime,
      status: booking.status,
      price: Number(booking.price_snapshot || 0),
      duration: Number(booking.duration_snapshot || 60),
      userId: booking.user_id,
      payment: paymentSummaryByBooking.get(booking.id)!,
    } satisfies ClientHistoryItem);

    clientsMap.set(key, existing);
  }

  const clients = Array.from(clientsMap.values())
    .map((client) => {
      const staffCount = new Map<string, number>();
      for (const history of client.history) {
        const count = staffCount.get(history.staffName) ?? 0;
        staffCount.set(history.staffName, count + 1);
      }

      const favoriteStaff =
        Array.from(staffCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

      return {
        ...client,
        favoriteStaff,
        history: client.history.sort((a, b) => b.datetime.localeCompare(a.datetime)),
      };
    })
    .sort((a, b) => b.spentTotal - a.spentTotal || a.name.localeCompare(b.name));

  const employeeRevenue: EmployeeRevenueItem[] = employees
    .map((employee) => ({
      staffId: employee.id,
      staffName: employee.name,
      revenue: employee.completedRevenue,
      completedVisits: bookings.filter((booking) => booking.staff_id === employee.id && booking.status === "done").length,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const kpis: KpiCard[] = [
    {
      id: "today-visits",
      labelKey: "todayVisits",
      value: String(reservationsToday.length),
      hintValues: [completedToday.length],
      tone: "sun",
    },
    {
      id: "today-revenue",
      labelKey: "todayRevenue",
      value: formatMoney(dayRevenue),
      hintValues: [formatMoney(paymentsToday.outgoing)],
      tone: "mint",
    },
    {
      id: "month-revenue",
      labelKey: "monthRevenue",
      value: formatMoney(monthRevenue),
      hintValues: [],
      tone: "sky",
    },
    {
      id: "outstanding",
      labelKey: "outstanding",
      value: formatMoney(totalOutstanding),
      hintValues: [employees.length, services.filter((service) => Number(service.is_active) === 1).length],
      tone: "ink",
    },
  ];

  const clientBot = env.CLIENT_BOT_USERNAME || "easyqueue_client_bot";
  const businessBot = env.BUSINESS_BOT_USERNAME || "easyqueue_business_bot";

  // Titles are i18n KEYS, not text. This payload previously carried Russian strings that
  // the UI rendered verbatim, so an Uzbek owner saw "Общая ссылка для клиентов".
  //
  // The per-employee "share this master" entries are gone. All four pointed at the same
  // generic client bot and their own description admitted the master was not preselected,
  // so they were four identical links wearing different names.
  const bookingLinks: BookingLinkItem[] = [
    // The business's own booking page — the one link actually worth sharing, because it
    // is per-tenant. Only offered once a slug exists; before that there is no such page.
    ...(business.slug
      ? [
          {
            id: "public-booking",
            titleKey: "publicBooking" as const,
            url: `${tenantOrigin(business.slug, env)}booking`,
            kind: "public" as const,
          },
        ]
      : []),
    {
      id: "client-bot",
      titleKey: "clientBot" as const,
      // Deep-linked to THIS shop, not the bare bot.
      //
      // A shop handing out `t.me/easyqueue_client_bot` was sending its customers to a directory
      // of every business on the platform, with their own somewhere in it — the one link where
      // we could not afford to make a customer go looking. `?start=` lands them on that shop's
      // card with the Book button already there.
      //
      // The slug when there is one, because it is the readable half of their own booking URL
      // and matches what they already give people; `b<id>` otherwise, which every business has.
      // Both are valid Telegram start payloads (letters, digits, hyphen, underscore).
      url: `https://t.me/${clientBot}?start=${business.slug || `b${business.id}`}`,
      kind: "public",
    },
    {
      id: "business-admin",
      titleKey: "ownerBot" as const,
      url: `https://t.me/${businessBot}`,
      kind: "admin",
    },
  ];

  return {
    business: {
      id: business.id,
      name: business.name,
      type: normalizeBusinessType(business.type) ?? business.type,
      address: business.address,
      phone: business.phone,
      schedule: business.schedule,
      description: business.description,
      // True when EITHER store has one: D1 for anything uploaded through the CRM, the old
      // Telegram file_id for a business that uploaded through the bot. The client only needs
      // "is there a logo", and it asks /api/business/photo for the bytes.
      photoFileId: imageIds.has(LOGO_STAFF_ID) ? "stored" : business.photo_file_id,
      photoFileUniqueId: business.photo_file_unique_id,
      // Normalised here, not on the client: NULL means the business predates the feature and
      // must keep the page it already had.
      bookingFlow: normalizeBookingFlow(business.booking_flow),
      crmUsername: business.crm_username,
      crmHasTemporaryPassword: Boolean(Number(business.crm_temp_password_pending)),
      brandColor: business.brand_color,
      brandTheme: parseBrandTheme(business.brand_theme),
    },
    generatedAt: new Date().toISOString(),
    selectedDate,
    miniCalendarAnchor: selectedDate,
    kpis,
    reservationsToday,
    calendar: {
      date: selectedDate,
      columns: calendarColumns,
      bookings: calendarBookings,
      dayRevenue,
      totalAppointments: reservationsToday.length,
      completedAppointments: completedToday.length,
    },
    employees,
    services: servicesCatalog,
    clients,
    analytics: {
      employeeRevenue,
      monthlyRevenue: monthRevenue,
      totalRevenue,
      collectedToday: dayRevenue,
      refundsToday: paymentsToday.outgoing,
      totalOutstanding,
      totalCompletedVisits: bookings.filter((booking) => booking.status === "done").length,
      totalCancelledVisits: bookings.filter((booking) => booking.status === "cancelled").length,
    },
    bookingLinks,
    // The subscription, resolved against TODAY IN THE SHOP'S TIMEZONE. Using UTC would end a
    // trial at five in the morning local, which is a strange time to lock somebody out.
    //
    // The recommendation is computed here rather than in the browser so the plan the owner is
    // shown is the plan the server would accept — one place to be right about team size.
    subscription: (() => {
      const state = readSubscription(business, getTodayIso(env.APP_TIMEZONE || "UTC"));
      const staffCount = staff.length;
      const suggested = recommendPlan(staffCount);
      return {
        plan: state.plan,
        active: state.active,
        onTrial: state.onTrial,
        expiresAt: state.expiresAt,
        daysLeft: state.daysLeft,
        staffCount,
        plans: PAID_PLANS.map((plan) => ({
          id: plan.id,
          maxStaff: plan.maxStaff,
          price: plan.price,
          featured: plan.featured,
          fitsTeam: planCoversStaff(plan, staffCount),
          recommended: plan.id === suggested.id,
        })),
      };
    })(),
    // Login state per staff member, for the owner's Team & access screen. Redacted for
    // everyone else in redactPayloadFor — who can sign in is not a specialist's business.
    staffAccess: staff.map((person) => ({
      staffId: person.id,
      name: person.name,
      username: person.crm_username,
      accessRole: person.access_role === "manager" ? "manager" : person.access_role === "specialist" ? "specialist" : null,
      enabled: Number(person.access_enabled) === 1,
      hasTemporaryPassword: Boolean(Number(person.crm_temp_password_pending)),
    })) satisfies StaffAccessRow[],
  };
}

/**
 * Strip a payload down to what the actor may see.
 *
 * A capability check answers "may they call this endpoint"; it says nothing about which
 * rows come back. A specialist holds crm:read because they need their own day — but the
 * unredacted payload carries every client, every colleague's revenue and the shop's
 * finances, so returning it would make the role meaningless.
 *
 * REDACTION IS KEYED ON CAPABILITIES, NOT ROLE NAMES. An earlier version early-returned
 * the whole payload for anything that was not `specialist`, which meant every field was
 * exposed to every other role by default and a manager received `staffAccess` — the login
 * username of every colleague plus a flag marking who was still on an owner-issued
 * temporary password. Gating on `can(...)` makes a new role restrictive until somebody
 * grants it the capability, rather than privileged until somebody remembers to redact.
 */
/**
 * The client book as one master sees it: only clients they have served, and for each one only
 * their own visits.
 *
 * Every total is recomputed from the filtered history rather than carried over, because the
 * totals on the full row are the client's relationship with the SHOP. Handing those to one
 * master would tell them what colleagues charged, and `favoriteStaff` would name the
 * colleague outright.
 *
 * `spentTotal` is deliberately dropped to 0 rather than re-totalled: a specialist has no
 * payment:write and their payload zeroes revenue everywhere else, so filling it in here
 * would reintroduce the money they are not supposed to see, just narrowed to one client.
 */
function clientsScopedToStaff(
  clients: CrmPayload["clients"],
  staffId: number,
  selectedDate: string
): CrmPayload["clients"] {
  const scoped: CrmPayload["clients"] = [];
  for (const client of clients) {
    const history = client.history.filter((item) => item.staffId === staffId);
    if (history.length === 0) continue;

    let completedVisits = 0;
    let cancelledVisits = 0;
    let lastVisit: string | null = null;
    for (const item of history) {
      if (item.status === "done") completedVisits += 1;
      if (item.status === "cancelled") cancelledVisits += 1;
      if (!lastVisit || item.datetime > lastVisit) lastVisit = item.datetime;
    }

    scoped.push({
      ...client,
      totalVisits: history.length,
      completedVisits,
      cancelledVisits,
      // Recounted by the same rule getCrmPayload used — still-open bookings dated from the
      // selected day on — which is why that date has to be passed in rather than guessed at.
      upcomingVisits: history.filter(
        (item) => (item.status === "pending" || item.status === "confirmed") && item.datetime >= `${selectedDate} 00:00:00`
      ).length,
      spentTotal: 0,
      lastVisit,
      favoriteStaff: "—",
      history,
    });
  }
  return scoped.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? "") || a.name.localeCompare(b.name));
}

function redactPayloadFor(actor: Actor, payload: CrmPayload): CrmPayload {
  let visible = payload;

  // ── Row scoping: a specialist sees only their own day ──────────────────────
  if (isScopedToOwnBookings(actor.role) && actor.staffId) {
    const mine = actor.staffId;
    const isMine = (staffId: number | null) => staffId === mine;

    visible = {
      ...visible,
      // Their own clients — the people who have actually sat in their chair — and nobody
      // else's. This used to be `[]` on the grounds that the client book is a business
      // asset, which is true of the WHOLE book and not of a master's own regulars: they
      // know these people by name already, and the number they need to call them back is
      // the reason to open the CRM at all.
      //
      // Each client is rebuilt from only the bookings that are this master's, not merely
      // filtered by "has one booking with me". Passing the row through intact would have
      // handed over what a colleague charged the same person, how often they see them, and
      // named that colleague in `favoriteStaff`.
      clients: clientsScopedToStaff(visible.clients, mine, visible.selectedDate),
      reservationsToday: visible.reservationsToday.filter((booking) =>
        visible.calendar.bookings.some((card) => card.id === booking.id && isMine(card.staffId))
      ),
      calendar: {
        ...visible.calendar,
        columns: visible.calendar.columns.filter((column) => column.id === mine),
        bookings: visible.calendar.bookings.filter((card) => isMine(card.staffId)),
      },
      employees: visible.employees.filter((employee) => employee.id === mine),
      // Specialists get the PUBLIC links — the shop's booking page and the client bot.
      //
      // These were withheld on the theory that sharing was the owner's job. In a barbershop it
      // is not: the master standing in front of the customer is the one who gets asked "how do
      // I book you next time", and the answer was a link only their boss could see.
      //
      // There is nothing to protect here anyway — the booking page is a public URL that anyone
      // with the address can open, and the QR code is printed on the counter.
      //
      // The ADMIN link is still withheld, and this filters on `kind` rather than listing ids so
      // a future admin link is excluded by default rather than by somebody remembering to. That
      // bot is where a business is configured; it authorises by telegram_id and would tell a
      // specialist nothing, but it is not theirs and does not belong in their CRM.
      bookingLinks: visible.bookingLinks.filter((item) => item.kind === "public"),
    };
  }

  // ── Capability gates: apply to EVERY role that lacks the capability ────────

  // Money. This used to live inside the specialist-only block above, which quietly made the
  // whole "keyed on capabilities, not role names" claim false for the figures that matter
  // most: any role that was not literally `specialist` received every KPI, the full analytics
  // block, per-employee revenue and the day's takings, whatever its capabilities said. Adding
  // a fourth role would have handed it the shop's finances by default — the exact failure the
  // comment below promises cannot happen.
  //
  // payment:write is the right capability to gate on. Someone who may not record money has no
  // use for the totals, and the two move together: the specialist payload was already zeroing
  // these, so this changes nothing for today's three roles and makes tomorrow's safe.
  if (!can(actor.role, "payment:write")) {
    visible = {
      ...visible,
      kpis: [],
      analytics: {
        employeeRevenue: [],
        monthlyRevenue: 0,
        totalRevenue: 0,
        collectedToday: 0,
        refundsToday: 0,
        totalOutstanding: 0,
        totalCompletedVisits: 0,
        totalCancelledVisits: 0,
      },
      calendar: { ...visible.calendar, dayRevenue: 0 },
      employees: visible.employees.map((employee) => ({
        ...employee,
        completedRevenue: 0,
        todayRevenue: 0,
        outstandingRevenue: 0,
      })),
    };
  }

  // Who can sign in, under what username, and who still holds a temporary password is
  // only the business of whoever can change those things.
  if (!can(actor.role, "access:manage")) {
    visible = { ...visible, staffAccess: [] };
  }

  // The owner's own login identifier. It exists in this payload solely to render the
  // owner's Settings screen; to anyone else it is half of a credential they should never
  // have been handed, and `crmHasTemporaryPassword` tells them how fresh the other half is.
  if (!can(actor.role, "credentials:write")) {
    visible = {
      ...visible,
      business: { ...visible.business, crmUsername: null, crmHasTemporaryPassword: false },
    };
  }

  return visible;
}

/**
 * Take a booking by hand — someone phones up, or a walk-in needs recording.
 *
 * Deliberately more permissive than the public endpoint, because the person entering it
 * works there and can see the room:
 *  - PAST dates are allowed. Half of what gets typed here is "she came in this morning",
 *    and refusing it would push that history out of the CRM entirely.
 *  - Availability is NOT enforced. Squeezing a regular into a full slot is a normal thing
 *    for an owner to do; the modal shows which slots are free as guidance, not as a gate.
 *  - No per-phone rate limit. That exists to stop strangers flooding a public form.
 *
 * What it keeps: everything is scoped to the actor's own business, and the service and
 * staff must belong to it — the same rule that stops one shop writing into another's book.
 */
async function createCrmBooking(env: Env, actor: Actor, input: CreateCrmBookingInput) {
  const business = actor.business;
  const clientName = String(input.clientName ?? "").trim().slice(0, 80);
  if (clientName.length < 2) {
    return json({ error: "Client name is required", code: "invalid_name" }, { status: 400 });
  }

  const date = String(input.date ?? "");
  if (!isIsoDate(date)) {
    return json({ error: "A valid date is required", code: "invalid_date" }, { status: 400 });
  }

  const time = normalizeTime(String(input.time ?? ""));
  if (!time) {
    return json({ error: "A valid time is required", code: "invalid_time" }, { status: 400 });
  }

  // Optional here, unlike the public form — a walk-in may not leave a number. But a
  // half-typed one is rejected rather than stored, or it would never match a client again.
  const rawPhone = String(input.clientPhone ?? "").trim();
  let clientPhone: string | null = null;
  if (rawPhone) {
    clientPhone = toStoragePhone(rawPhone);
    if (!clientPhone) {
      return json({ error: "Client phone number is not valid", code: "invalid_phone" }, { status: 400 });
    }
  }

  // WHO the booking lands on is decided here, not by the client.
  //
  // A specialist holds booking:create so they can take their own regulars, but they must not
  // be able to put work on a colleague's day. The staff id they send is therefore ignored
  // outright and replaced with their own — not compared to it and rejected on mismatch, which
  // would leave the endpoint one refactor away from trusting the input again.
  let targetStaffId = Number(input.staffId);
  if (isScopedToOwnBookings(actor.role)) {
    if (!actor.staffId) {
      // A scoped role with no staff row cannot own a booking, and defaulting to the sent id
      // here would hand them exactly the ability this branch exists to remove.
      return json({ error: "This login is not linked to an employee", code: "no_staff_row" }, { status: 403 });
    }
    targetStaffId = actor.staffId;
  }

  const wanted = requestedServiceIds(input);
  if (wanted.length === 0) {
    return json({ error: "Service not found", code: "invalid_service" }, { status: 400 });
  }

  // Built from the COUNT of ids, never from their values, so they stay bound parameters.
  const placeholders = wanted.map(() => "?").join(", ");
  const [serviceRows, staff] = await Promise.all([
    env.DB
      .prepare(`SELECT id, name, price, duration FROM services WHERE business_id = ? AND id IN (${placeholders})`)
      .bind(business.id, ...wanted)
      .all<{ id: number; name: string; price: number; duration: number }>(),
    env.DB
      .prepare("SELECT id, name FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
      .bind(targetStaffId, business.id)
      .first<{ id: number; name: string }>(),
  ]);

  // Same resolver the public page uses, so a basket cannot be priced one way by the booking
  // page and another by the desk. Unlike the public path this does NOT require is_active: an
  // owner recording a walk-in may well be booking something they have since archived.
  const basket = buildBasket(wanted, serviceRows.results ?? []);
  if (!basket) return json({ error: "Service not found", code: "invalid_service" }, { status: 400 });
  if (!staff) return json({ error: "Employee not found", code: "invalid_staff" }, { status: 400 });

  // 'confirmed', not 'pending': somebody at the shop just took this booking, so there is
  // nobody left to confirm it.
  const insert = await env.DB
    .prepare(
      `INSERT INTO bookings
         (business_id, user_id, service_id, staff_id, client_name, client_phone, service_name, staff_name,
          datetime, status, price_snapshot, duration_snapshot, notes)
       VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)`
    )
    .bind(
      business.id,
      // Legacy single-service columns: first service, total money and time. Both Telegram
      // bots read these by name — see migrations/2026-07-31-booking-services.sql.
      basket.primary.serviceId,
      staff.id,
      clientName,
      clientPhone,
      legacyServiceName(basket),
      staff.name,
      `${date} ${time}:00`,
      basket.totalPrice,
      basket.totalDuration || null,
      String(input.notes ?? "").trim().slice(0, 500) || null
    )
    .run();

  const bookingId = Number(insert.meta.last_row_id ?? 0);
  await writeBasketLines(env.DB, bookingId, basket);

  return json({ ok: true, bookingId }, { status: 201 });
}

async function updateBookingStatus(env: Env, actor: Actor, bookingId: number, input: UpdateBookingStatusInput) {
  const business = actor.business;
  const allowed = ["pending", "confirmed", "done", "cancelled"];
  if (!allowed.includes(input.status)) {
    return json({ error: "Invalid booking status" }, { status: 400 });
  }

  // Holding booking:status is not the same as owning the booking. Without this a
  // specialist could cancel a colleague's appointments, which the capability check alone
  // does not prevent.
  if (isScopedToOwnBookings(actor.role)) {
    const own = await env.DB
      .prepare("SELECT id FROM bookings WHERE id = ? AND business_id = ? AND staff_id = ? LIMIT 1")
      .bind(bookingId, business.id, actor.staffId)
      .first<{ id: number }>();
    if (!own) {
      return json({ error: "This booking is not yours.", code: "forbidden" }, { status: 403 });
    }
  }

  await env.DB
    .prepare(
      `UPDATE bookings
       SET status = ?,
           updated_at = datetime('now'),
           cancelled_at = CASE WHEN ? = 'cancelled' THEN datetime('now') ELSE NULL END
       WHERE id = ? AND business_id = ?`
    )
    .bind(input.status, input.status, bookingId, business.id)
    .run();

  return json({ ok: true });
}

async function createBookingPayment(env: Env, business: BusinessRow, bookingId: number, input: CreatePaymentInput) {
  const booking = await env.DB
    .prepare(
      `SELECT id, business_id, staff_id, price_snapshot
       FROM bookings
       WHERE id = ? AND business_id = ?
       LIMIT 1`
    )
    .bind(bookingId, business.id)
    .first<{ id: number; business_id: number; staff_id: number | null; price_snapshot: number }>();

  if (!booking) {
    return json({ error: "Booking not found" }, { status: 404 });
  }

  if (!["cash", "card", "transfer", "other"].includes(input.method)) {
    return json({ error: "Invalid payment method" }, { status: 400 });
  }

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return json({ error: "Payment amount must be greater than zero" }, { status: 400 });
  }

  const flow = input.flow === "out" ? "out" : "in";

  await env.DB
    .prepare(
      `INSERT INTO payments (booking_id, business_id, staff_id, amount, method, flow, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(booking.id, business.id, booking.staff_id, amount, input.method, flow, input.note ?? null)
    .run();

  return json({ ok: true }, { status: 201 });
}

/**
 * Role and phone are optional. Phone is canonicalized when it parses and rejected when
 * it is present but malformed — silently storing junk would defeat the point of having a
 * number to call.
 */
function normalizeStaffFields(input: { role?: string; phone?: string }) {
  const role = input.role === undefined ? null : input.role.trim() || null;

  if (input.phone === undefined) return { role, phone: null as string | null, error: null };
  const raw = input.phone.trim();
  if (!raw) return { role, phone: null as string | null, error: null };

  const phone = toStoragePhone(raw);
  return phone ? { role, phone, error: null } : { role, phone: null, error: "Employee phone number is not valid" };
}

async function addEmployee(env: Env, business: BusinessRow, input: AddEmployeeInput) {
  const name = input.name?.trim();
  if (!name) {
    return json({ error: "Employee name is required" }, { status: 400 });
  }

  const fields = normalizeStaffFields(input);
  if (fields.error) {
    return json({ error: fields.error }, { status: 400 });
  }

  await env.DB
    .prepare("INSERT INTO staff (business_id, name, role, phone) VALUES (?, ?, ?, ?)")
    .bind(business.id, name, fields.role, fields.phone)
    .run();
  return json({ ok: true }, { status: 201 });
}

async function updateEmployee(env: Env, business: BusinessRow, staffId: number, input: UpdateEmployeeInput) {
  const current = await env.DB
    .prepare("SELECT id, name FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, business.id)
    .first<{ id: number; name: string }>();

  if (!current) {
    return json({ error: "Employee not found" }, { status: 404 });
  }


  const name = input.name?.trim();
  if (!name) {
    return json({ error: "Employee name is required" }, { status: 400 });
  }

  const fields = normalizeStaffFields(input);
  if (fields.error) {
    return json({ error: fields.error }, { status: 400 });
  }

  // COALESCE-free on purpose: an omitted field means "clear it", which is how the modal
  // lets an owner remove a role or a phone they no longer want stored.
  await env.DB
    .prepare("UPDATE staff SET name = ?, role = ?, phone = ? WHERE id = ? AND business_id = ?")
    .bind(name, fields.role, fields.phone, staffId, business.id)
    .run();
  return json({ ok: true });
}

async function deleteEmployee(env: Env, business: BusinessRow, staffId: number) {
  const current = await env.DB
    .prepare("SELECT id FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, business.id)
    .first<{ id: number }>();

  if (!current) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  await env.DB.prepare("DELETE FROM staff WHERE id = ? AND business_id = ?").bind(staffId, business.id).run();
  return json({ ok: true });
}

async function updateBusinessProfile(env: Env, business: BusinessRow, input: UpdateBusinessProfileInput) {
  const nextName = input.name === undefined ? business.name : input.name.trim();
  const nextAddress = input.address === undefined ? business.address : input.address.trim();
  // Canonicalize only what parses as a real number, of any country. Businesses created before this
  // rule existed can hold anything, and rejecting their stored value here would lock
  // them out of editing every OTHER profile field until they retyped the phone.
  const submittedPhone = input.phone === undefined ? business.phone : input.phone.trim();
  const nextPhone = toStoragePhone(submittedPhone) ?? submittedPhone;
  const nextSchedule = input.schedule === undefined ? business.schedule : input.schedule.trim();
  const nextDescription =
    input.description === undefined ? business.description : input.description?.trim() ? input.description.trim() : null;
  const nextType = input.type === undefined ? normalizeBusinessType(business.type) ?? business.type : normalizeBusinessType(input.type);

  // Empty string clears the choice back to the easyQ default; anything unparseable is a
  // 400 rather than being silently stored and rendering as no colour at all.
  let nextBrandColor = business.brand_color;
  if (input.brandColor !== undefined) {
    const raw = String(input.brandColor ?? "").trim();
    if (!raw) {
      nextBrandColor = null;
    } else {
      nextBrandColor = normalizeBrandColor(raw);
      if (!nextBrandColor) {
        return json({ error: "Brand colour must be a hex value like #1d4ed8", code: "invalid_brand_color" }, { status: 400 });
      }
    }
  }

  // A theme carries its own accent, so saving one also writes `brand_color`: the two
  // Telegram bots and any deploy still mid-rollout read that column, and leaving it on the
  // previous accent would make the booking page and the bots disagree about the brand.
  //
  // The readability rule is normalizeBrandTheme's, which is the same function the settings
  // screen disables its save button with — a contrast check that lives only in the client
  // is not a check. It cannot be auto-corrected the way accentInk is: nudging text the
  // owner deliberately chose is a worse answer than refusing it and saying why.
  let nextBrandTheme = business.brand_theme;
  if (input.brandTheme !== undefined) {
    if (input.brandTheme === null) {
      nextBrandTheme = null;
    } else {
      const theme = normalizeBrandTheme(input.brandTheme);
      if (!theme) {
        return json(
          {
            error: "Theme colours must be hex values, and the text must reach 4.5:1 contrast against the background",
            code: "invalid_brand_theme",
          },
          { status: 400 }
        );
      }
      nextBrandTheme = serializeBrandTheme(theme);
      nextBrandColor = theme.accent;
    }
  }

  if (!nextName) {
    return json({ error: "Business name is required" }, { status: 400 });
  }

  if (!nextAddress) {
    return json({ error: "Business address is required" }, { status: 400 });
  }

  if (!nextPhone) {
    return json({ error: "Business phone is required" }, { status: 400 });
  }

  if (!nextSchedule) {
    return json({ error: "Business schedule is required" }, { status: 400 });
  }

  if (!nextType) {
    return json({ error: "Business category is invalid" }, { status: 400 });
  }

  // Normalised rather than validated-and-rejected: the three values are a closed set the UI
  // picks from, so anything else is a bug in a caller, not something an owner typed. Falling
  // back to the original flow keeps a bad request from emptying somebody's booking page.
  const nextBookingFlow: BookingFlow =
    input.bookingFlow === undefined ? normalizeBookingFlow(business.booking_flow) : normalizeBookingFlow(input.bookingFlow);

  await env.DB
    .prepare(
      `UPDATE businesses
       SET name = ?, type = ?, address = ?, phone = ?, schedule = ?, description = ?, brand_color = ?, brand_theme = ?,
           booking_flow = ?
       WHERE id = ?`
    )
    .bind(nextName, nextType, nextAddress, nextPhone, nextSchedule, nextDescription, nextBrandColor, nextBrandTheme, nextBookingFlow, business.id)
    .run();

  return json({ ok: true });
}

/**
 * Images live in D1, keyed by business and staff id (0 = the business logo).
 *
 * They used to be pushed to Telegram and referenced by file_id. That path needed a bot token
 * AND a real chat to send to — and a web-signed-up business has a synthetic negative
 * telegram_id, so there was no such chat and the upload could never succeed. See
 * migrations/2026-07-30-crm-images.sql.
 */
const LOGO_STAFF_ID = 0;

/**
 * Image bytes are stored BASE64, as text.
 *
 * A BLOB would be smaller and is the obvious choice, but D1's edges around binary are the kind
 * you only discover in production: the bind types it documents are null, Number, String, Boolean
 * and ArrayBuffer — a Uint8Array is an ArrayBufferView, not an ArrayBuffer — and on the way back
 * out a BLOB column arrives as an ARRAY OF INTEGERS, not an ArrayBuffer. Getting either end
 * wrong stores or serves something that is not an image, which is exactly what happened: the row
 * saved, the flag flipped, and the page drew a broken image.
 *
 * Base64 has one representation in both directions. Text in, text out, no library and no
 * version-dependent shape. It costs a third more space on a file already capped at 512 KB.
 *
 * The column is still declared BLOB, which needs no migration: SQLite's BLOB affinity stores
 * whatever type it is handed rather than converting, so a string stays a string.
 */
function bytesToBase64(bytes: Uint8Array): string {
  // Chunked because String.fromCharCode(...bytes) spreads every byte as an argument, and half a
  // megabyte of them overflows the call stack.
  const CHUNK = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

/**
 * Whatever D1 hands back, as bytes.
 *
 * Handles all four shapes on purpose rather than trusting one: base64 text is what this code
 * writes now, and the array/ArrayBuffer/typed-array cases cover a row written by the earlier
 * BLOB attempt so nobody has to go and delete it by hand.
 */
function storedToBytes(value: unknown): Uint8Array | null {
  if (typeof value === "string") {
    try {
      const raw = atob(value);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out.length > 0 ? out : null;
    } catch {
      return null; // not base64 — a row from the broken BLOB write
    }
  }
  if (value instanceof ArrayBuffer) return value.byteLength ? new Uint8Array(value) : null;
  if (value instanceof Uint8Array) return value.length ? value : null;
  if (Array.isArray(value)) return value.length ? new Uint8Array(value) : null;
  return null;
}

/**
 * Where an image lives: which table, and which column identifies its owner.
 *
 * Services need their own table because crm_images is keyed (business_id, staff_id) and SQLite
 * cannot alter a primary key — service 14 and staff 14 both exist, so they would overwrite each
 * other. Parameterising beats a second copy of the byte validation, which is the part that must
 * never drift between the two.
 */
type ImageStore = { table: string; ownerColumn: string };
const STAFF_IMAGES: ImageStore = { table: "crm_images", ownerColumn: "staff_id" };
const SERVICE_IMAGES: ImageStore = { table: "crm_service_images", ownerColumn: "service_id" };

/** Validate, then store. Shared by the logo, specialist photos and service pictures. */
async function storeImage(env: Env, businessId: number, staffId: number, photo: unknown, store: ImageStore = STAFF_IMAGES) {
  if (!(photo instanceof File)) {
    return json({ error: "Photo file is required" }, { status: 400 });
  }

  // On the BYTES, never on photo.name or photo.type — both come from the request.
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const check = checkImageBytes(bytes, bytes.byteLength);
  if (!check.ok) {
    return json(
      { error: IMAGE_REJECTION_MESSAGE[check.reason], code: `image_${check.reason}` },
      { status: check.reason === "too_large" ? 413 : 415 }
    );
  }

  // Tighter than the 4 MB the shared validator allows, because this row goes in D1 and gets
  // read back whole. The browser downscales to 512px before uploading, which lands far under
  // this — so hitting it means something bypassed that step.
  if (bytes.byteLength > MAX_STORED_IMAGE_BYTES) {
    // Its own message, not IMAGE_REJECTION_MESSAGE.too_large — that one names 4 MB, which is
    // the SEND cap, and would have told somebody uploading a 1 MB file that it was over 4 MB.
    //
    // Reaching this at all means the browser's downscale did not run: the UI shrinks to 512px
    // first, which lands far under this. The likeliest cause is a stale page, so the message
    // says so rather than blaming the file.
    return json(
      {
        error: "That image is too large to store (over 512 KB after processing). Reload the page and try again.",
        code: "image_over_storage_cap",
      },
      { status: 413 }
    );
  }

  await env.DB
    .prepare(
      `INSERT OR REPLACE INTO ${store.table} (business_id, ${store.ownerColumn}, content_type, bytes, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
    .bind(businessId, staffId, check.kind, bytesToBase64(bytes))
    .run();

  return json({ ok: true }, { status: 201 });
}

/** 512 KB stored. A 512px logo is a small fraction of this; D1's own blob ceiling is 2 MB. */
const MAX_STORED_IMAGE_BYTES = 512 * 1024;

async function deleteImage(env: Env, businessId: number, staffId: number, store: ImageStore = STAFF_IMAGES) {
  await env.DB
    .prepare(`DELETE FROM ${store.table} WHERE business_id = ? AND ${store.ownerColumn} = ?`)
    .bind(businessId, staffId)
    .run();
  return json({ ok: true });
}

/**
 * Serve a stored image.
 *
 * Content-Type comes from the row, which was written from server-side sniffing, and is passed
 * through safeImageContentType anyway so the header can only ever be one of three values.
 * `nosniff` is what keeps a bad row inert rather than executable in a visitor's browser.
 */
async function serveStoredImage(env: Env, businessId: number, staffId: number, store: ImageStore = STAFF_IMAGES) {
  const row = await env.DB
    .prepare(`SELECT content_type, bytes FROM ${store.table} WHERE business_id = ? AND ${store.ownerColumn} = ? LIMIT 1`)
    .bind(businessId, staffId)
    // `unknown`, not ArrayBuffer: claiming a type here is what hid the bug. What D1 returns
    // depends on how the row was written, so storedToBytes decides instead of the annotation.
    .first<{ content_type: string; bytes: unknown }>();

  if (!row) return null;
  const bytes = storedToBytes(row.bytes);
  // A row that will not decode is treated as no image: the caller 404s and the UI falls back to
  // initials, which beats serving bytes that are not an image and drawing a broken icon.
  if (!bytes) return null;

  const contentType = safeImageContentType(row.content_type);
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", `inline; filename="image.${IMAGE_EXTENSION[contentType]}"`);
  // `private`: this route requires a session, so only the requesting browser may keep a copy.
  // A long max-age is safe because the URL carries the row's updated_at - a replaced picture is
  // a different URL, so nothing stale can be served. Without that version, `public, max-age=300`
  // meant an owner saw their old photo for five minutes after replacing it.
  headers.set("cache-control", "private, max-age=3600");
  // Copied into its own exact-length ArrayBuffer. A Uint8Array can be a view onto a larger
  // buffer, and passing one straight to Response is also the one binary body shape the DOM and
  // Workers type definitions disagree about — an ArrayBuffer is unambiguous to both.
  const body = new Uint8Array(bytes).buffer as ArrayBuffer;
  return new Response(body, { status: 200, headers });
}

/** Which staff ids have a stored photo, plus whether the business has a logo. One cheap query. */
async function storedImageIds(env: Env, businessId: number) {
  try {
    const rows = await env.DB
      .prepare("SELECT staff_id, updated_at FROM crm_images WHERE business_id = ?")
      .bind(businessId)
      .all<{ staff_id: number; updated_at: string }>();
    return new Map((rows.results ?? []).map((r) => [Number(r.staff_id), String(r.updated_at ?? "")]));
  } catch {
    // Swallowed ON PURPOSE, and only here. This runs inside getCrmPayload, so a throw takes
    // the whole CRM down with a 500 — which is exactly the outage a missing migration caused
    // once already. An absent crm_images table degrades to "nobody has a logo", which shows
    // initials instead of images and breaks nothing else.
    //
    // The upload and serve paths deliberately do NOT do this: they are user-initiated, and a
    // silent failure there would look like the upload worked.
    return new Map<number, string>();
  }
}

/** Which services have a picture. Same swallow-on-missing-table reasoning as above. */
async function storedServiceImageIds(env: Env, businessId: number) {
  try {
    const rows = await env.DB
      .prepare("SELECT service_id, updated_at FROM crm_service_images WHERE business_id = ?")
      .bind(businessId)
      .all<{ service_id: number; updated_at: string }>();
    return new Map((rows.results ?? []).map((r) => [Number(r.service_id), String(r.updated_at ?? "")]));
  } catch {
    return new Map<number, string>();
  }
}

async function uploadBusinessPhoto(env: Env, business: BusinessRow, request: Request) {
  const formData = await request.formData();
  return await storeImage(env, business.id, LOGO_STAFF_ID, formData.get("photo"));
}

/**
 * A photo for one specialist. Same validation and storage as the logo, so there is one way in.
 *
 * The ownership check is the only addition: the staff row has to belong to the caller's
 * business, or an owner could set photos on another shop's team by id.
 */
async function uploadStaffPhoto(env: Env, business: BusinessRow, staffId: number, request: Request) {
  const staff = await env.DB
    .prepare("SELECT id FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, business.id)
    .first<{ id: number }>();
  if (!staff) return json({ error: "Employee not found", code: "invalid_staff" }, { status: 404 });

  const formData = await request.formData();
  return await storeImage(env, business.id, staffId, formData.get("photo"));
}

async function deleteStaffPhoto(env: Env, business: BusinessRow, staffId: number) {
  return await deleteImage(env, business.id, staffId);
}

/**
 * Service pictures. Same validation, same storage rules, different table.
 *
 * The service is looked up scoped to the business FIRST, so an id from another shop cannot be
 * used to write into their row — the same check the staff path makes.
 */
async function uploadServicePhoto(env: Env, business: BusinessRow, serviceId: number, request: Request) {
  const service = await env.DB
    .prepare("SELECT id FROM services WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(serviceId, business.id)
    .first<{ id: number }>();
  if (!service) return json({ error: "Service not found", code: "invalid_service" }, { status: 404 });

  const formData = await request.formData();
  return await storeImage(env, business.id, serviceId, formData.get("photo"), SERVICE_IMAGES);
}

async function deleteServicePhoto(env: Env, business: BusinessRow, serviceId: number) {
  return await deleteImage(env, business.id, serviceId, SERVICE_IMAGES);
}

async function proxyServicePhoto(env: Env, businessId: number, serviceId: number) {
  if (!Number.isFinite(serviceId) || serviceId <= 0) return new Response("Not found", { status: 404 });
  const stored = await serveStoredImage(env, businessId, serviceId, SERVICE_IMAGES);
  return stored ?? new Response("Not found", { status: 404 });
}

/**
 * One specialist's photo.
 *
 * 404 for a staff id belonging to another business, deliberately indistinguishable from a
 * specialist with no photo — this is reachable unauthenticated via the public route, and a
 * different answer for the two cases would let anyone enumerate which ids exist. Keying the
 * row on business_id gives that for free.
 */
async function proxyStaffPhoto(env: Env, businessId: number, staffId: number) {
  // 0 is the logo's slot, so a request for /api/staff/0/photo must not return it.
  if (staffId === LOGO_STAFF_ID) return new Response("Not found", { status: 404 });
  const stored = await serveStoredImage(env, businessId, staffId);
  return stored ?? new Response("Not found", { status: 404 });
}

async function deleteBusinessPhoto(env: Env, business: BusinessRow) {
  // Clears BOTH stores. A business that uploaded through the Telegram bot has a file_id on
  // `businesses`, and removing only the D1 row would let that old photo reappear.
  await env.DB
    .prepare("UPDATE businesses SET photo_file_id = NULL, photo_file_unique_id = NULL WHERE id = ?")
    .bind(business.id)
    .run();
  return await deleteImage(env, business.id, LOGO_STAFF_ID);
}

/**
 * Why an upload was refused, in words an owner can act on.
 *
 * Naming the actual format matters: somebody who picked the wrong file from a folder needs to
 * hear "that is a Windows program", not "invalid image". English only, like the other API
 * errors — the client surfaces `code` when it wants a translated string.
 */
const IMAGE_REJECTION_MESSAGE: Record<RejectionReason, string> = {
  empty: "That file is empty.",
  too_large: "That image is larger than 4 MB. Please upload a smaller file.",
  svg_or_html: "SVG and HTML files are not accepted as logos. Please upload a PNG, JPG or WebP.",
  executable: "That is a program, not an image. Please upload a PNG, JPG or WebP.",
  archive: "That is an archive, not an image. Please upload a PNG, JPG or WebP.",
  pdf: "That is a PDF, not an image. Please upload a PNG, JPG or WebP.",
  not_an_image: "That file is not a PNG, JPG or WebP image.",
};

const IMAGE_EXTENSION: Record<ImageKind, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Headers for a stored logo, on the way back out to a browser.
 *
 * The Content-Type comes from our own allowlist rather than being echoed from upstream, and
 * `nosniff` stops a browser second-guessing it. Together they are what makes a bad upload
 * inert: even if something that is not an image reached storage, it is served as an image and
 * the browser is told not to look for a reason to treat it as anything else. `inline` with a
 * fixed filename keeps a download from inheriting a name from the request.
 */
function imageResponseHeaders(upstream: Response) {
  const contentType = safeImageContentType(upstream.headers.get("content-type"));
  const headers = new Headers();
  headers.set("content-type", contentType);
  headers.set("x-content-type-options", "nosniff");
  headers.set("content-disposition", `inline; filename="logo.${IMAGE_EXTENSION[contentType]}"`);
  headers.set("cache-control", "public, max-age=300");
  return headers;
}

/**
 * The business logo.
 *
 * D1 first. Telegram is a fallback only for a business whose photo was uploaded through the bot
 * before this table existed — that path still needs BUSINESS_BOT_TOKEN, so it 404s instead of
 * 503ing when the token is absent: a missing logo is not worth breaking a page over.
 */
async function proxyBusinessPhoto(env: Env, business: BusinessRow) {
  const stored = await serveStoredImage(env, business.id, LOGO_STAFF_ID);
  if (stored) return stored;

  if (!business.photo_file_id || !env.BUSINESS_BOT_TOKEN) {
    return new Response("Not found", { status: 404 });
  }

  const telegramFile = await getTelegramFileResponse(env.BUSINESS_BOT_TOKEN, business.photo_file_id);
  return new Response(telegramFile.body, { status: 200, headers: imageResponseHeaders(telegramFile) });
}

async function createService(env: Env, business: BusinessRow, input: UpsertServiceInput) {
  const name = input.name?.trim();
  const price = Number(input.price);
  const duration = Number(input.duration);

  if (!name) {
    return json({ error: "Service name is required" }, { status: 400 });
  }

  if (!Number.isFinite(price) || price < 0) {
    return json({ error: "Service price must be zero or greater" }, { status: 400 });
  }

  if (!Number.isInteger(duration) || duration <= 0) {
    return json({ error: "Service duration must be a positive number of minutes" }, { status: 400 });
  }

  const staffIds = await normalizeStaffIdsForBusiness(env.DB, business.id, input.staffIds);
  if (staffIds === null) {
    return json({ error: "One or more selected employees do not belong to this business." }, { status: 400 });
  }
  const insert = await env.DB
    .prepare("INSERT INTO services (business_id, name, category, price, duration, is_active) VALUES (?, ?, ?, ?, ?, 1)")
    .bind(business.id, name, String(input.category ?? "").trim().slice(0, 40) || null, price, duration)
    .run();

  const serviceId =
    Number(insert.meta.last_row_id ?? 0) ||
    Number(
      (
        await env.DB
          .prepare(
            "SELECT id FROM services WHERE business_id = ? AND name = ? AND price = ? AND duration = ? ORDER BY id DESC LIMIT 1"
          )
          .bind(business.id, name, price, duration)
          .first<{ id: number }>()
      )?.id ?? 0
    );

  if (!serviceId) {
    return json({ error: "Service was created but could not be loaded back." }, { status: 500 });
  }

  await replaceServiceBindings(env.DB, serviceId, staffIds);
  return json({ ok: true }, { status: 201 });
}

async function updateService(env: Env, business: BusinessRow, serviceId: number, input: UpdateServiceInput) {
  const current = await env.DB
    .prepare("SELECT id, name, category, price, duration, is_active FROM services WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(serviceId, business.id)
    .first<ServiceRow>();

  if (!current) {
    return json({ error: "Service not found" }, { status: 404 });
  }

  const nextName = input.name === undefined ? current.name : input.name.trim();
  // Capped and trimmed to null: an empty string and NULL would otherwise be two ways to say
  // uncategorised, and the booking page would render one of them as a heading with no name.
  const nextCategory =
    input.category === undefined ? current.category : String(input.category).trim().slice(0, 40) || null;
  const nextPrice = input.price === undefined ? Number(current.price) : Number(input.price);
  const nextDuration = input.duration === undefined ? Number(current.duration) : Number(input.duration);
  const nextIsActive = input.isActive === undefined ? Number(current.is_active) : input.isActive ? 1 : 0;

  if (!nextName) {
    return json({ error: "Service name is required" }, { status: 400 });
  }

  if (!Number.isFinite(nextPrice) || nextPrice < 0) {
    return json({ error: "Service price must be zero or greater" }, { status: 400 });
  }

  if (!Number.isInteger(nextDuration) || nextDuration <= 0) {
    return json({ error: "Service duration must be a positive number of minutes" }, { status: 400 });
  }

  await env.DB
    .prepare("UPDATE services SET name = ?, category = ?, price = ?, duration = ?, is_active = ? WHERE id = ? AND business_id = ?")
    .bind(nextName, nextCategory, nextPrice, nextDuration, nextIsActive, serviceId, business.id)
    .run();

  if (input.staffIds !== undefined) {
    const staffIds = await normalizeStaffIdsForBusiness(env.DB, business.id, input.staffIds);
    if (staffIds === null) {
      return json({ error: "One or more selected employees do not belong to this business." }, { status: 400 });
    }
    await replaceServiceBindings(env.DB, serviceId, staffIds);
  }

  return json({ ok: true });
}

async function updateEmployeeSlots(env: Env, business: BusinessRow, staffId: number, input: UpdateEmployeeSlotsInput) {
  const staff = await env.DB
    .prepare("SELECT id FROM staff WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(staffId, business.id)
    .first<{ id: number }>();

  if (!staff) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  const normalized = input.weeklySlots.map((day) => ({
    weekday: day.weekday,
    slots: Array.from(new Set(day.slots.map((slot) => normalizeTime(slot)).filter((slot): slot is string => Boolean(slot)))).sort(),
  }));
  const normalizedBreaks = (input.weeklyBreaks ?? []).map((day) => ({
    weekday: day.weekday,
    slots: Array.from(new Set(day.slots.map((slot) => normalizeTime(slot)).filter((slot): slot is string => Boolean(slot)))).sort(),
  }));
  const normalizedDayOffs = (input.dayOffs ?? [])
    .map((entry) => ({
      date: isIsoDate(entry.date) ? entry.date : null,
      isFullDay: Boolean(entry.isFullDay),
      slots: Array.from(new Set(entry.slots.map((slot) => normalizeTime(slot)).filter((slot): slot is string => Boolean(slot)))).sort(),
    }))
    .filter((entry) => entry.date && (entry.isFullDay || entry.slots.length > 0)) as Array<{
      date: string;
      isFullDay: boolean;
      slots: string[];
    }>;

  if (normalized.some((day) => Number.isNaN(day.weekday) || day.weekday < 0 || day.weekday > 6)) {
    return json({ error: "Invalid weekday supplied" }, { status: 400 });
  }

  if (normalizedBreaks.some((day) => Number.isNaN(day.weekday) || day.weekday < 0 || day.weekday > 6)) {
    return json({ error: "Invalid weekly break weekday supplied" }, { status: 400 });
  }

  await env.DB.prepare("DELETE FROM staff_slots WHERE staff_id = ?").bind(staffId).run();
  await env.DB.prepare("DELETE FROM staff_unavailability WHERE staff_id = ?").bind(staffId).run();

  for (const day of normalized) {
    for (const slot of day.slots) {
      await env.DB
        .prepare("INSERT INTO staff_slots (staff_id, weekday, slot_time) VALUES (?, ?, ?)")
        .bind(staffId, day.weekday, slot)
        .run();
    }
  }

  for (const day of normalizedBreaks) {
    for (const slot of day.slots) {
      await env.DB
        .prepare(
          "INSERT INTO staff_unavailability (staff_id, kind, weekday, date, slot_time, is_full_day) VALUES (?, 'break', ?, NULL, ?, 0)"
        )
        .bind(staffId, day.weekday, slot)
        .run();
    }
  }

  for (const dayOff of normalizedDayOffs) {
    if (dayOff.isFullDay) {
      await env.DB
        .prepare(
          "INSERT INTO staff_unavailability (staff_id, kind, weekday, date, slot_time, is_full_day) VALUES (?, 'day_off', NULL, ?, NULL, 1)"
        )
        .bind(staffId, dayOff.date)
        .run();
      continue;
    }

    for (const slot of dayOff.slots) {
      await env.DB
        .prepare(
          "INSERT INTO staff_unavailability (staff_id, kind, weekday, date, slot_time, is_full_day) VALUES (?, 'day_off', NULL, ?, ?, 0)"
        )
        .bind(staffId, dayOff.date, slot)
        .run();
    }
  }

  return json({ ok: true });
}

async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function hasD1Binding(env: Env): env is Env & { DB: D1Database } {
  return Boolean(env.DB && typeof env.DB.prepare === "function");
}

function hasAssetsBinding(env: Env): env is Env & { ASSETS: Fetcher } {
  return Boolean(env.ASSETS && typeof env.ASSETS.fetch === "function");
}

/**
 * Headers every response carries.
 *
 * There were none. The CRM could be framed by any site on the internet, which is the whole
 * setup for a clickjacking attack: overlay an invisible copy of a logged-in owner's CRM on a
 * page they were persuaded to visit, and their clicks land on our buttons — "delete", "revoke
 * access", "log out".
 *
 * `frame-ancestors` is an ALLOWLIST rather than a flat DENY because the landing page genuinely
 * frames us: the demo at easyq.uz is this Worker in an iframe with ?embed=1. X-Frame-Options
 * cannot express "these origins and no others", so CSP does the work and X-Frame-Options is
 * left off rather than set to something that would break the demo.
 *
 * Deliberately NOT a full script-src/style-src policy. That is worth doing, but it is a change
 * that breaks silently at runtime rather than at build time — the wrong directive shows an
 * owner a blank page, not an error — so it wants its own pass with the pages open in front of
 * me, not a paragraph in a security sweep.
 */
function withSecurityHeaders(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);

  // The one that matters for the image endpoints: bytes we accepted as a PNG cannot be talked
  // into executing as script by a browser that would rather guess.
  headers.set("x-content-type-options", "nosniff");
  // Tenant slugs are in our own URLs, and a slug is a customer's business name.
  headers.set("referrer-policy", "strict-origin-when-cross-origin");

  const ancestors = ["'self'"];
  for (const root of tenantRoots(env)) {
    if (root === "localhost" || root === "127.0.0.1") {
      // Dev only: the landing runs on another port, so same-origin does not cover it.
      ancestors.push(`http://${root}:*`);
    } else {
      ancestors.push(`https://${root}`, `https://*.${root}`);
    }
  }

  // The landing is a Pages project, so besides easyq.uz it also answers on its .pages.dev
  // domain, and every preview deployment gets a subdomain of that. Those are where the demo
  // iframe gets looked at before a release, and without this the frame would come up blank
  // with only a console message to explain it.
  //
  // Scoped to the PROJECT (`*.easyq-landing.pages.dev`), never to `*.pages.dev` — that is a
  // shared namespace where anyone can create a site, so allowing it would let a stranger's
  // Pages project frame a logged-in owner's CRM, which is exactly what this header is for.
  //
  // An env var so the list can change without a code deploy, but with the default committed
  // here rather than living only in a dashboard someone has to remember to set.
  for (const extra of String(env.EMBED_ANCESTORS ?? "https://easyq-landing.pages.dev,https://*.easyq-landing.pages.dev")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    ancestors.push(extra);
  }
  headers.set(
    "content-security-policy",
    `frame-ancestors ${ancestors.join(" ")}; base-uri 'self'; form-action 'self'`
  );

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const router = {
  async handle(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // NOTE: every handler below is dispatched with `return await`, never a bare
    // `return handler(...)`. Do not "simplify" that away.
    //
    // `return promise` inside try/catch in an async function ADOPTS the promise rather
    // than awaiting it: the try block completes successfully, the catch goes out of
    // scope, and a later rejection escapes as an unhandled rejection. Cloudflare then
    // serves its own "Worker threw exception" HTML page instead of the JSON error below
    // — which is how an un-run migration turned into a raw 500 for a client mid-booking,
    // and why the "no such table" hint in the catch could never actually fire.
    try {
      if (url.pathname.startsWith("/api/") && !hasD1Binding(env)) {
        return json(
          {
            error: "CRM D1 binding is missing in this deployment.",
            hint: "Add the D1 binding `DB -> easyqueue_db` to the easyq-crm Worker, or redeploy from wrangler.toml so Cloudflare picks it up.",
          },
          { status: 500 }
        );
      }

      // ── Per-tenant host resolution ──────────────────────────────────────────
      // `tenant` stays null for crm.easyq.uz, *.workers.dev and localhost, so every
      // existing host keeps taking exactly the path it took before this feature.
      const hostLabel = tenantLabelFromHost(url.hostname, tenantRoots(env));

      // The wildcard route also captures www.easyq.uz — send it to the marketing site.
      if (hostLabel === "www") {
        return Response.redirect(`https://easyq.uz${url.pathname}${url.search}`, 301);
      }

      let tenant: TenantContext | null = null;
      if (hostLabel && !RESERVED_HOST_LABELS.has(hostLabel) && hasD1Binding(env)) {
        // Hashed build assets are host-agnostic and high-volume; don't spend a D1
        // read resolving the tenant just to serve one.
        const isBuildAsset =
          !url.pathname.startsWith("/api/") &&
          (url.pathname.startsWith("/assets/") || /\.[a-z0-9]{2,5}$/i.test(url.pathname));
        if (!isBuildAsset) {
          tenant = await getTenantBySlug(env.DB, hostLabel);
          if (!tenant) return unknownWorkspaceResponse(url);
        }
      }

      // The signup funnel lives on one origin. Tenant hosts are not write endpoints.
      if (
        tenant &&
        (url.pathname === "/api/signup" ||
          url.pathname === "/api/feedback" ||
          url.pathname === "/api/captcha" ||
          url.pathname === "/api/subdomain/check" ||
          url.pathname.startsWith("/api/verify/") ||
          url.pathname === "/api/telegram/verify-webhook")
      ) {
        return json({ error: "Not found" }, { status: 404 });
      }
      // ────────────────────────────────────────────────────────────────────────

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        return await getSessionState(env, request, tenant);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return await login(env, request, tenant);
      }

      if (url.pathname === "/api/auth/session-login" && request.method === "POST") {
        return await sessionLogin(env, request, tenant);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return await logout(request);
      }

      // Public identity of the current tenant host, so the login screen can name the
      // business instead of showing a bare generic form.
      if (url.pathname === "/api/tenant" && request.method === "GET") {
        if (!tenant) return json({ error: "Not found" }, { status: 404 });
        return json({ slug: tenant.slug, businessName: tenant.businessName });
      }

      if (url.pathname === "/api/signup" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SIGNUP_CORS });
      }

      if (url.pathname === "/api/signup" && request.method === "POST") {
        return await signupBusiness(env, request);
      }

      if (url.pathname === "/api/subdomain/check" && request.method === "GET") {
        // One D1 read per call and no caching, which made this a fast oracle for enumerating
        // every claimed slug. Slugs are public DNS names so the answers are not secret; the
        // free bulk enumeration is what is being taken away. The limit is well above what the
        // signup form's debounced typing produces.
        await requireUnderRateLimit(env, request, LIMITS.subdomainCheck, undefined, PUBLIC_GET_CORS);
        return await checkSubdomain(env, url);
      }

      // ── Public booking page ─────────────────────────────────────────────────
      // Tenant-only by construction: without a resolved host there is no business to
      // book against, so these 404 on crm.easyq.uz rather than guessing one.
      if (url.pathname.startsWith("/api/public/")) {
        if (!tenant) return json({ error: "Not found" }, { status: 404 });

        if (url.pathname === "/api/public/business" && request.method === "GET") {
          return await publicBusinessEndpoint(env, tenant);
        }
        if (url.pathname === "/api/public/slots" && request.method === "GET") {
          return await publicSlotsEndpoint(env, tenant, url);
        }
        if (url.pathname === "/api/public/bookings" && request.method === "POST") {
          // The existing cap is three per phone per day, which a script sidesteps by changing
          // the phone. Availability then bounds the damage in the worst way possible: every
          // spam booking holds a real slot, so filling a shop's calendar IS the attack. Scoped
          // per tenant, so one busy shop cannot exhaust another's allowance.
          await requireUnderRateLimit(
            env,
            request,
            LIMITS.publicBooking,
            `${tenant.businessId}:${clientIp(request)}`
          );
          return await publicBookingEndpoint(env, tenant, request);
        }
        if (url.pathname === "/api/public/photo" && request.method === "GET") {
          return await publicPhotoEndpoint(env, tenant);
        }
        // Scoped to the tenant resolved from the hostname, so one shop's URL cannot serve
        // another shop's team photo even with a valid staff id.
        if (/^\/api\/public\/staff\/\d+\/photo$/.test(url.pathname) && request.method === "GET") {
          return await proxyStaffPhoto(env, tenant.businessId, Number(url.pathname.split("/")[4]));
        }

        return json({ error: "Not found" }, { status: 404 });
      }

      // ── Telegram phone verification ─────────────────────────────────────────
      if (url.pathname === "/api/verify/start" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SIGNUP_CORS });
      }

      // `return await`, like every other route here. Without the await a rejection escapes the
      // try/catch at the bottom of this handler: the caller gets a bare Cloudflare 1101 instead
      // of the JSON 500, and `console.error("CRM worker error")` never runs, so the failure is
      // invisible in the logs too. These three were the only ones missing it.
      if (url.pathname === "/api/verify/start" && request.method === "POST") {
        return await startVerification(env, request);
      }

      if (url.pathname === "/api/verify/status" && request.method === "GET") {
        return await verificationStatus(env, url);
      }

      // Called by Telegram, not by a browser — no CORS, gated on the shared secret.
      if (url.pathname === "/api/telegram/verify-webhook" && request.method === "POST") {
        return await telegramVerifyWebhook(env, request);
      }

      if (url.pathname === "/api/captcha" && request.method === "GET") {
        return await getCaptcha(env, request);
      }

      if (url.pathname === "/api/feedback" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: FEEDBACK_CORS });
      }

      if (url.pathname === "/api/feedback" && request.method === "POST") {
        return await submitFeedback(env, request);
      }

      if (url.pathname === "/api/feedback" && request.method === "GET") {
        return await listFeedback(env);
      }

      if (url.pathname === "/api/crm" && request.method === "GET") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "crm:read");
        const payload = await getCrmPayload(env, actor.business, getSelectedDate(request, env.APP_TIMEZONE || "UTC"));
        return json(redactPayloadFor(actor, payload));
      }

      if (url.pathname === "/api/bookings" && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "booking:create");
        return await createCrmBooking(env, actor, await readJson<CreateCrmBookingInput>(request));
      }

      if (url.pathname.startsWith("/api/bookings/") && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "booking:status");
        const bookingId = Number(url.pathname.split("/")[3]);
        return await updateBookingStatus(env, actor, bookingId, await readJson<UpdateBookingStatusInput>(request));
      }

      if (url.pathname.startsWith("/api/bookings/") && url.pathname.endsWith("/payments") && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "payment:write");
        const bookingId = Number(url.pathname.split("/")[3]);
        return await createBookingPayment(env, actor.business, bookingId, await readJson<CreatePaymentInput>(request));
      }

      // ── Staff CRM access (owner only) ───────────────────────────────────────
      // access:manage is owner-exclusive in the matrix. A manager who could grant access
      // could promote themselves, which would make the role distinction decorative.
      if (url.pathname.match(/^\/api\/employees\/\d+\/access$/)) {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "access:manage");
        const staffId = Number(url.pathname.split("/")[3]);

        if (request.method === "POST") {
          return await grantStaffAccess(env, actor, staffId, await readJson<StaffAccessInput>(request));
        }
        if (request.method === "PATCH") {
          return await updateStaffAccessRole(env, actor, staffId, await readJson<StaffAccessInput>(request));
        }
        if (request.method === "DELETE") {
          return await revokeStaffAccess(env, actor, staffId);
        }
        return json({ error: "Not found" }, { status: 404 });
      }

      if (url.pathname === "/api/employees" && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "staff:write");
        return await addEmployee(env, actor.business, await readJson<AddEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "staff:write");
        const staffId = Number(url.pathname.split("/")[3]);
        return await updateEmployee(env, actor.business, staffId, await readJson<UpdateEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "DELETE") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "staff:write");
        const staffId = Number(url.pathname.split("/")[3]);
        return await deleteEmployee(env, actor.business, staffId);
      }

      if (url.pathname === "/api/services" && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "service:write");
        return await createService(env, actor.business, await readJson<UpsertServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/services/") && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "service:write");
        const serviceId = Number(url.pathname.split("/")[3]);
        return await updateService(env, actor.business, serviceId, await readJson<UpdateServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && url.pathname.endsWith("/slots") && request.method === "PUT") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "schedule:write");
        const staffId = Number(url.pathname.split("/")[3]);
        return await updateEmployeeSlots(env, actor.business, staffId, await readJson<UpdateEmployeeSlotsInput>(request));
      }

      if (url.pathname === "/api/business" && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "business:write");
        return await updateBusinessProfile(env, actor.business, await readJson<UpdateBusinessProfileInput>(request));
      }

      // Self-service password change. Intentionally has NO requireCapability call: every
      // authenticated role may change their own password, and the row is chosen from the
      // actor, so there is nothing here to escalate with.
      if (url.pathname === "/api/me/password" && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        return await changeOwnPassword(env, request, actor, await readJson<ChangeOwnPasswordInput>(request));
      }

      if (url.pathname === "/api/business/credentials" && request.method === "PATCH") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "credentials:write");
        return await updateBusinessCredentials(env, request, actor.business, await readJson<UpdateCrmCredentialsInput>(request));
      }

      if (url.pathname === "/api/business/photo" && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "business:write");
        await requireUnderRateLimit(env, request, LIMITS.imageUpload, `biz:${actor.business.id}`);
        return await uploadBusinessPhoto(env, actor.business, request);
      }

      if (url.pathname === "/api/business/photo" && request.method === "DELETE") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "business:write");
        return await deleteBusinessPhoto(env, actor.business);
      }

      // ── Specialist photos ───────────────────────────────────────────────────
      // Writes need staff:write (owner only, matching the rest of staff management); the read
      // needs only crm:read, so every role sees the same team the calendar shows.
      if (/^\/api\/staff\/\d+\/photo$/.test(url.pathname) && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "staff:write");
        await requireUnderRateLimit(env, request, LIMITS.imageUpload, `biz:${actor.business.id}`);
        return await uploadStaffPhoto(env, actor.business, Number(url.pathname.split("/")[3]), request);
      }

      if (/^\/api\/staff\/\d+\/photo$/.test(url.pathname) && request.method === "DELETE") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "staff:write");
        return await deleteStaffPhoto(env, actor.business, Number(url.pathname.split("/")[3]));
      }

      if (/^\/api\/staff\/\d+\/photo$/.test(url.pathname) && request.method === "GET") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "crm:read");
        return await proxyStaffPhoto(env, actor.business.id, Number(url.pathname.split("/")[3]));
      }

      if (/^\/api\/services\/\d+\/photo$/.test(url.pathname) && request.method === "POST") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "service:write");
        await requireUnderRateLimit(env, request, LIMITS.imageUpload, `biz:${actor.business.id}`);
        return await uploadServicePhoto(env, actor.business, Number(url.pathname.split("/")[3]), request);
      }

      if (/^\/api\/services\/\d+\/photo$/.test(url.pathname) && request.method === "DELETE") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "service:write");
        return await deleteServicePhoto(env, actor.business, Number(url.pathname.split("/")[3]));
      }

      if (/^\/api\/services\/\d+\/photo$/.test(url.pathname) && request.method === "GET") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "crm:read");
        return await proxyServicePhoto(env, actor.business.id, Number(url.pathname.split("/")[3]));
      }

      if (url.pathname === "/api/business/photo" && request.method === "GET") {
        const actor = await requireAuthenticatedBusiness(env, request, tenant);
        requireCapability(actor, "crm:read");
        return await proxyBusinessPhoto(env, actor.business);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ error: "Not found" }, { status: 404 });
      }

      if (!hasAssetsBinding(env)) {
        return json(
          {
            error: "CRM assets binding is missing in this deployment.",
            hint: "Redeploy easyq-crm with the assets configuration from wrangler.toml, or reconnect the Worker so Cloudflare publishes the `dist` assets.",
          },
          { status: 500 }
        );
      }

      const asset = await env.ASSETS.fetch(request);

      /**
       * A tenant's booking page gets that shop's own preview card.
       *
       * Everything from here down serves the built SPA shell, whose <head> says "EasyQ CRM".
       * That is right for the CRM and wrong for a booking link: paste one into Telegram or
       * Instagram and the card advertised US instead of the barbershop whose page it is.
       *
       * It has to happen server-side. Unfurlers and crawlers do not run JavaScript, so setting
       * document.title from React changes the browser tab and nothing that gets shared.
       *
       * Guarded tightly — only a tenant host, only /booking, only an HTML 200 — so the CRM
       * shell, every asset and every error response are untouched. And the whole thing is
       * wrapped: a failure here must serve the ordinary page, because a booking link that
       * previews plainly still works, and one that 500s does not.
       */
      if (tenant && url.pathname.startsWith("/booking") && asset.status === 200) {
        const contentType = asset.headers.get("content-type") ?? "";
        if (contentType.includes("text/html")) {
          try {
            const business = await getBusinessById(env.DB, tenant.businessId);
            if (business) {
              // og:image only when there is one to serve. A card that claims
              // summary_large_image and then 404s renders as a broken preview, which is worse
              // than the plain card it would otherwise have shown.
              const hasLogo =
                Boolean(business.photo_file_id) ||
                (await storedImageIds(env, business.id)).has(LOGO_STAFF_ID);

              const html = injectBookingMeta(
                await asset.text(),
                buildBookingMeta(business, url.origin, hasLogo)
              );
              const headers = new Headers(asset.headers);
              headers.delete("content-length"); // rewritten body is a different size
              return new Response(html, { status: 200, headers });
            }
          } catch (error) {
            console.log("booking meta not injected:", error instanceof Error ? error.message : error);
          }
        }
      }

      return asset;
    } catch (error) {
      const authResponse = getHttpErrorResponse(error);
      if (authResponse) {
        return authResponse;
      }
      console.error("CRM worker error", error);
      const message = error instanceof Error ? error.message : "Unknown CRM error";

      // Public endpoints get a generic message. Echoing the raw error there hands a
      // stranger our schema — an un-run migration was answering booking requests with
      // "no such column: client_phone". The detail is in the log above, where it belongs.
      // CRM routes still return it: those callers are the authenticated owner or a
      // developer running locally, and the text is what makes the hint below useful.
      if (url.pathname.startsWith("/api/public/")) {
        return json({ error: "Something went wrong. Please try again.", code: "server_error" }, { status: 500 });
      }

      const hint = message.includes("no such table: businesses")
        ? "Your local D1 database is empty. Run `npm run db:init:local` for a local schema or start the CRM with `npm run dev:worker:remote` to use your shared remote D1."
        : undefined;
      return json(
        {
          error: message,
          hint,
        },
        { status: 500 }
      );
    }
  },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return withSecurityHeaders(await router.handle(request, env), env);
  },
};
