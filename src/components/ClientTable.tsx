import { formatCurrency } from "../lib/date";
import type { ClientRow } from "../types";

type ClientTableProps = {
  clients: ClientRow[];
  onOpenClient: (client: ClientRow) => void;
};

export function ClientTable({ clients, onOpenClient }: ClientTableProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <h2>Клиенты</h2>
          <p>История визитов, лояльность и выручка по каждому клиенту.</p>
        </div>
      </div>

      <div className="table clients-table">
        <div className="table__head">
          <span>Клиент</span>
          <span>Визиты</span>
          <span>Будущие</span>
          <span>Потрачено</span>
          <span>Любимый мастер</span>
          <span />
        </div>

        {clients.map((client) => (
          <div key={client.key} className="table__row">
            <div>
              <strong>{client.name}</strong>
              <p>{client.lastVisit ? client.lastVisit.slice(0, 16).replace("T", " ") : "Еще не приходил"}</p>
            </div>
            <div>
              <strong>{client.completedVisits}</strong>
              <p>{client.cancelledVisits} отмен</p>
            </div>
            <div>
              <strong>{client.upcomingVisits}</strong>
              <p>{client.totalVisits} всего визитов</p>
            </div>
            <div>
              <strong>{formatCurrency(client.spentTotal)}</strong>
              <p>на {client.completedVisits} завершенных визитах</p>
            </div>
            <div>
              <strong>{client.favoriteStaff}</strong>
              <p>{client.history[0]?.serviceName ?? "—"}</p>
            </div>
            <div className="table__actions">
              <button type="button" className="outline-button" onClick={() => onOpenClient(client)}>
                История
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
