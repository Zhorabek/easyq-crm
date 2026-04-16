import { formatCurrency } from "../lib/date";
import type { EmployeeRow } from "../types";

type EmployeeTableProps = {
  employees: EmployeeRow[];
  onOpenSlots: (employee: EmployeeRow) => void;
  onViewSchedule: (employee: EmployeeRow) => void;
  onEditEmployee: (employee: EmployeeRow) => void;
};

export function EmployeeTable({ employees, onOpenSlots, onViewSchedule, onEditEmployee }: EmployeeTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Команда</h2>
          <p>Управление сотрудниками, слотами и загрузкой.</p>
        </div>
      </div>

      <div className="table employees-table">
        <div className="table__head">
          <span>Сотрудник</span>
          <span>Услуги</span>
          <span>Сегодня</span>
          <span>Выручка</span>
          <span>Слоты</span>
          <span />
        </div>

        {employees.map((employee) => (
          <div key={employee.id} className="table__row">
            <div>
              <strong>{employee.name}</strong>
              <p>{employee.role}</p>
            </div>
            <div>
              <strong>{employee.totalLinkedServices}</strong>
              <p>{employee.linkedServices.slice(0, 2).join(", ") || "Еще не привязаны"}</p>
            </div>
            <div>
              <strong>{employee.todayBookings}</strong>
              <p>{employee.upcomingBookings} впереди</p>
            </div>
            <div>
              <strong>{formatCurrency(employee.completedRevenue)}</strong>
              <p>{formatCurrency(employee.todayRevenue)} за день</p>
            </div>
            <div>
              <strong>{employee.weeklySlotCount}</strong>
              <p>{employee.utilization}% загрузки сегодня</p>
            </div>
            <div className="table__actions">
              <button type="button" className="outline-button" onClick={() => onEditEmployee(employee)}>
                Редактировать
              </button>
              <button type="button" className="outline-button" onClick={() => onViewSchedule(employee)}>
                Расписание
              </button>
              <button type="button" className="primary-button" onClick={() => onOpenSlots(employee)}>
                Слоты
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
