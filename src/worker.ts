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
  hashCrmPassword,
  isValidCrmUsername,
  normalizeCrmUsername,
  readSession,
  verifyCrmPassword,
} from "./server/auth";

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
};

type LoginRow = {
  id: number;
  name: string;
  crm_username: string | null;
  crm_password_hash: string | null;
  crm_temp_password: string | null;
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

function toAuthSession(business: BusinessRow): AuthSession {
  return {
    businessId: business.id,
    businessName: business.name,
    username: business.crm_username ?? "",
    isTemporaryPassword: Boolean(business.crm_temp_password),
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
           crm_credentials_updated_at
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

async function requireAuthenticatedBusiness(env: Env, request: Request): Promise<BusinessRow> {
  const session = await readSession(request, env.CRM_SESSION_SECRET);
  if (!session) {
    throw new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": clearSessionCookie(request),
      },
    });
  }

  const business = await getBusinessById(env.DB, session.businessId);
  if (!business || !business.crm_username) {
    throw new Response(JSON.stringify({ error: "Your CRM session is no longer valid. Please sign in again." }), {
      status: 401,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": clearSessionCookie(request),
      },
    });
  }

  return business;
}

async function getSessionState(env: Env, request: Request) {
  const business = await requireAuthenticatedBusiness(env, request);
  return json(toAuthSession(business));
}

async function login(env: Env, request: Request) {
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
         crm_temp_password
       FROM businesses
       WHERE crm_username = ?
       LIMIT 1`
    )
    .bind(username)
    .first<LoginRow>();

  if (!row || !(await verifyCrmPassword(password, row.crm_password_hash))) {
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
  const nextPhone = input.phone === undefined ? business.phone : input.phone.trim();
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

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        return getSessionState(env, request);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return login(env, request);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return logout(request);
      }

      if (url.pathname === "/api/crm" && request.method === "GET") {
        const business = await requireAuthenticatedBusiness(env, request);
        const payload = await getCrmPayload(env, business, getSelectedDate(request, env.APP_TIMEZONE || "UTC"));
        return json(payload);
      }

      if (url.pathname.startsWith("/api/bookings/") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request);
        const bookingId = Number(url.pathname.split("/")[3]);
        return updateBookingStatus(env, business, bookingId, await readJson<UpdateBookingStatusInput>(request));
      }

      if (url.pathname.startsWith("/api/bookings/") && url.pathname.endsWith("/payments") && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request);
        const bookingId = Number(url.pathname.split("/")[3]);
        return createBookingPayment(env, business, bookingId, await readJson<CreatePaymentInput>(request));
      }

      if (url.pathname === "/api/employees" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request);
        return addEmployee(env, business, await readJson<AddEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request);
        const staffId = Number(url.pathname.split("/")[3]);
        return updateEmployee(env, business, staffId, await readJson<UpdateEmployeeInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && !url.pathname.endsWith("/slots") && request.method === "DELETE") {
        const business = await requireAuthenticatedBusiness(env, request);
        const staffId = Number(url.pathname.split("/")[3]);
        return deleteEmployee(env, business, staffId);
      }

      if (url.pathname === "/api/services" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request);
        return createService(env, business, await readJson<UpsertServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/services/") && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request);
        const serviceId = Number(url.pathname.split("/")[3]);
        return updateService(env, business, serviceId, await readJson<UpdateServiceInput>(request));
      }

      if (url.pathname.startsWith("/api/employees/") && url.pathname.endsWith("/slots") && request.method === "PUT") {
        const business = await requireAuthenticatedBusiness(env, request);
        const staffId = Number(url.pathname.split("/")[3]);
        return updateEmployeeSlots(env, business, staffId, await readJson<UpdateEmployeeSlotsInput>(request));
      }

      if (url.pathname === "/api/business" && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request);
        return updateBusinessProfile(env, business, await readJson<UpdateBusinessProfileInput>(request));
      }

      if (url.pathname === "/api/business/credentials" && request.method === "PATCH") {
        const business = await requireAuthenticatedBusiness(env, request);
        return updateBusinessCredentials(env, request, business, await readJson<UpdateCrmCredentialsInput>(request));
      }

      if (url.pathname === "/api/business/photo" && request.method === "POST") {
        const business = await requireAuthenticatedBusiness(env, request);
        return uploadBusinessPhoto(env, business, request);
      }

      if (url.pathname === "/api/business/photo" && request.method === "DELETE") {
        const business = await requireAuthenticatedBusiness(env, request);
        return deleteBusinessPhoto(env, business);
      }

      if (url.pathname === "/api/business/photo" && request.method === "GET") {
        const business = await requireAuthenticatedBusiness(env, request);
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
      if (error instanceof Response) {
        return error;
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
