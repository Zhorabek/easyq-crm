const COOKIE_NAME = "easyq_crm_session";
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_ITERATIONS = 100_000;

/**
 * Who the CRM is acting as. The owner is the business account itself; managers and
 * specialists are rows in `staff` with a login.
 *
 * This is the permission level, distinct from staff.role which is a free-text job title.
 */
export type ActorRole = "owner" | "manager" | "specialist";

type SessionPayload = {
  businessId: number;
  username: string;
  exp: number;
  /**
   * Absent in cookies minted before staff logins existed. readSession defaults it to
   * "owner", because every such cookie WAS a business login — without that default a
   * deploy would silently downgrade or lock out everyone currently signed in.
   */
  role?: ActorRole;
  /** Set only for staff sessions; the owner has no staff row. */
  staffId?: number;
  /**
   * Value of the credential row's `session_version` when this cookie was minted.
   *
   * Bumping the row invalidates every cookie issued before it, which is what makes a
   * password change evict the person's other devices. Absent in cookies predating the
   * feature; readSession reads that as 0, matching the column default, so those sessions
   * keep working rather than everyone being logged out on deploy.
   */
  sv?: number;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toBase64Url(value: string | Uint8Array) {
  const base64 = typeof value === "string" ? btoa(value) : bytesToBase64(value);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return atob(padded);
}

function parseCookies(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const pairs = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  const cookies = new Map<string, string>();
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    cookies.set(pair.slice(0, separatorIndex), pair.slice(separatorIndex + 1));
  }
  return cookies;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function getSessionSecret(request: Request, configuredSecret?: string) {
  if (configuredSecret?.trim()) {
    return configuredSecret.trim();
  }

  const { hostname } = new URL(request.url);
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "easyq-crm-dev-session-secret";
  }

  throw new Error("CRM_SESSION_SECRET is missing. Set it in the easyq-crm Worker secrets before using CRM login.");
}

async function signValue(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function buildCookie(request: Request, token: string, expiresAt: Date) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`;
}

export function normalizeCrmUsername(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
}

export function isValidCrmUsername(value: string) {
  return /^[a-z0-9](?:[a-z0-9._-]{2,30}[a-z0-9])$/.test(value);
}

const CRM_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateCrmTempPassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let password = "";
  for (const byte of bytes) {
    password += CRM_PASSWORD_ALPHABET[byte % CRM_PASSWORD_ALPHABET.length];
  }
  return password;
}

export function normalizeCrmUsernameBase(name: string) {
  const normalized = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");

  return normalized || "easyq";
}

export async function hashCrmPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    PBKDF2_HASH_BYTES * 8
  );

  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyCrmPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) return false;

  const [algorithm, iterationValue, saltBase64, digestBase64] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationValue || !saltBase64 || !digestBase64) {
    return false;
  }

  const iterations = Number(iterationValue);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const salt = base64ToBytes(saltBase64);
  const expected = base64ToBytes(digestBase64);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations,
    },
    key,
    expected.length * 8
  );

  return timingSafeEqual(new Uint8Array(bits), expected);
}

export async function createSessionCookie(
  request: Request,
  secret: string | undefined,
  input: { businessId: number; username: string; ttlDays?: number; role?: ActorRole; staffId?: number; sessionVersion?: number }
) {
  const ttlDays = input.ttlDays ?? 14;
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload: SessionPayload = {
    businessId: input.businessId,
    username: input.username,
    exp,
    role: input.role ?? "owner",
    ...(input.staffId ? { staffId: input.staffId } : {}),
    sv: input.sessionVersion ?? 0,
  };
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  const signature = await signValue(payloadSegment, getSessionSecret(request, secret));
  const token = `${payloadSegment}.${signature}`;
  return buildCookie(request, token, new Date(exp));
}

/**
 * A verified session. `role` and `sv` are always resolved here, so callers never handle
 * undefined for either.
 */
export type ResolvedSession = SessionPayload & { role: ActorRole; sv: number };

export async function readSession(request: Request, secret: string | undefined): Promise<ResolvedSession | null> {
  const token = parseCookies(request).get(COOKIE_NAME);
  if (!token) return null;

  const [payloadSegment, signature] = token.split(".");
  if (!payloadSegment || !signature) return null;

  let expectedSignature: string;
  try {
    expectedSignature = await signValue(payloadSegment, getSessionSecret(request, secret));
  } catch (error) {
    console.log("CRM session verification skipped:", error);
    return null;
  }

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadSegment)) as SessionPayload;
    if (!payload.businessId || !payload.username || !payload.exp || payload.exp < Date.now()) {
      return null;
    }

    // The role is signed, so it cannot be tampered with — but it may be absent from
    // cookies issued before staff logins existed. Those were all business logins, so
    // defaulting to "owner" keeps them working rather than logging everyone out on deploy.
    // An unrecognized value is treated as the LEAST privileged, not the default.
    const role: ActorRole =
      payload.role === undefined
        ? "owner"
        : payload.role === "owner" || payload.role === "manager" || payload.role === "specialist"
          ? payload.role
          : "specialist";

    // A staff role without a staffId cannot be scoped to anything, so it is not a usable
    // session. Refusing it is safer than guessing which staff member it meant.
    if (role !== "owner" && !payload.staffId) {
      return null;
    }

    // A missing sv is 0, which is what the column defaults to — so a cookie from before
    // session versioning existed still matches its row and keeps working.
    return { ...payload, role, sv: Number(payload.sv ?? 0) };
  } catch {
    return null;
  }
}
