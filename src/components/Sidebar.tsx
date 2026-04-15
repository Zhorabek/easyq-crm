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

type SidebarProps = {
  business: BusinessProfile | null;
  activeSection: AppSection;
  anchorDate: string;
  onSelectSection: (section: AppSection) => void;
  onSelectDate: (date: string) => void;
};

export function Sidebar({ business, activeSection, anchorDate, onSelectSection, onSelectDate }: SidebarProps) {
  const days = getMonthMatrix(anchorDate);

  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <div className="sidebar__logo">E</div>
        <div>
          <strong>{business?.name ?? "EasyQ CRM"}</strong>
          <p>{business?.type ?? "Booking dashboard"}</p>
        </div>
      </div>

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
              onClick={() => onSelectDate(day.iso)}
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
            onClick={() => onSelectSection(section.id)}
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
