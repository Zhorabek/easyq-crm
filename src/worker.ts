import type {
  AddEmployeeInput,
  AuthSession,
  BookingLinkItem,
  BookingStatus,
  CalendarBookingCard,
  CalendarStaffColumn,
  ClientHistoryItem,
  ClientRow,
  CreatePaymentInput,
  CrmPayload,
  EmployeeRevenueItem,
  EmployeeRow,
  KpiCard,
  PaymentEntry,
  PaymentMethod,
  PaymentSummary,
  ServiceCatalogItem,
  UpdateCrmCredentialsInput,
  UpdateBusinessProfileInput,
  UpdateBookingStatusInput,
  UpdateEmployeeInput,
  UpdateServiceInput,
  UpdateEmployeeSlotsInput,
  UpsertServiceInput,
} from "./types";
import {
  clearSessionCookie,
  createSessionCookie,
  generateCrmTempPassword,
  hashCrmPassword,
  isValidCrmUsername,
  normalizeCrmUsernameBase,
  normalizeCrmUsername,
  readSession,
  verifyCrmPassword,
} from "./server/auth";
import { issueCaptcha, verifyCaptcha } from "./server/captcha";
import { slugProblem, type SlugProblem } from "./shared/slug";
import { toStoragePhone } from "./shared/phone";
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
  crm_temp_password: string | null;
  crm_credentials_updated_at: string | null;
  slug: string | null;
};

type LoginRow = {
  id: number;
  name: string;
  crm_username: string | null;
  crm_password_hash: string | null;
  crm_temp_password: string | null;
  slug: string | null;
};

type ServiceRow = {
  id: number;
  business_id: number;
  name: string;
  price: number;
  duration: number;
  is_active: number;
};

type StaffRow = {
  id: number;
  business_id: number;
  name: string;
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

type TelegramSendPhotoResult = {
  ok?: boolean;
  result?: {
    message_id?: number;
    photo?: Array<{
      file_id?: string;
      file_unique_id?: string;
      file_size?: number;
    }>;
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
    isTemporaryPassword: Boolean(business.crm_temp_password),
    slug: business.slug ?? null,
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
           crm_username,
           crm_password_hash,
           crm_temp_password,
           crm_credentials_updated_at,
           slug
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
    currency: "KZT",
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

async function tgCallMultipart<T>(token: string, method: string, formData: FormData) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Telegram ${method} failed: ${response.status} ${text}`);
  }

  return (await response.json()) as T;
}

async function getBusinessOwnerTelegramId(env: Env, business: BusinessRow) {
  if (!business.user_id) return null;

  const owner = await env.DB
    .prepare("SELECT telegram_id FROM users WHERE id = ? LIMIT 1")
    .bind(business.user_id)
    .first<{ telegram_id: number | null }>();

  return owner?.telegram_id ? Number(owner.telegram_id) : null;
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

async function uploadPhotoToBusinessBot(env: Env, business: BusinessRow, photo: File) {
  if (!env.BUSINESS_BOT_TOKEN) {
    throw new Error("BUSINESS_BOT_TOKEN is not configured for CRM.");
  }

  const ownerTelegramId = await getBusinessOwnerTelegramId(env, business);
  if (!ownerTelegramId) {
    throw new Error("Could not resolve the business owner Telegram account.");
  }

  const formData = new FormData();
  formData.set("chat_id", String(ownerTelegramId));
  formData.set("photo", photo, photo.name || "business-photo.jpg");
  formData.set("caption", "CRM business profile photo upload");

  const response = await tgCallMultipart<TelegramSendPhotoResult>(env.BUSINESS_BOT_TOKEN, "sendPhoto", formData);
  const telegramPhotos = response.result?.photo ? [...response.result.photo] : [];
  const telegramPhoto = telegramPhotos.sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))[0];

  if (!response.ok || !response.result?.message_id || !telegramPhoto?.file_id) {
    throw new Error("Telegram did not return a valid business photo file_id.");
  }

  await tgCallJson(env.BUSINESS_BOT_TOKEN, "deleteMessage", {
    chat_id: ownerTelegramId,
    message_id: response.result.message_id,
  }).catch((error) => {
    console.log("deleteMessage error:", error);
    return null;
  });

  return {
    fileId: telegramPhoto.file_id,
    fileUniqueId: telegramPhoto.file_unique_id ?? null,
  };
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

async function requireAuthenticatedBusiness(
  env: Env,
  request: Request,
  tenant: TenantContext | null
): Promise<BusinessRow> {
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

  return business;
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

  return json(toAuthSession(business));
}

async function login(env: Env, request: Request, tenant: TenantContext | null) {
  const input = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const username = normalizeCrmUsername(input.username ?? "");
  const password = String(input.password ?? "");

  if (!username || !password) {
    return json({ error: "Введите логин и пароль." }, { status: 400 });
  }

  const row = await env.DB
    .prepare(
      `SELECT
         id,
         name,
         crm_username,
         crm_password_hash,
         crm_temp_password,
         slug
       FROM businesses
       WHERE crm_username = ?
       LIMIT 1`
    )
    .bind(username)
    .first<LoginRow>();

  if (!row || !(await verifyCrmPassword(password, row.crm_password_hash))) {
    return json({ error: "Неверный логин или пароль." }, { status: 401 });
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

  if (username && password) {
    const row = await env.DB
      .prepare("SELECT id, name, crm_username, crm_password_hash, crm_temp_password, slug FROM businesses WHERE crm_username = ? LIMIT 1")
      .bind(username)
      .first<LoginRow>();
    // The tenant check rides along with the credential check: a mismatch falls
    // through to the same "bad creds" redirect below, revealing nothing.
    if (row && (await verifyCrmPassword(password, row.crm_password_hash)) && (!tenant || row.id === tenant.businessId)) {
      const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
        businessId: row.id,
        username: row.crm_username ?? username,
      });
      return new Response(null, { status: 303, headers: { location: "/", "set-cookie": cookie } });
    }
  }

  // Bad/missing creds → clear any stale session and land on the login screen.
  return new Response(null, { status: 303, headers: { location: "/", "set-cookie": clearSessionCookie(request) } });
}

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
   * Proof that a Telegram account confirmed a phone number. Replaces the old
   * `code: "1111"`. Note there is no longer a `phone` field — the number is read from
   * the verification row, because a client-supplied phone would make the whole
   * verification decorative.
   */
  verificationNonce?: string;
};

// ─────────────────────────────────────────────────────── Telegram phone verification

/** Public origin of the landing, used to build the deep link's bot username. */
function verifyBotUsername(env: Env) {
  return env.VERIFY_BOT_USERNAME || "easyq_verify_bot";
}

async function startVerification(env: Env, request: Request) {
  if (!env.VERIFY_BOT_TOKEN) {
    return json(
      {
        error: "Phone verification is not configured.",
        code: "verify_unconfigured",
        hint: "Create a bot with @BotFather, then set VERIFY_BOT_TOKEN, VERIFY_BOT_USERNAME and VERIFY_WEBHOOK_SECRET on the easyq-crm Worker.",
      },
      { status: 503, headers: SIGNUP_CORS }
    );
  }

  const nonce = generateNonce();
  const created = await createVerification(env.DB, nonce);

  return json(
    {
      nonce: created.nonce,
      // `startapp` is for mini-apps; plain `start` is what delivers "/start <payload>".
      deepLink: `https://t.me/${verifyBotUsername(env)}?start=${created.nonce}`,
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

async function getCaptcha(env: Env, request: Request) {
  const captcha = await issueCaptcha(request, env.CRM_SESSION_SECRET);
  return json(captcha, {
    headers: { ...PUBLIC_GET_CORS, "cache-control": "no-store" },
  });
}

async function signupBusiness(env: Env, request: Request) {
  const input = (await request.json().catch(() => ({}))) as SignupInput;
  const name = (input.name ?? "").trim();
  const type = (input.type ?? "").trim() || "other";
  const address = (input.address ?? "").trim() || "—";
  const language = input.lang === "ru" || input.lang === "uz" ? input.lang : null;
  const slug = String(input.slug ?? "").trim().toLowerCase();

  // Captcha first: it is the cheapest way to turn a bot away before any row is written.
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
  if (!env.VERIFY_BOT_TOKEN) {
    return json(
      { error: "Phone verification is not configured.", code: "verify_unconfigured" },
      { status: 503, headers: SIGNUP_CORS }
    );
  }
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
  const storedPhone = verification.phone;

  // Web sign-ups have no Telegram account, but users.telegram_id is NOT NULL UNIQUE.
  // Use a synthetic negative id (real Telegram ids are positive) and retry on the rare collision.
  let userId = 0;
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

  // The slug is claimed in the INSERT, not in the credentials UPDATE below, so the
  // partial unique index rejects a concurrent duplicate atomically. Losing that race
  // after the row exists would leave an orphaned business.
  let insertBiz;
  try {
    insertBiz = await env.DB
      .prepare("INSERT INTO businesses (user_id, name, type, address, phone, schedule, slug) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(userId, name, type, address, storedPhone, "09:00 - 19:00", slug)
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
      "UPDATE businesses SET crm_username = ?, crm_password_hash = ?, crm_temp_password = ?, crm_credentials_updated_at = datetime('now') WHERE id = ?"
    )
    .bind(username, passwordHash, tempPassword, businessId)
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
  let nextTempPassword: string | null = business.crm_temp_password;

  if (newPassword) {
    if (newPassword.length < 8) {
      return json({ error: "Новый пароль должен содержать минимум 8 символов." }, { status: 400 });
    }

    nextPasswordHash = await hashCrmPassword(newPassword);
    nextTempPassword = null;
  }

  if (username === business.crm_username && !newPassword) {
    return json({ error: "Измените логин или задайте новый пароль." }, { status: 400 });
  }

  await env.DB
    .prepare(
      `UPDATE businesses
       SET crm_username = ?, crm_password_hash = ?, crm_temp_password = ?, crm_credentials_updated_at = datetime('now')
       WHERE id = ?`
    )
    .bind(username, nextPasswordHash, nextTempPassword, business.id)
    .run();

  const refreshed = await getBusinessById(env.DB, business.id);
  if (!refreshed) {
    return json({ error: "Не удалось перечитать бизнес после обновления данных доступа." }, { status: 500 });
  }

  const cookie = await createSessionCookie(request, env.CRM_SESSION_SECRET, {
    businessId: refreshed.id,
    username: refreshed.crm_username ?? username,
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

  const [servicesRes, staffRes, staffServicesRes, staffSlotsRes, staffUnavailabilityRes, bookingsRes, paymentsRes] =
    await Promise.all([
    env.DB
      .prepare(
        "SELECT id, business_id, name, price, duration, is_active FROM services WHERE business_id = ? ORDER BY is_active DESC, name ASC"
      )
      .bind(business.id)
      .all<ServiceRow>(),
    env.DB.prepare("SELECT id, business_id, name FROM staff WHERE business_id = ? ORDER BY name ASC").bind(business.id).all<StaffRow>(),
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
        `SELECT id, business_id, user_id, service_id, staff_id, client_name, service_name, staff_name, datetime, status, price_snapshot, duration_snapshot, notes
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
    ]);

  const services = (servicesRes.results ?? []) as unknown as ServiceRow[];
  const staff = (staffRes.results ?? []) as unknown as StaffRow[];
  const staffServices = (staffServicesRes.results ?? []) as unknown as StaffServiceRow[];
  const staffSlots = (staffSlotsRes.results ?? []) as unknown as StaffSlotRow[];
  const staffUnavailability = (staffUnavailabilityRes.results ?? []) as unknown as StaffUnavailabilityRow[];
  const bookings = (bookingsRes.results ?? []) as unknown as BookingRow[];
  const payments = (paymentsRes.results ?? []) as unknown as PaymentRow[];

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
    const weeklyBreaks = weeklyBreaksByStaff.get(person.id)?.get(weekday) ?? [];
    const dayOff = dayOffsByStaff.get(person.id)?.get(selectedDate);
    const blockedSlotTimes = new Set<string>([
      ...weeklyBreaks,
      ...(dayOff?.isFullDay ? [] : dayOff?.slots ?? []),
    ]);
    const daySlots = dayOff?.isFullDay ? [] : rawDaySlots.filter((slot) => !blockedSlotTimes.has(slot.slot_time));
    const staffBookingsToday = bookingsToday.filter((booking) => booking.staff_id === person.id && booking.status !== "cancelled");
    const completedRevenue = staffBookingsToday.reduce(
      (sum, booking) => sum + (paymentSummaryByBooking.get(booking.id)?.net ?? 0),
      0
    );

    return {
      id: person.id,
      name: person.name,
      role: dayOff?.isFullDay ? "Выходной" : serviceNames[0] ?? "Специалист",
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
      name: "Без сотрудника",
      role: "Нужна привязка",
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
    const todayDayOff = dayOffsByStaff.get(person.id)?.get(selectedDate);
    const todayBlocked = new Set<string>([
      ...(weeklyBreaksByStaff.get(person.id)?.get(weekday) ?? []),
      ...(todayDayOff?.slots ?? []),
    ]);
    const todayAvailableSlotCount = todayDayOff?.isFullDay
      ? 0
      : weeklySlots[weekday].slots.filter((slot) => !todayBlocked.has(slot)).length;

    return {
      id: person.id,
      name: person.name,
      role: serviceNames[0] ?? "Специалист",
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
      price: Number(service.price || 0),
      duration: Number(service.duration || 0),
      isActive: Number(service.is_active) === 1,
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
    const key = booking.user_id ? `user:${booking.user_id}` : `name:${booking.client_name}`;
    const existing = clientsMap.get(key) ?? {
      key,
      name: booking.client_name,
      userId: booking.user_id,
      totalVisits: 0,
      completedVisits: 0,
      upcomingVisits: 0,
      cancelledVisits: 0,
      spentTotal: 0,
      lastVisit: null,
      favoriteStaff: "—",
      history: [],
    };

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
      staffName: booking.staff_name,
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
      label: "Записи на сегодня",
      value: String(reservationsToday.length),
      hint: `${completedToday.length} уже пришли`,
      tone: "sun",
    },
    {
      id: "today-revenue",
      label: "Собрано за день",
      value: formatMoney(dayRevenue),
      hint: `возвраты: ${formatMoney(paymentsToday.outgoing)}`,
      tone: "mint",
    },
    {
      id: "month-revenue",
      label: "Собрано за месяц",
      value: formatMoney(monthRevenue),
      hint: "по фактически зафиксированным платежам",
      tone: "sky",
    },
    {
      id: "outstanding",
      label: "Остаток к оплате",
      value: formatMoney(totalOutstanding),
      hint: `${employees.length} сотрудников · ${services.filter((service) => Number(service.is_active) === 1).length} услуг`,
      tone: "ink",
    },
  ];

  const clientBot = env.CLIENT_BOT_USERNAME || "easyqueue_client_bot";
  const businessBot = env.BUSINESS_BOT_USERNAME || "easyqueue_business_bot";
  const bookingLinks: BookingLinkItem[] = [
    {
      id: "public-main",
      title: "Общая ссылка для клиентов",
      subtitle: "@easyqueue_client_bot",
      url: `https://t.me/${clientBot}`,
      kind: "public",
      description: "Открывает клиентский бот и позволяет пройти весь сценарий записи.",
    },
    {
      id: "business-admin",
      title: "Ссылка для владельца",
      subtitle: "@easyqueue_business_bot",
      url: `https://t.me/${businessBot}`,
      kind: "admin",
      description: "Быстрый переход в бизнес-бот для управления услугами, сотрудниками и слотами.",
    },
    ...employees.slice(0, 4).map((employee) => ({
      id: `employee-${employee.id}`,
      title: `Поделиться мастером: ${employee.name}`,
      subtitle: "MVP ссылка",
      url: `https://t.me/${clientBot}`,
      kind: "preview" as const,
      description: "Открывает общий клиентский бот; мастер подбирается внутри текущего сценария записи.",
    })),
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
      photoFileId: business.photo_file_id,
      photoFileUniqueId: business.photo_file_unique_id,
      crmUsername: business.crm_username,
      crmHasTemporaryPassword: Boolean(business.crm_temp_password),
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
  };
}

async function updateBookingStatus(env: Env, business: BusinessRow, bookingId: number, input: UpdateBookingStatusInput) {
  const allowed = ["pending", "confirmed", "done", "cancelled"];
  if (!allowed.includes(input.status)) {
    return json({ error: "Invalid booking status" }, { status: 400 });
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

async function addEmployee(env: Env, business: BusinessRow, input: AddEmployeeInput) {
  const name = input.name?.trim();
  if (!name) {
    return json({ error: "Employee name is required" }, { status: 400 });
  }

  await env.DB.prepare("INSERT INTO staff (business_id, name) VALUES (?, ?)").bind(business.id, name).run();
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

  await env.DB.prepare("UPDATE staff SET name = ? WHERE id = ? AND business_id = ?").bind(name, staffId, business.id).run();
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
  // Canonicalize only what parses as a +998 number. Businesses created before this
  // rule existed can hold anything, and rejecting their stored value here would lock
  // them out of editing every OTHER profile field until they retyped the phone.
  const submittedPhone = input.phone === undefined ? business.phone : input.phone.trim();
  const nextPhone = toStoragePhone(submittedPhone) ?? submittedPhone;
  const nextSchedule = input.schedule === undefined ? business.schedule : input.schedule.trim();
  const nextDescription =
    input.description === undefined ? business.description : input.description?.trim() ? input.description.trim() : null;
  const nextType = input.type === undefined ? normalizeBusinessType(business.type) ?? business.type : normalizeBusinessType(input.type);

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

  await env.DB
    .prepare(
      `UPDATE businesses
       SET name = ?, type = ?, address = ?, phone = ?, schedule = ?, description = ?
       WHERE id = ?`
    )
    .bind(nextName, nextType, nextAddress, nextPhone, nextSchedule, nextDescription, business.id)
    .run();

  return json({ ok: true });
}

async function uploadBusinessPhoto(env: Env, business: BusinessRow, request: Request) {
  if (!env.BUSINESS_BOT_TOKEN) {
    return json({ error: "BUSINESS_BOT_TOKEN is not configured for CRM." }, { status: 503 });
  }

  const formData = await request.formData();
  const photo = formData.get("photo");

  if (!(photo instanceof File)) {
    return json({ error: "Photo file is required" }, { status: 400 });
  }

  const uploaded = await uploadPhotoToBusinessBot(env, business, photo);

  await env.DB
    .prepare("UPDATE businesses SET photo_file_id = ?, photo_file_unique_id = ? WHERE id = ?")
    .bind(uploaded.fileId, uploaded.fileUniqueId, business.id)
    .run();

  return json({ ok: true }, { status: 201 });
}

async function deleteBusinessPhoto(env: Env, business: BusinessRow) {
  await env.DB
    .prepare("UPDATE businesses SET photo_file_id = NULL, photo_file_unique_id = NULL WHERE id = ?")
    .bind(business.id)
    .run();

  return json({ ok: true });
}

async function proxyBusinessPhoto(env: Env, business: BusinessRow) {
  if (!business.photo_file_id) {
    return new Response("Not found", { status: 404 });
  }

  if (!env.BUSINESS_BOT_TOKEN) {
    return json({ error: "BUSINESS_BOT_TOKEN is not configured for CRM." }, { status: 503 });
  }

  const telegramFile = await getTelegramFileResponse(env.BUSINESS_BOT_TOKEN, business.photo_file_id);
  const headers = new Headers();
  headers.set("content-type", telegramFile.headers.get("content-type") ?? "image/jpeg");
  headers.set("cache-control", "public, max-age=300");

  return new Response(telegramFile.body, {
    status: 200,
    headers,
  });
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
    .prepare("INSERT INTO services (business_id, name, price, duration, is_active) VALUES (?, ?, ?, ?, 1)")
    .bind(business.id, name, price, duration)
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
    .prepare("SELECT id, name, price, duration, is_active FROM services WHERE id = ? AND business_id = ? LIMIT 1")
    .bind(serviceId, business.id)
    .first<ServiceRow>();

  if (!current) {
    return json({ error: "Service not found" }, { status: 404 });
  }

  const nextName = input.name === undefined ? current.name : input.name.trim();
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
    .prepare("UPDATE services SET name = ?, price = ?, duration = ?, is_active = ? WHERE id = ? AND business_id = ?")
    .bind(nextName, nextPrice, nextDuration, nextIsActive, serviceId, business.id)
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
        return getSessionState(env, request, tenant);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return login(env, request, tenant);
      }

      if (url.pathname === "/api/auth/session-login" && request.method === "POST") {
        return sessionLogin(env, request, tenant);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return logout(request);
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
        return signupBusiness(env, request);
      }

      if (url.pathname === "/api/subdomain/check" && request.method === "GET") {
        return checkSubdomain(env, url);
      }

      // ── Telegram phone verification ─────────────────────────────────────────
      if (url.pathname === "/api/verify/start" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: SIGNUP_CORS });
      }

      if (url.pathname === "/api/verify/start" && request.method === "POST") {
        return startVerification(env, request);
      }

      if (url.pathname === "/api/verify/status" && request.method === "GET") {
        return verificationStatus(env, url);
      }

      // Called by Telegram, not by a browser — no CORS, gated on the shared secret.
      if (url.pathname === "/api/telegram/verify-webhook" && request.method === "POST") {
        return telegramVerifyWebhook(env, request);
      }

      if (url.pathname === "/api/captcha" && request.method === "GET") {
        return getCaptcha(env, request);
      }

      if (url.pathname === "/api/feedback" && request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: FEEDBACK_CORS });
      }

      if (url.pathname === "/api/feedback" && request.method === "POST") {
        return submitFeedback(env, request);
      }

      if (url.pathname === "/api/feedback" && request.method === "GET") {
        return listFeedback(env);
      }

      if (url.pathname === "/api/crm" && request.method === "GET") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const payload = await getCrmPayload(env, business, getSelectedDate(request, env.APP_TIMEZONE || "UTC"));
        return json(payload);
      }

      if (url.pathname.startsWith("/api/bookings/") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const bookingId = Number(url.pathname.split("/")[3]);
        return updateBookingStatus(env, business, bookingId, await readJson<UpdateBookingStatusInput>(request));
      }

      if (url.pathname.startsWith("/api/bookings/") && url.pathname.endsWith("/payments") && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const bookingId = Number(url.pathname.split("/")[3]);
        return createBookingPayment(env, business, bookingId, await readJson<CreatePaymentInput>(request));
      }

      if (url.pathname === "/api/employees" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return addEmployee(env, business, await readJson<AddEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const staffId = Number(url.pathname.split("/")[3]);
        return updateEmployee(env, business, staffId, await readJson<UpdateEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "DELETE") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const staffId = Number(url.pathname.split("/")[3]);
        return deleteEmployee(env, business, staffId);
      }

      if (url.pathname === "/api/services" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return createService(env, business, await readJson<UpsertServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/services/") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const serviceId = Number(url.pathname.split("/")[3]);
        return updateService(env, business, serviceId, await readJson<UpdateServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && url.pathname.endsWith("/slots") && request.method === "PUT") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        const staffId = Number(url.pathname.split("/")[3]);
        return updateEmployeeSlots(env, business, staffId, await readJson<UpdateEmployeeSlotsInput>(request));
      }

      if (url.pathname === "/api/business" && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return updateBusinessProfile(env, business, await readJson<UpdateBusinessProfileInput>(request));
      }

      if (url.pathname === "/api/business/credentials" && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return updateBusinessCredentials(env, request, business, await readJson<UpdateCrmCredentialsInput>(request));
      }

      if (url.pathname === "/api/business/photo" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return uploadBusinessPhoto(env, business, request);
      }

      if (url.pathname === "/api/business/photo" && request.method === "DELETE") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return deleteBusinessPhoto(env, business);
      }

      if (url.pathname === "/api/business/photo" && request.method === "GET") {
        const business = await requireAuthenticatedBusiness(env, request, tenant);
        return proxyBusinessPhoto(env, business);
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

      return await env.ASSETS.fetch(request);
    } catch (error) {
      const authResponse = getHttpErrorResponse(error);
      if (authResponse) {
        return authResponse;
      }
      console.error("CRM worker error", error);
      const message = error instanceof Error ? error.message : "Unknown CRM error";
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
