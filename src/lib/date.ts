const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatLocalDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseUtcDate(dateIso: string) {
  return new Date(`${dateIso}T00:00:00Z`);
}

export function isoToday(): string {
  return formatLocalDate(new Date());
}

export function addDays(dateIso: string, days: number): string {
  const value = parseUtcDate(dateIso);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function formatLongDate(dateIso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
    timeZone: "UTC",
  }).format(parseUtcDate(dateIso));
}

export function getMonthMatrix(anchorIso: string) {
  const anchor = parseUtcDate(anchorIso);
  const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const gridStart = new Date(monthStart);
  gridStart.setUTCDate(monthStart.getUTCDate() - monthStart.getUTCDay());

  return Array.from({ length: 35 }, (_, index) => {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    return {
      iso: current.toISOString().slice(0, 10),
      label: current.getUTCDate(),
      weekday: WEEKDAY_LABELS[current.getUTCDay()],
      outside: current.getUTCMonth() !== anchor.getUTCMonth(),
    };
  });
}

export function monthTitle(anchorIso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseUtcDate(anchorIso));
}

export function formatShortDate(dateIso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parseUtcDate(dateIso));
}

export function timeToMinutes(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function normalizeTime(time: string) {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseBusinessHours(schedule: string) {
  const matches = Array.from(schedule.matchAll(/\b(\d{1,2}:\d{2})\b/g))
    .map((match) => normalizeTime(match[1] ?? ""))
    .filter((value): value is string => Boolean(value));

  if (matches.length < 2) return null;

  const start = matches[0];
  const end = matches[1];
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return null;
  }

  return {
    start,
    end,
    startMinutes,
    endMinutes,
  };
}

export function generateHalfHourIntervals(schedule: string) {
  const hours = parseBusinessHours(schedule);
  if (!hours) return [];

  const intervals: Array<{ start: string; end: string; label: string }> = [];
  for (let cursor = hours.startMinutes; cursor + 30 <= hours.endMinutes; cursor += 30) {
    const start = minutesToTime(cursor);
    const end = minutesToTime(cursor + 30);
    intervals.push({
      start,
      end,
      label: `${start}-${end}`,
    });
  }

  return intervals;
}

export function toHalfHourIntervalLabel(startTime: string) {
  const minutes = timeToMinutes(startTime);
  if (!Number.isFinite(minutes)) return startTime;
  return `${minutesToTime(minutes)}-${minutesToTime(minutes + 30)}`;
}

export function statusLabel(status: string) {
  if (status === "done") return "Пришел";
  if (status === "confirmed") return "Подтвержден";
  if (status === "cancelled") return "Не пришел";
  return "Ожидает";
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
  }).format(amount);
}
