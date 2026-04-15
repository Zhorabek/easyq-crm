import type { CalendarBookingCard, CalendarStaffColumn } from "../types";
import { formatCurrency, timeToMinutes } from "../lib/date";

const HALF_HOUR_HEIGHT = 36;
const DEFAULT_DAY_START = 8 * 60;
const DEFAULT_DAY_END = 20 * 60;

function buildTimes(dayStart: number, dayEnd: number) {
  return Array.from({ length: (dayEnd - dayStart) / 30 + 1 }, (_, index) => {
    const total = dayStart + index * 30;
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  });
}

function bookingStyle(time: string, duration: number, color: string, dayStart: number, dayEnd: number) {
  const startMinutes = timeToMinutes(time);
  const endMinutes = startMinutes + duration;
  const visibleStart = Math.max(startMinutes, dayStart);
  const visibleEnd = Math.min(endMinutes, dayEnd);

  if (!Number.isFinite(startMinutes) || visibleEnd <= visibleStart) {
    return null;
  }

  const top = ((visibleStart - dayStart) / 30) * HALF_HOUR_HEIGHT;
  const height = Math.max(((visibleEnd - visibleStart) / 30) * HALF_HOUR_HEIGHT - 6, 30);

  return {
    top: `${top}px`,
    height: `${height}px`,
    background: color,
  };
}

function slotStyle(time: string, dayStart: number, dayEnd: number) {
  const minutes = timeToMinutes(time);
  if (!Number.isFinite(minutes) || minutes < dayStart || minutes >= dayEnd) {
    return null;
  }

  const top = ((minutes - dayStart) / 30) * HALF_HOUR_HEIGHT;

  return {
    top: `${top + 6}px`,
  };
}

function resolveMinutes(time: string | undefined, fallback: number) {
  if (!time) return fallback;
  const minutes = timeToMinutes(time);
  return Number.isFinite(minutes) ? minutes : fallback;
}

type DaySchedulerProps = {
  columns: CalendarStaffColumn[];
  bookings: CalendarBookingCard[];
  onOpenBooking: (booking: CalendarBookingCard) => void;
  startTime?: string;
  endTime?: string;
  selectedStaffId: number | null;
  onSelectStaff: (staffId: number | null) => void;
};

export function DayScheduler({
  columns,
  bookings,
  onOpenBooking,
  startTime,
  endTime,
  selectedStaffId,
  onSelectStaff,
}: DaySchedulerProps) {
  const dayStart = resolveMinutes(startTime, DEFAULT_DAY_START);
  const dayEnd = resolveMinutes(endTime, DEFAULT_DAY_END);
  const safeDayEnd = dayEnd > dayStart ? dayEnd : DEFAULT_DAY_END;
  const times = buildTimes(dayStart, safeDayEnd);
  const height = ((safeDayEnd - dayStart) / 30) * HALF_HOUR_HEIGHT;
  const visibleColumns = selectedStaffId == null ? columns : columns.filter((column) => column.id === selectedStaffId);
  const visibleBookings =
    selectedStaffId == null ? bookings : bookings.filter((booking) => (booking.staffId ?? 0) === selectedStaffId);
  const columnTemplate =
    visibleColumns.length <= 1
      ? "minmax(0, 1fr)"
      : visibleColumns.map(() => "minmax(248px, 280px)").join(" ");
  const minWidth = `${96 + Math.max(visibleColumns.length, 1) * 280}px`;

  return (
    <section className="scheduler-card">
      <div className="scheduler-filters">
        <button
          type="button"
          className={`scheduler-filter ${selectedStaffId == null ? "is-active" : ""}`}
          onClick={() => onSelectStaff(null)}
        >
          <strong>Все сотрудники</strong>
          <span>{columns.length} в календаре</span>
        </button>

        {columns.map((column) => (
          <button
            key={column.id}
            type="button"
            className={`scheduler-filter ${selectedStaffId === column.id ? "is-active" : ""}`}
            onClick={() => onSelectStaff(selectedStaffId === column.id ? null : column.id)}
          >
            <strong>{column.name}</strong>
            <span>{column.role}</span>
            <small>
              {column.utilization}% загрузки · {formatCurrency(column.completedRevenue)}
            </small>
          </button>
        ))}
      </div>

      <div className="scheduler-scroll">
        <div className="scheduler-head" style={{ gridTemplateColumns: `96px ${columnTemplate}`, minWidth }}>
          <div className="scheduler-head__axis">
            <span>Рабочие часы</span>
            <strong>
              {times[0]}-{times[times.length - 1]}
            </strong>
          </div>

          {visibleColumns.map((column) => (
            <div key={column.id} className="scheduler-head__col">
              <strong>{column.name}</strong>
              <span>{column.role}</span>
              <small>
                {column.utilization}% загрузки · {formatCurrency(column.completedRevenue)}
              </small>
            </div>
          ))}
        </div>

        <div className="scheduler-body" style={{ gridTemplateColumns: `96px ${columnTemplate}`, minWidth }}>
          <div className="scheduler-time-axis">
            {times.map((time) => (
              <span key={time}>{time}</span>
            ))}
          </div>

          {visibleColumns.map((column) => {
            const columnBookings = visibleBookings.filter((booking) => (booking.staffId ?? 0) === column.id);

            return (
              <div key={column.id} className="scheduler-column" style={{ minHeight: `${height}px` }}>
                {times.slice(0, -1).map((time) => (
                  <div key={time} className="scheduler-cell" />
                ))}

                {column.slots.map((slot) => {
                  const style = slotStyle(slot.time, dayStart, safeDayEnd);
                  if (!style) return null;

                  return (
                    <span key={slot.id} className="scheduler-slot" style={style}>
                      {slot.time}
                    </span>
                  );
                })}

                {columnBookings.map((booking) => {
                  const style = bookingStyle(booking.time, booking.duration, booking.color, dayStart, safeDayEnd);
                  if (!style) return null;

                  return (
                    <button
                      key={booking.id}
                      type="button"
                      className={`scheduler-booking is-${booking.status}`}
                      style={style}
                      onClick={() => onOpenBooking(booking)}
                    >
                      <b>{booking.time}</b>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
