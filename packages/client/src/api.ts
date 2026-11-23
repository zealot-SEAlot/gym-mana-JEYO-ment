// How every screen talks to the gym PC's /api routes (KTD5, KTD10). One place adds the CSRF token
// to writes, marks requests the user started, and turns the server's { error } answers into an
// ApiError the screen can show.

/** A request the server refused, or one that never reached it (status 0). */
export class ApiError extends Error {
  readonly status: number;
  // The server's error code, such as "wrong_sign_in" or "too_many_tries" (server http/errors.ts)
  readonly code: string;
  // Extra facts some errors carry, such as { fields: { password: [...] } } for "invalid_request"
  readonly details: unknown;
  // From the Retry-After header on "too_many_tries", so a screen can say how long to wait
  readonly retryAfterSeconds: number | null;

  constructor(status: number, code: string, details?: unknown, retryAfterSeconds?: number | null) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
  }
}

// The token sign-in, GET /auth/session, or pairing gave this page. Kept in memory only: page
// scripts can read it, but another website can't, which is the point of the CSRF check
let csrfToken: string | null = null;

/** Called with the token from sign-in, GET /api/auth/session, or pairing; null after sign-out. */
export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  // True when a person caused this request: a click, a typed search, a saved form, opening a
  // screen. False for automatic reloads, which must never keep a session alive (R52, KTD10).
  // Required, so every call decides on purpose
  userStarted: boolean;
}

/**
 * Calls /api + path and returns the JSON answer, or undefined for an empty one (204). Throws
 * ApiError when the server refuses or can't be reached. The caller names the answer's type; the
 * server is ours, so its answer isn't checked again here.
 */
export async function api<T>(path: string, options: ApiOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (csrfToken !== null) {
    headers["X-CSRF-Token"] = csrfToken;
  }
  if (options.userStarted) {
    headers["X-User-Action"] = "1";
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    // fetch rejects only when no answer came back: the gym PC is off or the Wi-Fi dropped
    throw new ApiError(0, "server_unreachable");
  }

  if (response.status === 204) {
    return undefined as T;
  }
  // Every /api answer is JSON, errors too (server http/errors.ts). Anything else came from
  // something between us and the server, so it's reported as a server error
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const { error, details } = (answer ?? {}) as { error?: unknown; details?: unknown };
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new ApiError(
      response.status,
      typeof error === "string" ? error : "server_error",
      details,
      retryAfter > 0 ? retryAfter : null,
    );
  }
  return answer as T;
}
