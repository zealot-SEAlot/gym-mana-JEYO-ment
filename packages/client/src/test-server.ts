// A pretend gym PC for screen tests: each test lists what each "METHOD /api/path" answers, and
// fetchMock records what the screen sent. Only tests import this file.
import { vi } from "vitest";

export const fetchMock = vi.fn<typeof fetch>();

/** Answers each request from routes; a request no route names fails like an unreachable server. */
export function serve(routes: Record<string, () => Response>): void {
  fetchMock.mockImplementation((url, init) => {
    // api() always passes the address as a string
    const route = routes[`${init?.method ?? "GET"} ${url as string}`];
    return route ? Promise.resolve(route()) : Promise.reject(new TypeError("Failed to fetch"));
  });
}

/** An answer with a JSON body. A function, because a Response's body can be read only once. */
export function json(status: number, body: unknown): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
}

/** The empty 204 answer most changes get. */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** The requests sent as "METHOD /api/path" with their JSON bodies, in order. */
export function sent(): { request: string; body: unknown }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    request: `${init?.method ?? "GET"} ${url as string}`,
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
  }));
}
