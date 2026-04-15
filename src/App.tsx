import { startTransition, useEffect, useState, useDeferredValue } from "react";
import { ClientTable } from "./components/ClientTable";
import { DayScheduler } from "./components/DayScheduler";
import { EmployeeTable } from "./components/EmployeeTable";
import { KpiStrip } from "./components/KpiStrip";
import { Sidebar } from "./components/Sidebar";
import { ServicesTable } from "./components/ServicesTable";
import {
  createBookingPayment,
  createEmployee,
  createService,
  getCrmPayload,
  patchBookingStatus,
  saveEmployeeSlots,
  updateService,
} from "./lib/api";
import {
  addDays,
  formatCurrency,
  formatLongDate,
  generateHalfHourIntervals,
  isoToday,
  parseBusinessHours,
  statusLabel,
  toHalfHourIntervalLabel,
} from "./lib/date";
import type {
  AppSection,
  BookingStatus,
  CalendarBookingCard,
  ClientRow,
  CrmPayload,
  EmployeeRow,
  PaymentFlow,
  PaymentMethod,
  ServiceCatalogItem,
} from "./types";

type ServiceEditorState = {
  mode: "create" | "edit";
  serviceId?: number;
  name: string;
  price: string;
  duration: string;
  staffIds: number[];
  isActive: boolean;
};

function paymentMethodLabel(method: PaymentMethod) {
  switch (method) {
    case "cash":
      return "Наличные";
    case "card":
      return "Карта";
    case "transfer":
      return "Перевод";
    default:
      return "Другое";
  }
}

function getInitialSlotWeekday(employee: EmployeeRow, anchorDate: string) {
  const firstDayWithSlots = employee.weeklySlots.find((day) => day.slots.length > 0);
  if (firstDayWithSlots) {
    return firstDayWithSlots.weekday;
  }

  return new Date(`${anchorDate}T00:00:00`).getDay();
}

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("calendar");
  const [selectedDate, setSelectedDate] = useState(isoToday());
  const [payload, setPayload] = useState<CrmPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBookingCard | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<EmployeeRow | null>(null);
  const [selectedCalendarStaffId, setSelectedCalendarStaffId] = useState<number | null>(null);
  const [slotEditor, setSlotEditor] = useState<{
    employee: EmployeeRow;
    values: Record<number, string[]>;
    activeWeekday: number;
  } | null>(null);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentFlow, setPaymentFlow] = useState<PaymentFlow>("in");
  const [paymentNote, setPaymentNote] = useState("");
  const [serviceEditor, setServiceEditor] = useState<ServiceEditorState | null>(null);

  const deferredClientSearch = useDeferredValue(clientSearch);
  const deferredEmployeeSearch = useDeferredValue(employeeSearch);
  const deferredServiceSearch = useDeferredValue(serviceSearch);

  useEffect(() => {
    void load(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!payload || selectedCalendarStaffId == null) return;
    const exists = payload.calendar.columns.some((column) => column.id === selectedCalendarStaffId);
    if (!exists) {
      setSelectedCalendarStaffId(null);
    }
  }, [payload, selectedCalendarStaffId]);

  useEffect(() => {
    if (!selectedBooking) {
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentFlow("in");
      setPaymentNote("");
      return;
    }

    setPaymentAmount(
      selectedBooking.payment.remaining > 0 ? String(Math.round(selectedBooking.payment.remaining)) : ""
    );
    setPaymentMethod("cash");
    setPaymentFlow("in");
    setPaymentNote("");
  }, [selectedBooking]);

  async function load(date: string) {
    try {
      setLoading(true);
      setError(null);
      const response = await getCrmPayload(date);
      setPayload(response);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить CRM.");
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    await load(selectedDate);
  }

  async function handleStatusUpdate(status: BookingStatus) {
    if (!selectedBooking) return;
    await patchBookingStatus(selectedBooking.id, status);
    setToast("Статус записи обновлен");
    setSelectedBooking(null);
    await reload();
  }

  async function handleCreateEmployee() {
    const name = newEmployeeName.trim();
    if (!name) return;
    await createEmployee({ name });
    setNewEmployeeName("");
    setToast("Сотрудник добавлен");
    await reload();
  }

  async function handleSaveSlots() {
    if (!slotEditor) return;
    await saveEmployeeSlots(slotEditor.employee.id, {
      weeklySlots: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        slots: slotEditor.values[weekday] ?? [],
      })),
    });
    setSlotEditor(null);
    setToast("Недельные слоты сохранены");
    await reload();
  }

  async function handleSaveService() {
    if (!serviceEditor) return;

    const name = serviceEditor.name.trim();
    const price = Number(serviceEditor.price);
    const duration = Number(serviceEditor.duration);

    if (!name || !Number.isFinite(price) || price < 0 || !Number.isInteger(duration) || duration <= 0) {
      setToast("Заполните название, цену и длительность услуги");
      return;
    }

    if (serviceEditor.mode === "create") {
      await createService({
        name,
        price,
        duration,
        staffIds: serviceEditor.staffIds,
      });
      setToast("Услуга добавлена");
    } else if (serviceEditor.serviceId) {
      await updateService(serviceEditor.serviceId, {
        name,
        price,
        duration,
        staffIds: serviceEditor.staffIds,
        isActive: serviceEditor.isActive,
      });
      setToast("Услуга обновлена");
    }

    setServiceEditor(null);
    await reload();
  }

  async function handleToggleServiceActive(service: ServiceCatalogItem) {
    await updateService(service.id, { isActive: !service.isActive });
    setToast(service.isActive ? "Услуга отправлена в архив" : "Услуга возвращена в каталог");
    if (serviceEditor?.serviceId === service.id) {
      setServiceEditor(null);
    }
    await reload();
  }

  async function handleCreatePayment() {
    if (!selectedBooking) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;

    await createBookingPayment(selectedBooking.id, {
      amount,
      method: paymentMethod,
      flow: paymentFlow,
      note: paymentNote.trim() || undefined,
    });

    setToast(paymentFlow === "in" ? "Платеж добавлен" : "Возврат сохранен");
    setSelectedBooking(null);
    await reload();
  }

  function moveDate(delta: number) {
    startTransition(() => {
      setSelectedDate((current) => addDays(current, delta));
    });
  }

  function openSlotEditor(employee: EmployeeRow) {
    const values = Object.fromEntries(employee.weeklySlots.map((day) => [day.weekday, [...day.slots].sort()]));
    setSlotEditor({
      employee,
      values,
      activeWeekday: getInitialSlotWeekday(employee, selectedDate),
    });
  }

  function toggleSlotInterval(weekday: number, slotTime: string) {
    setSlotEditor((current) => {
      if (!current) return current;
      const currentValues = current.values[weekday] ?? [];
      const exists = currentValues.includes(slotTime);
      const nextValues = exists
        ? currentValues.filter((value) => value !== slotTime)
        : [...currentValues, slotTime].sort();

      return {
        ...current,
        values: {
          ...current.values,
          [weekday]: nextValues,
        },
      };
    });
  }

  function clearDaySlots(weekday: number) {
    setSlotEditor((current) =>
      current
        ? {
            ...current,
            values: {
              ...current.values,
              [weekday]: [],
            },
          }
        : current
    );
  }

  function openCreateServiceEditor() {
    setServiceEditor({
      mode: "create",
      name: "",
      price: "",
      duration: "60",
      staffIds: [],
      isActive: true,
    });
  }

  function openEditServiceEditor(service: ServiceCatalogItem) {
    setServiceEditor({
      mode: "edit",
      serviceId: service.id,
      name: service.name,
      price: String(Math.round(service.price)),
      duration: String(service.duration),
      staffIds: [...service.linkedStaffIds],
      isActive: service.isActive,
    });
  }

  const filteredClients = payload?.clients.filter((client) =>
    `${client.name} ${client.favoriteStaff}`.toLowerCase().includes(deferredClientSearch.toLowerCase())
  ) ?? [];

  const filteredEmployees = payload?.employees.filter((employee) =>
    `${employee.name} ${employee.role} ${employee.linkedServices.join(" ")}`
      .toLowerCase()
      .includes(deferredEmployeeSearch.toLowerCase())
  ) ?? [];

  const filteredServices = payload?.services.filter((service) =>
    `${service.name} ${service.linkedStaffNames.join(" ")}`
      .toLowerCase()
      .includes(deferredServiceSearch.toLowerCase())
  ) ?? [];

  const businessHours = payload ? parseBusinessHours(payload.business.schedule) : null;
  const businessIntervals = payload ? generateHalfHourIntervals(payload.business.schedule) : [];

  return (
    <div className="crm-root">
      <Sidebar
        business={payload?.business ?? null}
        activeSection={activeSection}
        anchorDate={selectedDate}
        onSelectSection={setActiveSection}
        onSelectDate={setSelectedDate}
      />

      <main className="crm-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{payload?.business.name ?? "EasyQ CRM"}</p>
            <h1>{formatLongDate(selectedDate)}</h1>
          </div>

          <div className="topbar__actions">
            <button type="button" className="outline-button" onClick={() => setSelectedDate(isoToday())}>
              Сегодня
            </button>
            <button type="button" className="ghost-button" onClick={() => moveDate(-1)}>
              ‹
            </button>
            <button type="button" className="ghost-button" onClick={() => moveDate(1)}>
              ›
            </button>
            <button type="button" className="outline-button" onClick={() => void reload()}>
              Обновить
            </button>
          </div>
        </header>

        {loading ? (
          <section className="empty-state">
            <h2>Загружаем CRM...</h2>
            <p>Собираем записи, сотрудников, таймслоты и клиентскую историю из D1.</p>
          </section>
        ) : error || !payload ? (
          <section className="empty-state">
            <h2>CRM недоступна</h2>
            <p>{error ?? "Не удалось получить данные CRM."}</p>
          </section>
        ) : (
          <>
            <KpiStrip items={payload.kpis} />

            {activeSection === "overview" && (
              <section className="content-grid content-grid--overview">
                <article className="panel hero-panel">
                  <div className="panel__header">
                    <div>
                      <h2>Сегодня в салоне</h2>
                      <p>
                        {payload.calendar.totalAppointments} записей · {payload.calendar.completedAppointments} пришли ·{" "}
                        {formatCurrency(payload.analytics.collectedToday)} собрано
                      </p>
                    </div>
                  </div>

                  <div className="reservation-list">
                    {payload.reservationsToday.map((reservation) => (
                      <button
                        key={reservation.id}
                        type="button"
                        className="reservation-item"
                        onClick={() =>
                          setSelectedBooking(
                            payload.calendar.bookings.find((booking) => booking.id === reservation.id) ?? null
                          )
                        }
                      >
                        <div>
                          <strong>{reservation.clientName}</strong>
                          <p>
                            {reservation.time} · {reservation.staffName}
                          </p>
                        </div>
                        <span className={`status-pill is-${reservation.status}`}>{statusLabel(reservation.status)}</span>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Выручка по сотрудникам</h2>
                      <p>Кто уже принес больше всего выручки по завершенным визитам.</p>
                    </div>
                  </div>

                  <div className="leaderboard">
                    {payload.analytics.employeeRevenue.map((item) => {
                      const maxRevenue = payload.analytics.employeeRevenue[0]?.revenue || 1;
                      return (
                        <div key={item.staffId} className="leaderboard__row">
                          <div>
                            <strong>{item.staffName}</strong>
                            <p>{item.completedVisits} завершенных визитов</p>
                          </div>
                          <div className="leaderboard__bar">
                            <span style={{ width: `${Math.max((item.revenue / maxRevenue) * 100, 8)}%` }} />
                          </div>
                          <strong>{formatCurrency(item.revenue)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Онлайн-запись</h2>
                      <p>Ссылки, которые уже можно отправлять клиентам.</p>
                    </div>
                  </div>

                  <div className="links-grid">
                    {payload.bookingLinks.map((link) => (
                      <a key={link.id} className={`booking-link-card is-${link.kind}`} href={link.url} target="_blank" rel="noreferrer">
                        <span>{link.subtitle}</span>
                        <strong>{link.title}</strong>
                        <p>{link.description}</p>
                      </a>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {activeSection === "calendar" && (
              <section className="content-grid">
                <div className="panel panel--flat">
                  <div className="panel__header">
                    <div>
                      <h2>Календарь сотрудников</h2>
                      <p>Дневной календарь по всем сотрудникам, с бронями и доступными слотами.</p>
                    </div>
                  </div>
                  <DayScheduler
                    columns={payload.calendar.columns}
                    bookings={payload.calendar.bookings}
                    onOpenBooking={setSelectedBooking}
                    startTime={businessHours?.start}
                    endTime={businessHours?.end}
                    selectedStaffId={selectedCalendarStaffId}
                    onSelectStaff={setSelectedCalendarStaffId}
                  />
                </div>
              </section>
            )}

            {activeSection === "employees" && (
              <section className="content-grid">
                <article className="panel filter-panel">
                  <div className="filter-panel__row">
                    <input
                      className="search-input"
                      value={employeeSearch}
                      onChange={(event) => setEmployeeSearch(event.target.value)}
                      placeholder="Поиск сотрудника по имени, роли или услугам"
                    />
                    <div className="filter-panel__inline">
                      <input
                        className="search-input search-input--small"
                        value={newEmployeeName}
                        onChange={(event) => setNewEmployeeName(event.target.value)}
                        placeholder="Новый сотрудник"
                      />
                      <button type="button" className="primary-button" onClick={() => void handleCreateEmployee()}>
                        Добавить сотрудника
                      </button>
                    </div>
                  </div>
                </article>

                <EmployeeTable
                  employees={filteredEmployees}
                  onOpenSlots={openSlotEditor}
                  onViewSchedule={setSchedulePreview}
                />
              </section>
            )}

            {activeSection === "services" && (
              <section className="content-grid">
                <article className="panel filter-panel">
                  <div className="filter-panel__row">
                    <input
                      className="search-input"
                      value={serviceSearch}
                      onChange={(event) => setServiceSearch(event.target.value)}
                      placeholder="Поиск услуги по названию или назначенному сотруднику"
                    />
                    <div className="filter-panel__inline">
                      <span className="filter-panel__summary">
                        {payload.services.filter((service) => service.isActive).length} активных ·{" "}
                        {payload.services.filter((service) => !service.isActive).length} в архиве
                      </span>
                      <button type="button" className="primary-button" onClick={openCreateServiceEditor}>
                        Добавить услугу
                      </button>
                    </div>
                  </div>
                </article>

                <ServicesTable
                  services={filteredServices}
                  onEdit={openEditServiceEditor}
                  onToggleActive={(service) => void handleToggleServiceActive(service)}
                />
              </section>
            )}

            {activeSection === "clients" && (
              <section className="content-grid">
                <article className="panel filter-panel">
                  <div className="filter-panel__row">
                    <input
                      className="search-input"
                      value={clientSearch}
                      onChange={(event) => setClientSearch(event.target.value)}
                      placeholder="Поиск клиента по имени или любимому мастеру"
                    />
                  </div>
                </article>
                <ClientTable clients={filteredClients} onOpenClient={setSelectedClient} />
              </section>
            )}

            {activeSection === "analytics" && (
              <section className="content-grid content-grid--analytics">
                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Финансовый срез</h2>
                      <p>На основе текущих завершенных визитов из D1.</p>
                    </div>
                  </div>

                  <div className="analytics-cards">
                    <div className="analytics-card">
                      <span>Общая выручка</span>
                      <strong>{formatCurrency(payload.analytics.totalRevenue)}</strong>
                    </div>
                    <div className="analytics-card">
                      <span>За текущий месяц</span>
                      <strong>{formatCurrency(payload.analytics.monthlyRevenue)}</strong>
                    </div>
                    <div className="analytics-card">
                      <span>Собрано сегодня</span>
                      <strong>{formatCurrency(payload.analytics.collectedToday)}</strong>
                    </div>
                    <div className="analytics-card">
                      <span>Остаток к оплате</span>
                      <strong>{formatCurrency(payload.analytics.totalOutstanding)}</strong>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Рейтинг сотрудников</h2>
                      <p>По количеству обслуженных клиентов и выручке.</p>
                    </div>
                  </div>

                  <div className="leaderboard">
                    {payload.analytics.employeeRevenue.map((item, index) => (
                      <div key={item.staffId} className="leaderboard__row">
                        <div>
                          <strong>
                            #{index + 1} {item.staffName}
                          </strong>
                          <p>{item.completedVisits} клиентов обслужено</p>
                        </div>
                        <strong>{formatCurrency(item.revenue)}</strong>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            )}

            {activeSection === "booking" && (
              <section className="content-grid content-grid--booking">
                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Ссылки для онлайн-записи</h2>
                      <p>Публичные ссылки на клиентский бот и быстрые переходы для команды.</p>
                    </div>
                  </div>

                  <div className="links-grid">
                    {payload.bookingLinks.map((link) => (
                      <a key={link.id} href={link.url} target="_blank" rel="noreferrer" className={`booking-link-card is-${link.kind}`}>
                        <span>{link.subtitle}</span>
                        <strong>{link.title}</strong>
                        <p>{link.description}</p>
                      </a>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel__header">
                    <div>
                      <h2>Доступность мастеров</h2>
                      <p>Что уже открыто для бронирования через слоты сотрудников.</p>
                    </div>
                  </div>

                  <div className="availability-list">
                    {payload.employees.map((employee) => (
                      <div key={employee.id} className="availability-item">
                        <strong>{employee.name}</strong>
                        <p>{employee.weeklySlotCount} слотов в неделю · {employee.totalLinkedServices} услуг</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>
            )}
          </>
        )}
      </main>

      {selectedBooking && (
        <aside className="drawer">
          <div className="drawer__header">
            <div>
              <p className="eyebrow">Запись</p>
              <h3>{selectedBooking.clientName}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setSelectedBooking(null)}>
              ✕
            </button>
          </div>

          <div className="drawer__body">
            <div className="detail-card">
              <strong>{selectedBooking.serviceName}</strong>
              <p>
                {selectedBooking.staffName} · {selectedBooking.date} · {selectedBooking.time}
              </p>
              <span className={`status-pill is-${selectedBooking.status}`}>{statusLabel(selectedBooking.status)}</span>
            </div>

            <div className="detail-meta">
              <div>
                <span>Стоимость</span>
                <strong>{formatCurrency(selectedBooking.price)}</strong>
              </div>
              <div>
                <span>Длительность</span>
                <strong>{selectedBooking.duration} мин</strong>
              </div>
              <div>
                <span>Получено</span>
                <strong>{formatCurrency(selectedBooking.payment.net)}</strong>
              </div>
              <div>
                <span>Остаток</span>
                <strong>{formatCurrency(Math.max(selectedBooking.payment.remaining, 0))}</strong>
              </div>
            </div>

            <div className="drawer__actions-grid">
              <button type="button" className="status-action is-pending" onClick={() => void handleStatusUpdate("pending")}>
                Ожидание
              </button>
              <button
                type="button"
                className="status-action is-confirmed"
                onClick={() => void handleStatusUpdate("confirmed")}
              >
                Подтвердил
              </button>
              <button type="button" className="status-action is-done" onClick={() => void handleStatusUpdate("done")}>
                Клиент пришел
              </button>
              <button
                type="button"
                className="status-action is-cancelled"
                onClick={() => void handleStatusUpdate("cancelled")}
              >
                Не пришел
              </button>
            </div>

            <div className="drawer__subsection">
              <h4>Платежи</h4>
              <div className="payment-form">
                <select
                  className="search-input"
                  value={paymentFlow}
                  onChange={(event) => setPaymentFlow(event.target.value as PaymentFlow)}
                >
                  <option value="in">Поступление</option>
                  <option value="out">Возврат</option>
                </select>
                <input
                  className="search-input"
                  value={paymentAmount}
                  onChange={(event) => setPaymentAmount(event.target.value)}
                  placeholder={paymentFlow === "in" ? "Сумма платежа" : "Сумма возврата"}
                  inputMode="decimal"
                />
                <select
                  className="search-input"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                >
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="transfer">Перевод</option>
                  <option value="other">Другое</option>
                </select>
                <input
                  className="search-input"
                  value={paymentNote}
                  onChange={(event) => setPaymentNote(event.target.value)}
                  placeholder={paymentFlow === "in" ? "Комментарий к платежу" : "Причина возврата"}
                />
                <button type="button" className="primary-button" onClick={() => void handleCreatePayment()}>
                  {paymentFlow === "in" ? "Добавить платеж" : "Сохранить возврат"}
                </button>
              </div>

              <div className="history-list">
                {selectedBooking.payment.history.length > 0 ? (
                  selectedBooking.payment.history.map((payment) => (
                    <div key={payment.id} className="history-row">
                      <div>
                        <strong>{paymentMethodLabel(payment.method)}</strong>
                        <p>{payment.createdAt.slice(0, 16).replace("T", " ")}</p>
                      </div>
                      <div>
                        <span className={`status-pill is-${payment.flow === "in" ? "done" : "cancelled"}`}>
                          {payment.flow === "in" ? "Поступление" : "Возврат"}
                        </span>
                        <strong>{formatCurrency(payment.amount)}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>Платежей пока нет.</p>
                )}
              </div>
            </div>

            <div className="drawer__subsection">
              <h4>Информация о клиенте</h4>
              <p>
                Телефон и мессенджеры пока недоступны в текущей схеме ботов, поэтому CRM показывает имя, историю
                визитов и выручку по бронированиям.
              </p>
            </div>
          </div>
        </aside>
      )}

      {selectedClient && (
        <aside className="drawer drawer--wide">
          <div className="drawer__header">
            <div>
              <p className="eyebrow">Клиент</p>
              <h3>{selectedClient.name}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setSelectedClient(null)}>
              ✕
            </button>
          </div>

          <div className="drawer__body">
            <div className="detail-meta">
              <div>
                <span>Всего визитов</span>
                <strong>{selectedClient.totalVisits}</strong>
              </div>
              <div>
                <span>Оплачено</span>
                <strong>{formatCurrency(selectedClient.spentTotal)}</strong>
              </div>
              <div>
                <span>Любимый мастер</span>
                <strong>{selectedClient.favoriteStaff}</strong>
              </div>
            </div>

            <div className="history-list">
              {selectedClient.history.map((visit) => (
                <div key={visit.id} className="history-row">
                  <div>
                    <strong>{visit.serviceName}</strong>
                    <p>
                      {visit.date} · {visit.time} · {visit.staffName}
                    </p>
                  </div>
                  <div>
                    <span className={`status-pill is-${visit.status}`}>{statusLabel(visit.status)}</span>
                    <strong>{formatCurrency(visit.price)}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {schedulePreview && (
        <aside className="drawer drawer--wide">
          <div className="drawer__header">
            <div>
              <p className="eyebrow">Расписание</p>
              <h3>{schedulePreview.name}</h3>
            </div>
            <button type="button" className="ghost-button" onClick={() => setSchedulePreview(null)}>
              ✕
            </button>
          </div>

          <div className="drawer__body">
            <div className="weekly-grid">
              {schedulePreview.weeklySlots.map((day) => (
                <article key={day.weekday} className="weekly-card">
                  <strong>{day.label}</strong>
                  <p>{day.slots.length > 0 ? day.slots.map((slot) => toHalfHourIntervalLabel(slot)).join(", ") : "Слотов нет"}</p>
                </article>
              ))}
            </div>
          </div>
        </aside>
      )}

      {serviceEditor && payload && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="drawer__header">
              <div>
                <p className="eyebrow">{serviceEditor.mode === "create" ? "Новая услуга" : "Редактирование услуги"}</p>
                <h3>{serviceEditor.mode === "create" ? "Каталог услуг" : serviceEditor.name || "Без названия"}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setServiceEditor(null)}>
                ✕
              </button>
            </div>

            <div className="modal__grid">
              <label className="slot-editor-row">
                <span>Название услуги</span>
                <input
                  className="search-input"
                  value={serviceEditor.name}
                  onChange={(event) =>
                    setServiceEditor((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Например, Мужская стрижка"
                />
              </label>

              <label className="slot-editor-row">
                <span>Цена, KZT</span>
                <input
                  className="search-input"
                  value={serviceEditor.price}
                  onChange={(event) =>
                    setServiceEditor((current) =>
                      current
                        ? {
                            ...current,
                            price: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="5000"
                  inputMode="numeric"
                />
              </label>

              <label className="slot-editor-row">
                <span>Длительность, минут</span>
                <input
                  className="search-input"
                  value={serviceEditor.duration}
                  onChange={(event) =>
                    setServiceEditor((current) =>
                      current
                        ? {
                            ...current,
                            duration: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="60"
                  inputMode="numeric"
                />
              </label>

              <div className="slot-editor-row">
                <span>Статус</span>
                <div className="status-toggle-row">
                  <span className={`status-pill is-${serviceEditor.isActive ? "done" : "cancelled"}`}>
                    {serviceEditor.isActive ? "Активна" : "В архиве"}
                  </span>
                  {serviceEditor.mode === "edit" && (
                    <button
                      type="button"
                      className="outline-button"
                      onClick={() =>
                        setServiceEditor((current) =>
                          current
                            ? {
                                ...current,
                                isActive: !current.isActive,
                              }
                            : current
                        )
                      }
                    >
                      {serviceEditor.isActive ? "Отправить в архив" : "Вернуть в каталог"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="drawer__subsection">
              <h4>Сотрудники для услуги</h4>
              <p>Выберите мастеров, которым можно назначать эту услугу в онлайн-записи и CRM.</p>

              <div className="staff-picker">
                {payload.employees.length > 0 ? (
                  payload.employees.map((employee) => {
                    const checked = serviceEditor.staffIds.includes(employee.id);
                    return (
                      <label key={employee.id} className={`staff-picker__item ${checked ? "is-selected" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setServiceEditor((current) =>
                              current
                                ? {
                                    ...current,
                                    staffIds: checked
                                      ? current.staffIds.filter((staffId) => staffId !== employee.id)
                                      : [...current.staffIds, employee.id],
                                  }
                                : current
                            )
                          }
                        />
                        <div>
                          <strong>{employee.name}</strong>
                          <p>{employee.linkedServices[0] ?? "Специалист"}</p>
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <p>Сначала добавьте сотрудников, затем сможете привязать их к услугам.</p>
                )}
              </div>
            </div>

            <div className="modal__footer">
              <button type="button" className="outline-button" onClick={() => setServiceEditor(null)}>
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={() => void handleSaveService()}>
                {serviceEditor.mode === "create" ? "Создать услугу" : "Сохранить изменения"}
              </button>
            </div>
          </section>
        </div>
      )}

      {slotEditor && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="drawer__header">
              <div>
                <p className="eyebrow">Управление слотами</p>
                <h3>{slotEditor.employee.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSlotEditor(null)}>
                ✕
              </button>
            </div>

            <div className="slot-editor-layout">
              {businessHours ? (() => {
                const activeDay =
                  slotEditor.employee.weeklySlots.find((day) => day.weekday === slotEditor.activeWeekday) ??
                  slotEditor.employee.weeklySlots[slotEditor.activeWeekday];
                const selected = new Set(slotEditor.values[slotEditor.activeWeekday] ?? []);

                return (
                  <>
                    <div className="slot-day-tabs" role="tablist" aria-label="Дни недели">
                      {slotEditor.employee.weeklySlots.map((day) => {
                        const count = (slotEditor.values[day.weekday] ?? []).length;
                        const isActive = day.weekday === slotEditor.activeWeekday;
                        return (
                          <button
                            key={day.weekday}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            className={`slot-day-tab ${isActive ? "is-active" : ""}`}
                            onClick={() =>
                              setSlotEditor((current) =>
                                current ? { ...current, activeWeekday: day.weekday } : current
                              )
                            }
                          >
                            <span>{day.label}</span>
                            <small>{count} интервалов</small>
                          </button>
                        );
                      })}
                    </div>

                    <article className="slot-editor-row slot-editor-card">
                      <div className="slot-editor-head">
                        <div>
                          <span>{activeDay.label}</span>
                          <p>
                            {businessHours.start}-{businessHours.end} · {selected.size} интервалов
                          </p>
                        </div>
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => clearDaySlots(slotEditor.activeWeekday)}
                        >
                          Очистить день
                        </button>
                      </div>

                      <div className="slot-chip-grid">
                        {businessIntervals.map((interval) => {
                          const isSelected = selected.has(interval.start);
                          return (
                            <button
                              key={`${slotEditor.activeWeekday}-${interval.start}`}
                              type="button"
                              className={`slot-chip ${isSelected ? "is-selected" : ""}`}
                              onClick={() => toggleSlotInterval(slotEditor.activeWeekday, interval.start)}
                            >
                              {interval.label}
                            </button>
                          );
                        })}
                      </div>
                    </article>
                  </>
                );
              })() : (
                <article className="drawer__subsection">
                  <h4>Невозможно построить интервалы</h4>
                  <p>Обновите график бизнеса в профиле в формате вроде 09:00-17:00, чтобы управлять слотами кнопками.</p>
                </article>
              )}
            </div>

            <div className="modal__footer">
              <button type="button" className="outline-button" onClick={() => setSlotEditor(null)}>
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={() => void handleSaveSlots()}>
                Сохранить слоты
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;
