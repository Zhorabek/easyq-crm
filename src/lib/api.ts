import type {
  AddEmployeeInput,
  AuthSession,
  BookingStatus,
  CreatePaymentInput,
  CrmPayload,
  LoginInput,
  UpdateCrmCredentialsInput,
  UpdateBusinessProfileInput,
  UpdateEmployeeInput,
  UpdateServiceInput,
  UpdateEmployeeSlotsInput,
  UpsertServiceInput,
} from "../types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (!(init?.body instanceof FormData) && init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
    throw new ApiError(payload.error ?? "Request failed", response.status);
  }

  return (await response.json()) as T;
}

export function getAuthSession() {
  return request<AuthSession>("/api/auth/session");
}

export function login(input: LoginInput) {
  return request<{ ok: true; session: AuthSession }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logout() {
  return request<{ ok: true }>("/api/auth/logout", {
    method: "POST",
  });
}

export function getCrmPayload(date: string) {
  return request<CrmPayload>(`/api/crm?date=${encodeURIComponent(date)}`);
}

export function patchBookingStatus(bookingId: number, status: BookingStatus) {
  return request<{ ok: true }>(`/api/bookings/${bookingId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function createBookingPayment(bookingId: number, input: CreatePaymentInput) {
  return request<{ ok: true }>(`/api/bookings/${bookingId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createEmployee(input: AddEmployeeInput) {
  return request<{ ok: true }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmployee(staffId: number, input: UpdateEmployeeInput) {
  return request<{ ok: true }>(`/api/employees/${staffId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteEmployee(staffId: number) {
  return request<{ ok: true }>(`/api/employees/${staffId}`, {
    method: "DELETE",
  });
}

export function createService(input: UpsertServiceInput) {
  return request<{ ok: true }>("/api/services", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateService(serviceId: number, input: UpdateServiceInput) {
  return request<{ ok: true }>(`/api/services/${serviceId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function saveEmployeeSlots(staffId: number, input: UpdateEmployeeSlotsInput) {
  return request<{ ok: true }>(`/api/employees/${staffId}/slots`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updateBusinessProfile(input: UpdateBusinessProfileInput) {
  return request<{ ok: true }>("/api/business", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function uploadBusinessPhoto(file: File) {
  const formData = new FormData();
  formData.set("photo", file);

  return request<{ ok: true }>("/api/business/photo", {
    method: "POST",
    body: formData,
  });
}

export function deleteBusinessPhoto() {
  return request<{ ok: true }>("/api/business/photo", {
    method: "DELETE",
  });
}

export function updateCrmCredentials(input: UpdateCrmCredentialsInput) {
  return request<{ ok: true; session: AuthSession }>("/api/business/credentials", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
