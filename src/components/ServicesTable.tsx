import { formatCurrency } from "../lib/date";
import type { ServiceCatalogItem } from "../types";

type ServicesTableProps = {
  services: ServiceCatalogItem[];
  onEdit: (service: ServiceCatalogItem) => void;
  onToggleActive: (service: ServiceCatalogItem) => void;
};

export function ServicesTable({ services, onEdit, onToggleActive }: ServicesTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Каталог услуг</h2>
          <p>Создавайте услуги, редактируйте цену и длительность, назначайте мастеров.</p>
        </div>
      </div>

      <div className="table services-table">
        <div className="table__head">
          <span>Услуга</span>
          <span>Цена</span>
          <span>Сотрудники</span>
          <span>Записи</span>
          <span>Выручка</span>
          <span>Статус</span>
          <span />
        </div>

        {services.length > 0 ? (
          services.map((service) => (
            <div key={service.id} className="table__row">
              <div>
                <strong>{service.name}</strong>
                <p>{service.duration} мин</p>
              </div>
              <div>
                <strong>{formatCurrency(service.price)}</strong>
                <p>Базовая цена</p>
              </div>
              <div>
                <strong>{service.linkedStaffIds.length}</strong>
                <p>{service.linkedStaffNames.slice(0, 3).join(", ") || "Еще не назначены"}</p>
              </div>
              <div>
                <strong>{service.bookingsCount}</strong>
                <p>{service.upcomingBookings} впереди</p>
              </div>
              <div>
                <strong>{formatCurrency(service.completedRevenue)}</strong>
                <p>По всем оплатам</p>
              </div>
              <div>
                <span className={`status-pill is-${service.isActive ? "done" : "cancelled"}`}>
                  {service.isActive ? "Активна" : "В архиве"}
                </span>
              </div>
              <div className="table__actions">
                <button type="button" className="outline-button" onClick={() => onEdit(service)}>
                  Изменить
                </button>
                <button type="button" className="outline-button" onClick={() => onToggleActive(service)}>
                  {service.isActive ? "В архив" : "Вернуть"}
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="table__row table__row--empty">
            <div>
              <strong>Услуги не найдены</strong>
              <p>Попробуйте другой поиск или создайте новую услугу.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
