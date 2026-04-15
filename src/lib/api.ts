import type {
  AddEmployeeInput,
  BookingStatus,
  CreatePaymentInput,
  CrmPayload,
  UpdateServiceInput,
  UpdateEmployeeSlotsInput,
  UpsertServiceInput,
} from "../types";

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({ error: "Request failed" }))) as { error?: string };
    throw new Error(payload.error ?? "Request failed");
  }

  return (await response.json()) as T;
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
