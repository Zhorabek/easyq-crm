import { startTransition, useEffect, useRef, useState, useDeferredValue, type ChangeEvent, type FormEvent } from "react";
import { ClientTable } from "./components/ClientTable";
import { DayScheduler } from "./components/DayScheduler";
import { EmployeeTable } from "./components/EmployeeTable";
import { KpiStrip } from "./components/KpiStrip";
import { Sidebar } from "./components/Sidebar";
import { ServicesTable } from "./components/ServicesTable";
import {
  ApiError,
  createBookingPayment,
  createEmployee,
  createService,
  deleteBusinessPhoto,
  deleteEmployee,
  getAuthSession,
  getCrmPayload,
  login,
  logout,
  patchBookingStatus,
  saveEmployeeSlots,
  updateBusinessProfile,
  updateCrmCredentials,
  updateEmployee,
  updateService,
  uploadBusinessPhoto,
} from "./lib/api";
import {
  addDays,
  formatCurrency,
  formatLongDate,
  formatShortDate,
  generateHalfHourIntervals,
  isoToday,
  parseBusinessHours,
  statusLabel,
  toHalfHourIntervalLabel,
} from "./lib/date";
import type {
  AppSection,
  AuthSession,
  BookingStatus,
  CalendarBookingCard,
  ClientRow,
  CrmPayload,
  EmployeeRow,
  PaymentFlow,
  PaymentMethod,
  ServiceCatalogItem,
  UpdateBusinessProfileInput,
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

type EmployeeEditorState = {
  employee: EmployeeRow;
  name: string;
};

type BusinessEditorState = {
  name: string;
  type: string;
  address: string;
  phone: string;
  schedule: string;
  description: string;
};

const BUSINESS_TYPE_OPTIONS = [
  { value: "barbershop", label: "Барбершоп" },
  { value: "beauty_salon", label: "Салон красоты" },
  { value: "carwash", label: "Автомойка" },
  { value: "spa_salon", label: "SPA-салон" },
  { value: "dentistry", label: "Стоматология" },
  { value: "medical_services", label: "Медицинские услуги" },
  { value: "other", label: "Другое" },
] as const;

const MOBILE_NAV_QUERY = "(max-width: 900px)";

function getDefaultSectionForViewport(): AppSection {
  if (typeof window !== "undefined" && window.matchMedia(MOBILE_NAV_QUERY).matches) {
    return "overview";
  }

  return "calendar";
}

function normalizeBusinessTypeValue(value: string) {
  return value === "salon" ? "beauty_salon" : value;
}

function getBusinessTypeLabel(value: string) {
  const normalized = normalizeBusinessTypeValue(value);
  return BUSINESS_TYPE_OPTIONS.find((option) => option.value === normalized)?.label ?? value;
}

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
  const [activeSection, setActiveSection] = useState<AppSection>(() => getDefaultSectionForViewport());
  const [selectedDate, setSelectedDate] = useState(isoToday());
  const [payload, setPayload] = useState<CrmPayload | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<CalendarBookingCard | null>(null);
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);
  const [schedulePreview, setSchedulePreview] = useState<EmployeeRow | null>(null);
  const [selectedCalendarStaffId, setSelectedCalendarStaffId] = useState<number | null>(null);
  const [slotEditor, setSlotEditor] = useState<{
    employee: EmployeeRow;
    values: Record<number, string[]>;
    breakValues: Record<number, string[]>;
    dayOffs: Record<string, { isFullDay: boolean; slots: string[] }>;
    activeWeekday: number;
    activeDayOffDate: string;
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
  const [employeeEditor, setEmployeeEditor] = useState<EmployeeEditorState | null>(null);
  const [businessEditor, setBusinessEditor] = useState<BusinessEditorState | null>(null);
  const [credentialsEditor, setCredentialsEditor] = useState<{
    username: string;
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  } | null>(null);
  const [businessPhotoBroken, setBusinessPhotoBroken] = useState(false);
  const businessPhotoInputRef = useRef<HTMLInputElement | null>(null);

  const deferredClientSearch = useDeferredValue(clientSearch);
  const deferredEmployeeSearch = useDeferredValue(employeeSearch);
  const deferredServiceSearch = useDeferredValue(serviceSearch);

  useEffect(() => {
    void bootstrapAuth();
  }, []);

  useEffect(() => {
    if (!session) {
      setPayload(null);
      setLoading(false);
      return;
    }

    void load(selectedDate);
  }, [selectedDate, session?.businessId]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileNavOpen]);

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

  useEffect(() => {
    setBusinessPhotoBroken(false);
  }, [payload?.business.photoFileId]);

  async function bootstrapAuth() {
    try {
      const nextSession = await getAuthSession();
      setSession(nextSession);
      setLoginForm((current) => ({
        ...current,
        username: nextSession.username,
        password: "",
      }));
    } catch (authError) {
      if (authError instanceof ApiError && authError.status === 401) {
        setSession(null);
        setLoginError(null);
        return;
      }

      setError(authError instanceof Error ? authError.message : "Не удалось проверить сессию CRM.");
    } finally {
      setAuthChecking(false);
    }
  }

  async function load(date: string) {
    try {
      setLoading(true);
      setError(null);
      const response = await getCrmPayload(date);
      setPayload(response);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        setSession(null);
        setPayload(null);
        setError(null);
        setSelectedBooking(null);
        setSelectedClient(null);
        setSchedulePreview(null);
        setSlotEditor(null);
        setLoginForm((current) => ({ ...current, password: "" }));
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить CRM.");
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    await load(selectedDate);
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const username = loginForm.username.trim();
    const password = loginForm.password;

    if (!username || !password) {
      setLoginError("Введите логин и пароль.");
      return;
    }

    try {
      setAuthSubmitting(true);
      setLoginError(null);
      const response = await login({ username, password });
      setSession(response.session);
      setActiveSection(getDefaultSectionForViewport());
      setError(null);
      setLoginForm({
        username: response.session.username,
        password: "",
      });
    } catch (authError) {
      setLoginError(authError instanceof Error ? authError.message : "Не удалось выполнить вход.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setSession(null);
      setActiveSection(getDefaultSectionForViewport());
      setMobileNavOpen(false);
      setPayload(null);
      setSelectedBooking(null);
      setSelectedClient(null);
      setSchedulePreview(null);
      setSlotEditor(null);
      setBusinessEditor(null);
      setCredentialsEditor(null);
      setError(null);
      setLoginError(null);
      setLoginForm((current) => ({
        username: current.username,
        password: "",
      }));
    }
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

  async function handleSaveEmployee() {
    if (!employeeEditor) return;

    const name = employeeEditor.name.trim();
    if (!name) {
      setToast("Введите имя сотрудника");
      return;
    }

    try {
      await updateEmployee(employeeEditor.employee.id, { name });
      setEmployeeEditor(null);
      setToast("Карточка сотрудника обновлена");
      await reload();
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : "Не удалось сохранить сотрудника");
    }
  }

  async function handleDeleteEmployee() {
    if (!employeeEditor) return;

    try {
      await deleteEmployee(employeeEditor.employee.id);
      setEmployeeEditor(null);
      setSchedulePreview((current) => (current?.id === employeeEditor.employee.id ? null : current));
      setSlotEditor((current) => (current?.employee.id === employeeEditor.employee.id ? null : current));
      setToast("Сотрудник удален");
      await reload();
    } catch (deleteError) {
      setToast(deleteError instanceof Error ? deleteError.message : "Не удалось удалить сотрудника");
    }
  }

  async function handleSaveSlots() {
    if (!slotEditor) return;
    await saveEmployeeSlots(slotEditor.employee.id, {
      weeklySlots: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        slots: slotEditor.values[weekday] ?? [],
      })),
      weeklyBreaks: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        slots: slotEditor.breakValues[weekday] ?? [],
      })),
      dayOffs: Object.entries(slotEditor.dayOffs)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, value]) => ({
          date,
          isFullDay: value.isFullDay,
          slots: value.isFullDay ? [] : [...value.slots].sort(),
        })),
    });
    setSlotEditor(null);
    setToast("Расписание сотрудника сохранено");
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

  async function handleSaveBusinessProfile() {
    if (!businessEditor) return;

    const input: UpdateBusinessProfileInput = {
      name: businessEditor.name.trim(),
      type: businessEditor.type,
      address: businessEditor.address.trim(),
      phone: businessEditor.phone.trim(),
      schedule: businessEditor.schedule.trim(),
      description: businessEditor.description.trim() || null,
    };

    if (!input.name || !input.address || !input.phone || !input.schedule) {
      setToast("Заполните название, адрес, телефон и график");
      return;
    }

    try {
      await updateBusinessProfile(input);
      setBusinessEditor(null);
      setToast("Профиль бизнеса обновлен");
      await reload();
    } catch (saveError) {
      setToast(saveError instanceof Error ? saveError.message : "Не удалось обновить профиль бизнеса");
    }
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

  async function handleBusinessPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      await uploadBusinessPhoto(file);
      setToast("Постер бизнеса обновлен");
      await reload();
    } catch (uploadError) {
      setToast(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фото");
    }
  }

  async function handleDeleteBusinessPhoto() {
    try {
      await deleteBusinessPhoto();
      setToast("Постер бизнеса удален");
      await reload();
    } catch (deleteError) {
      setToast(deleteError instanceof Error ? deleteError.message : "Не удалось удалить фото");
    }
  }

  async function handleSaveCrmCredentials() {
    if (!credentialsEditor) return;

    const username = credentialsEditor.username.trim();
    const currentPassword = credentialsEditor.currentPassword;
    const newPassword = credentialsEditor.newPassword.trim();
    const confirmPassword = credentialsEditor.confirmPassword.trim();

    if (!username || !currentPassword) {
      setToast("Укажите логин и текущий пароль");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      setToast("Новый пароль и подтверждение не совпадают");
      return;
    }

    try {
      const response = await updateCrmCredentials({
        username,
        currentPassword,
        newPassword: newPassword || undefined,
      });
      setSession(response.session);
      setCredentialsEditor(null);
      setToast("CRM логин и пароль обновлены");
      await reload();
    } catch (credentialsError) {
      setToast(credentialsError instanceof Error ? credentialsError.message : "Не удалось обновить CRM доступ");
    }
  }

  function moveDate(delta: number) {
    startTransition(() => {
      setSelectedDate((current) => addDays(current, delta));
    });
  }

  function handleSelectSection(section: AppSection) {
    setActiveSection(section);
    setMobileNavOpen(false);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setMobileNavOpen(false);
  }

  function openEmployeeEditor(employee: EmployeeRow) {
    setEmployeeEditor({
      employee,
      name: employee.name,
    });
  }

  function openBusinessEditor() {
    if (!payload) return;

    setBusinessEditor({
      name: payload.business.name,
      type: normalizeBusinessTypeValue(payload.business.type),
      address: payload.business.address,
      phone: payload.business.phone,
      schedule: payload.business.schedule,
      description: payload.business.description ?? "",
    });
  }

  function openBusinessPhotoPicker() {
    businessPhotoInputRef.current?.click();
  }

  function openCredentialsEditor() {
    if (!payload?.business.crmUsername) return;

    setCredentialsEditor({
      username: payload.business.crmUsername,
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  }

  function openSlotEditor(employee: EmployeeRow) {
    const values = Object.fromEntries(employee.weeklySlots.map((day) => [day.weekday, [...day.slots].sort()]));
    const breakValues = Object.fromEntries(employee.weeklyBreaks.map((day) => [day.weekday, [...day.slots].sort()]));
    const dayOffs = Object.fromEntries(
      employee.dayOffs.map((dayOff) => [
        dayOff.date,
        {
          isFullDay: dayOff.isFullDay,
          slots: [...dayOff.slots].sort(),
        },
      ])
    );
    setSlotEditor({
      employee,
      values,
      breakValues,
      dayOffs,
      activeWeekday: getInitialSlotWeekday(employee, selectedDate),
      activeDayOffDate: employee.dayOffs[0]?.date ?? selectedDate,
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

  function toggleBreakInterval(weekday: number, slotTime: string) {
    setSlotEditor((current) => {
      if (!current) return current;
      const currentValues = current.breakValues[weekday] ?? [];
      const exists = currentValues.includes(slotTime);
      const nextValues = exists
        ? currentValues.filter((value) => value !== slotTime)
        : [...currentValues, slotTime].sort();

      return {
        ...current,
        breakValues: {
          ...current.breakValues,
          [weekday]: nextValues,
        },
      };
    });
  }

  function clearBreaks(weekday: number) {
    setSlotEditor((current) =>
      current
        ? {
            ...current,
            breakValues: {
              ...current.breakValues,
              [weekday]: [],
            },
          }
        : current
    );
  }

  function updateDayOff(date: string, updater: (current: { isFullDay: boolean; slots: string[] }) => { isFullDay: boolean; slots: string[] }) {
    setSlotEditor((current) => {
      if (!current) return current;
      const next = updater(current.dayOffs[date] ?? { isFullDay: false, slots: [] });
      const normalizedSlots = next.isFullDay ? [] : [...next.slots].sort();
      const hasValue = next.isFullDay || normalizedSlots.length > 0;
      const dayOffs = { ...current.dayOffs };

      if (hasValue) {
        dayOffs[date] = {
          isFullDay: next.isFullDay,
          slots: normalizedSlots,
        };
      } else {
        delete dayOffs[date];
      }

      return {
        ...current,
        dayOffs,
      };
    });
  }

  function toggleDayOffFullDay(date: string) {
    updateDayOff(date, (current) => ({
      isFullDay: !current.isFullDay,
      slots: !current.isFullDay ? [] : current.slots,
    }));
  }

  function toggleDayOffInterval(date: string, slotTime: string) {
    updateDayOff(date, (current) => {
      const sourceSlots = current.isFullDay ? [] : current.slots;
      const exists = sourceSlots.includes(slotTime);
      const nextSlots = exists ? sourceSlots.filter((value) => value !== slotTime) : [...sourceSlots, slotTime];
      return {
        isFullDay: false,
        slots: nextSlots,
      };
    });
  }

  function clearDayOff(date: string) {
    setSlotEditor((current) => {
      if (!current) return current;
      const dayOffs = { ...current.dayOffs };
      delete dayOffs[date];
      return {
        ...current,
        dayOffs,
      };
    });
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
  const topbarEyebrow = activeSection === "profile" ? "Профиль бизнеса" : payload?.business.name ?? "EasyQ CRM";
  const topbarTitle = activeSection === "profile" ? payload?.business.name ?? "EasyQ CRM" : formatLongDate(selectedDate);

  if (authChecking) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">EasyQueue CRM</p>
          <h1>Проверяем доступ</h1>
          <p>Подключаем текущую CRM-сессию и загружаем рабочее пространство бизнеса.</p>
        </section>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">EasyQueue CRM</p>
          <h1>Вход для бизнеса</h1>
          <p className="auth-card__lead">
            Используйте тестовый логин и пароль из business bot. После входа вы сможете сменить их на свои.
          </p>

          <form className="auth-form" onSubmit={(event) => void handleLoginSubmit(event)}>
            <label className="slot-editor-row">
              <span>Логин</span>
              <input
                className="search-input"
                value={loginForm.username}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    username: event.target.value,
                  }))
                }
                autoComplete="username"
                placeholder="Например, bestbarber_4"
              />
            </label>

            <label className="slot-editor-row">
              <span>Пароль</span>
              <input
                className="search-input"
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
                autoComplete="current-password"
                placeholder="Введите временный пароль"
              />
            </label>

            {(loginError || error) && <p className="auth-form__error">{loginError ?? error}</p>}

            <button type="submit" className="primary-button auth-form__submit" disabled={authSubmitting}>
              {authSubmitting ? "Входим..." : "Войти в CRM"}
            </button>
          </form>

          <div className="auth-card__hint">
            <strong>Где взять данные?</strong>
            <p>
              Откройте business bot, перейдите в профиль бизнеса и нажмите <code>CRM доступ</code>. Для старых бизнесов бот
              покажет временные credentials или позволит сбросить пароль.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="crm-root">
      <Sidebar
        business={payload?.business ?? null}
        activeSection={activeSection}
        anchorDate={selectedDate}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onSelectSection={handleSelectSection}
        onSelectDate={handleSelectDate}
      />
      <button
        type="button"
        className={`mobile-nav-backdrop ${mobileNavOpen ? "is-open" : ""}`}
        aria-label="Закрыть меню"
        onClick={() => setMobileNavOpen(false)}
      />

      <main className="crm-main">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label="Открыть меню CRM"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen(true)}
          >
            ☰
          </button>

          <div className="topbar__title">
            <p className="eyebrow">{topbarEyebrow}</p>
            <h1>{topbarTitle}</h1>
          </div>

          <div className="topbar__actions">
            {activeSection !== "profile" && (
              <>
                <button type="button" className="outline-button" onClick={() => setSelectedDate(isoToday())}>
                  Сегодня
                </button>
                <button type="button" className="ghost-button" onClick={() => moveDate(-1)}>
                  ‹
                </button>
                <button type="button" className="ghost-button" onClick={() => moveDate(1)}>
                  ›
                </button>
              </>
            )}
            <button type="button" className="outline-button" onClick={() => void reload()}>
              Обновить
            </button>
            <button type="button" className="outline-button" onClick={() => void handleLogout()}>
              Выйти
            </button>
          </div>
        </header>

        <input
          ref={businessPhotoInputRef}
          className="visually-hidden"
          type="file"
          accept="image/*"
          onChange={(event) => void handleBusinessPhotoSelected(event)}
        />

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

            {activeSection === "profile" && (
              <section className="content-grid">
                <article className="panel business-profile">
                  <div className="business-profile__hero">
                    <div className="business-profile__media">
                      {payload.business.photoFileId && !businessPhotoBroken ? (
                        <img
                          src={`/api/business/photo?v=${encodeURIComponent(payload.generatedAt)}`}
                          alt={payload.business.name}
                          className="business-profile__image"
                          onError={() => setBusinessPhotoBroken(true)}
                        />
                      ) : (
                        <div className="business-profile__placeholder">
                          <span>{payload.business.name.slice(0, 1).toUpperCase()}</span>
                          <small>Постер бизнеса</small>
                        </div>
                      )}
                    </div>

                    <div className="business-profile__content">
                      <span className="business-profile__badge">{getBusinessTypeLabel(payload.business.type)}</span>
                      <h2>{payload.business.name}</h2>
                      <p className="business-profile__description">
                        {payload.business.description?.trim() || "Добавьте описание бизнеса, чтобы команда и клиенты лучше понимали ваше позиционирование."}
                      </p>

                      <div className="business-profile__actions">
                        <button type="button" className="primary-button" onClick={openBusinessEditor}>
                          Редактировать профиль
                        </button>
                        <button type="button" className="outline-button" onClick={openBusinessPhotoPicker}>
                          {payload.business.photoFileId ? "Обновить фото" : "Загрузить фото"}
                        </button>
                        {payload.business.photoFileId && (
                          <button type="button" className="outline-button danger-button" onClick={() => void handleDeleteBusinessPhoto()}>
                            Удалить фото
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="business-profile__grid">
                    <article className="business-profile__card">
                      <span>Название</span>
                      <strong>{payload.business.name}</strong>
                    </article>
                    <article className="business-profile__card">
                      <span>Категория</span>
                      <strong>{getBusinessTypeLabel(payload.business.type)}</strong>
                    </article>
                    <article className="business-profile__card">
                      <span>Адрес</span>
                      <strong>{payload.business.address}</strong>
                    </article>
                    <article className="business-profile__card">
                      <span>Телефон</span>
                      <strong>{payload.business.phone}</strong>
                    </article>
                    <article className="business-profile__card">
                      <span>График работы</span>
                      <strong>{payload.business.schedule}</strong>
                    </article>
                    <article className="business-profile__card">
                      <span>Описание</span>
                      <strong>{payload.business.description?.trim() || "Пока не добавлено"}</strong>
                    </article>
                  </div>

                  <article className="business-profile__security">
                    <div>
                      <span className="business-profile__security-label">CRM доступ</span>
                      <strong>{payload.business.crmUsername ?? "—"}</strong>
                      <p>
                        {payload.business.crmHasTemporaryPassword
                          ? "Сейчас вы используете временный пароль. Рекомендуем сменить логин и пароль после первого входа."
                          : "Пароль уже изменён и больше не показывается в business bot. Здесь вы можете обновить логин и задать новый пароль."}
                      </p>
                    </div>

                    <div className="business-profile__actions business-profile__actions--compact">
                      <button type="button" className="primary-button" onClick={openCredentialsEditor}>
                        Изменить логин и пароль
                      </button>
                      <button type="button" className="outline-button" onClick={() => void handleLogout()}>
                        Выйти из CRM
                      </button>
                    </div>
                  </article>
                </article>
              </section>
            )}

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
                  onEditEmployee={openEmployeeEditor}
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

            <div className="weekly-grid">
              {schedulePreview.weeklyBreaks.map((day) => (
                <article key={`break-${day.weekday}`} className="weekly-card">
                  <strong>{day.label}: перерывы</strong>
                  <p>{day.slots.length > 0 ? day.slots.map((slot) => toHalfHourIntervalLabel(slot)).join(", ") : "Перерывов нет"}</p>
                </article>
              ))}
            </div>

            <article className="drawer__subsection">
              <h4>Ближайшие выходные и исключения</h4>
              <div className="history-list">
                {schedulePreview.dayOffs.length > 0 ? (
                  schedulePreview.dayOffs.map((entry) => (
                    <div key={entry.date} className="history-row">
                      <div>
                        <strong>{formatShortDate(entry.date)}</strong>
                        <p>{entry.isFullDay ? "Полный выходной" : entry.slots.map(toHalfHourIntervalLabel).join(", ")}</p>
                      </div>
                      <span className={`status-pill is-${entry.isFullDay ? "cancelled" : "confirmed"}`}>
                        {entry.isFullDay ? "Весь день" : `${entry.slots.length} интервалов`}
                      </span>
                    </div>
                  ))
                ) : (
                  <p>Исключений по датам пока нет.</p>
                )}
              </div>
            </article>
          </div>
        </aside>
      )}

      {employeeEditor && (
        <div className="modal-backdrop">
          <section className="modal modal--compact">
            <div className="drawer__header">
              <div>
                <p className="eyebrow">Сотрудник</p>
                <h3>{employeeEditor.employee.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setEmployeeEditor(null)}>
                ✕
              </button>
            </div>

            <div className="modal__grid modal__grid--single">
              <label className="slot-editor-row">
                <span>Имя сотрудника</span>
                <input
                  className="search-input"
                  value={employeeEditor.name}
                  onChange={(event) =>
                    setEmployeeEditor((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Например, Нуржас"
                />
              </label>

              <article className="drawer__subsection">
                <h4>Что произойдет при удалении</h4>
                <p>
                  Слоты и привязки услуг этого сотрудника будут удалены. История прошлых бронирований сохранится по
                  snapshot-данным, но сотрудник исчезнет из активной команды.
                </p>
              </article>
            </div>

            <div className="modal__footer modal__footer--spread">
              <button type="button" className="outline-button danger-button" onClick={() => void handleDeleteEmployee()}>
                Удалить сотрудника
              </button>
              <div className="modal__footer-actions">
                <button type="button" className="outline-button" onClick={() => setEmployeeEditor(null)}>
                  Отмена
                </button>
                <button type="button" className="primary-button" onClick={() => void handleSaveEmployee()}>
                  Сохранить
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {credentialsEditor && (
        <div className="modal-backdrop">
          <section className="modal modal--compact">
            <div className="drawer__header">
              <div>
                <p className="eyebrow">CRM доступ</p>
                <h3>Логин и пароль</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setCredentialsEditor(null)}>
                ✕
              </button>
            </div>

            <div className="modal__grid modal__grid--single">
              <label className="slot-editor-row">
                <span>Новый логин</span>
                <input
                  className="search-input"
                  value={credentialsEditor.username}
                  onChange={(event) =>
                    setCredentialsEditor((current) =>
                      current
                        ? {
                            ...current,
                            username: event.target.value,
                          }
                        : current
                    )
                  }
                  autoComplete="username"
                  placeholder="bestbarber_4"
                />
              </label>

              <label className="slot-editor-row">
                <span>Текущий пароль</span>
                <input
                  className="search-input"
                  type="password"
                  value={credentialsEditor.currentPassword}
                  onChange={(event) =>
                    setCredentialsEditor((current) =>
                      current
                        ? {
                            ...current,
                            currentPassword: event.target.value,
                          }
                        : current
                    )
                  }
                  autoComplete="current-password"
                  placeholder="Подтвердите текущий пароль"
                />
              </label>

              <label className="slot-editor-row">
                <span>Новый пароль</span>
                <input
                  className="search-input"
                  type="password"
                  value={credentialsEditor.newPassword}
                  onChange={(event) =>
                    setCredentialsEditor((current) =>
                      current
                        ? {
                            ...current,
                            newPassword: event.target.value,
                          }
                        : current
                    )
                  }
                  autoComplete="new-password"
                  placeholder="Оставьте пустым, если пароль не меняется"
                />
              </label>

              <label className="slot-editor-row">
                <span>Повторите новый пароль</span>
                <input
                  className="search-input"
                  type="password"
                  value={credentialsEditor.confirmPassword}
                  onChange={(event) =>
                    setCredentialsEditor((current) =>
                      current
                        ? {
                            ...current,
                            confirmPassword: event.target.value,
                          }
                        : current
                    )
                  }
                  autoComplete="new-password"
                  placeholder="Нужно только если меняете пароль"
                />
              </label>

              <article className="drawer__subsection">
                <h4>Как это работает</h4>
                <p>
                  Логин можно обновить в любой момент. Если зададите новый пароль, временный пароль из business bot
                  перестанет действовать.
                </p>
              </article>
            </div>

            <div className="modal__footer">
              <button type="button" className="outline-button" onClick={() => setCredentialsEditor(null)}>
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={() => void handleSaveCrmCredentials()}>
                Сохранить доступ
              </button>
            </div>
          </section>
        </div>
      )}

      {businessEditor && (
        <div className="modal-backdrop">
          <section className="modal">
            <div className="drawer__header">
              <div>
                <p className="eyebrow">Профиль бизнеса</p>
                <h3>Редактирование данных</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setBusinessEditor(null)}>
                ✕
              </button>
            </div>

            <div className="modal__grid">
              <label className="slot-editor-row">
                <span>Название бизнеса</span>
                <input
                  className="search-input"
                  value={businessEditor.name}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            name: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Например, Best Barber"
                />
              </label>

              <label className="slot-editor-row">
                <span>Категория</span>
                <select
                  className="search-input"
                  value={businessEditor.type}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            type: event.target.value,
                          }
                        : current
                    )
                  }
                >
                  {BUSINESS_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="slot-editor-row">
                <span>Адрес</span>
                <input
                  className="search-input"
                  value={businessEditor.address}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            address: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Улица, дом, ориентир"
                />
              </label>

              <label className="slot-editor-row">
                <span>Телефон</span>
                <input
                  className="search-input"
                  value={businessEditor.phone}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            phone: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="+7 700 000 00 00"
                />
              </label>

              <label className="slot-editor-row modal__grid-span-2">
                <span>График работы</span>
                <input
                  className="search-input"
                  value={businessEditor.schedule}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            schedule: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Например, 09:00-21:00"
                />
                <p>Этот диапазон используется в CRM и слотах сотрудников как рабочие часы бизнеса.</p>
              </label>

              <label className="slot-editor-row modal__grid-span-2">
                <span>Описание</span>
                <textarea
                  value={businessEditor.description}
                  onChange={(event) =>
                    setBusinessEditor((current) =>
                      current
                        ? {
                            ...current,
                            description: event.target.value,
                          }
                        : current
                    )
                  }
                  placeholder="Коротко расскажите о бизнесе, подходе и атмосфере."
                />
              </label>
            </div>

            <div className="modal__footer">
              <button type="button" className="outline-button" onClick={() => setBusinessEditor(null)}>
                Отмена
              </button>
              <button type="button" className="primary-button" onClick={() => void handleSaveBusinessProfile()}>
                Сохранить профиль
              </button>
            </div>
          </section>
        </div>
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
          <section className="modal modal--slot-editor">
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
                const selectedBreaks = new Set(slotEditor.breakValues[slotEditor.activeWeekday] ?? []);
                const activeDayOff = slotEditor.dayOffs[slotEditor.activeDayOffDate] ?? { isFullDay: false, slots: [] };
                const dayOffEntries = Object.entries(slotEditor.dayOffs).sort((a, b) => a[0].localeCompare(b[0]));

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

                    <div className="slot-editor-stack">
                      <article className="slot-editor-row slot-editor-card">
                        <div className="slot-editor-head">
                          <div>
                            <span>Рабочие интервалы: {activeDay.label}</span>
                            <p>
                              {businessHours.start}-{businessHours.end} · {selected.size} доступных интервалов
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

                      <article className="slot-editor-row slot-editor-card">
                        <div className="slot-editor-head">
                          <div>
                            <span>Повторяющиеся перерывы: {activeDay.label}</span>
                            <p>Отметьте интервалы, которые каждую неделю должны быть закрыты для записи клиентов.</p>
                          </div>
                          <button
                            type="button"
                            className="outline-button"
                            onClick={() => clearBreaks(slotEditor.activeWeekday)}
                          >
                            Очистить перерывы
                          </button>
                        </div>

                        <div className="slot-chip-grid">
                          {businessIntervals.map((interval) => {
                            const isSelected = selectedBreaks.has(interval.start);
                            return (
                              <button
                                key={`break-${slotEditor.activeWeekday}-${interval.start}`}
                                type="button"
                                className={`slot-chip ${isSelected ? "is-selected" : ""}`}
                                onClick={() => toggleBreakInterval(slotEditor.activeWeekday, interval.start)}
                              >
                                {interval.label}
                              </button>
                            );
                          })}
                        </div>
                      </article>

                      <article className="slot-editor-row slot-editor-card">
                        <div className="slot-editor-head">
                          <div>
                            <span>Выходные и исключения по дате</span>
                            <p>Можно отметить полный выходной или закрыть отдельные интервалы только на выбранную дату.</p>
                          </div>
                        </div>

                        <div className="day-off-toolbar">
                          <label className="slot-editor-row">
                            <span>Дата</span>
                            <input
                              type="date"
                              className="search-input"
                              value={slotEditor.activeDayOffDate}
                              min={selectedDate}
                              onChange={(event) =>
                                setSlotEditor((current) =>
                                  current
                                    ? {
                                        ...current,
                                        activeDayOffDate: event.target.value,
                                      }
                                    : current
                                )
                              }
                            />
                          </label>

                          <div className="day-off-toolbar__actions">
                            <button
                              type="button"
                              className={`outline-button ${activeDayOff.isFullDay ? "is-active-chip" : ""}`}
                              onClick={() => toggleDayOffFullDay(slotEditor.activeDayOffDate)}
                            >
                              {activeDayOff.isFullDay ? "Снять полный выходной" : "Полный выходной"}
                            </button>
                            <button
                              type="button"
                              className="outline-button"
                              onClick={() => clearDayOff(slotEditor.activeDayOffDate)}
                            >
                              Очистить дату
                            </button>
                          </div>
                        </div>

                        {activeDayOff.isFullDay ? (
                          <div className="day-off-banner">
                            <span className="status-pill is-cancelled">Весь день закрыт</span>
                            <p>Клиентам не будут показаны никакие слоты на {formatShortDate(slotEditor.activeDayOffDate)}.</p>
                          </div>
                        ) : (
                          <div className="slot-chip-grid">
                            {businessIntervals.map((interval) => {
                              const isSelected = activeDayOff.slots.includes(interval.start);
                              return (
                                <button
                                  key={`dayoff-${slotEditor.activeDayOffDate}-${interval.start}`}
                                  type="button"
                                  className={`slot-chip ${isSelected ? "is-selected" : ""}`}
                                  onClick={() => toggleDayOffInterval(slotEditor.activeDayOffDate, interval.start)}
                                >
                                  {interval.label}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div className="day-off-list">
                          {dayOffEntries.length > 0 ? (
                            dayOffEntries.map(([date, value]) => (
                              <button
                                key={date}
                                type="button"
                                className={`day-off-item ${date === slotEditor.activeDayOffDate ? "is-active" : ""}`}
                                onClick={() =>
                                  setSlotEditor((current) =>
                                    current
                                      ? {
                                          ...current,
                                          activeDayOffDate: date,
                                        }
                                      : current
                                  )
                                }
                              >
                                <div>
                                  <strong>{formatShortDate(date)}</strong>
                                  <p>
                                    {value.isFullDay
                                      ? "Полный выходной"
                                      : `${value.slots.length} закрытых интервалов`}
                                  </p>
                                </div>
                                <span>{value.isFullDay ? "Весь день" : value.slots.map(toHalfHourIntervalLabel).join(", ")}</span>
                              </button>
                            ))
                          ) : (
                            <p>На будущие даты исключения пока не заданы.</p>
                          )}
                        </div>
                      </article>
                    </div>
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
                Сохранить расписание
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
