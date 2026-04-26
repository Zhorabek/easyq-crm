import type { AppSection, BusinessProfile } from "../types";
import { getMonthMatrix, monthTitle } from "../lib/date";

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

const SECTIONS: Array<{ id: AppSection; label: string }> = [
  { id: "calendar", label: "Календарь" },
  { id: "overview", label: "Обзор" },
  { id: "employees", label: "Сотрудники" },
  { id: "services", label: "Услуги" },
  { id: "clients", label: "Клиенты" },
  { id: "analytics", label: "Аналитика" },
  { id: "booking", label: "Онлайн-запись" },
];

function formatBusinessTypeLabel(value: string | undefined) {
  if (!value) return "Booking dashboard";
  if (value === "beauty_salon" || value === "salon") return "Салон красоты";
  if (value === "barbershop") return "Барбершоп";
  if (value === "carwash") return "Автомойка";
  if (value === "spa_salon") return "SPA-салон";
  if (value === "dentistry") return "Стоматология";
  if (value === "medical_services") return "Медицинские услуги";
  if (value === "other") return "Другое";
  return value.replaceAll("_", " ");
}

type SidebarProps = {
  business: BusinessProfile | null;
  activeSection: AppSection;
  anchorDate: string;
  mobileOpen?: boolean;
  onClose?: () => void;
  onSelectSection: (section: AppSection) => void;
  onSelectDate: (date: string) => void;
};

export function Sidebar({
  business,
  activeSection,
  anchorDate,
  mobileOpen = false,
  onClose,
  onSelectSection,
  onSelectDate,
}: SidebarProps) {
  const days = getMonthMatrix(anchorDate);

  function selectSection(section: AppSection) {
    onSelectSection(section);
    onClose?.();
  }

  function selectDate(date: string) {
    onSelectDate(date);
    onClose?.();
  }

  return (
    <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
      <div className="sidebar__mobile-head">
        <strong>Меню CRM</strong>
        <button type="button" className="ghost-button sidebar__close" aria-label="Закрыть меню" onClick={onClose}>
          ✕
        </button>
      </div>

      <button
        type="button"
        className={`sidebar__brand sidebar__brand-button ${activeSection === "profile" ? "is-active" : ""}`}
        onClick={() => selectSection("profile")}
      >
        <div className="sidebar__logo">E</div>
        <div>
          <strong>{business?.name ?? "EasyQ CRM"}</strong>
          <p>{formatBusinessTypeLabel(business?.type)}</p>
        </div>
      </button>

      <div className="sidebar__calendar">
        <div className="sidebar__calendar-head">
          <button type="button" className="ghost-button">
            ‹
          </button>
          <strong>{monthTitle(anchorDate)}</strong>
          <button type="button" className="ghost-button">
            ›
          </button>
        </div>
        <div className="sidebar__weekday-row">
          {WEEKDAYS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="sidebar__days">
          {days.map((day) => (
            <button
              key={day.iso}
              type="button"
              className={`sidebar__day ${day.iso === anchorDate ? "is-active" : ""} ${day.outside ? "is-outside" : ""}`}
              onClick={() => selectDate(day.iso)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="sidebar__nav">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`sidebar__nav-item ${activeSection === section.id ? "is-active" : ""}`}
            onClick={() => selectSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>

      <div className="sidebar__footer">
        <p>EasyQueue CRM</p>
        <span>Shared with your bots and D1</span>
      </div>
    </aside>
  );
}
