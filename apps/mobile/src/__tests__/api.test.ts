import { jest } from "@jest/globals";
import { getAccessToken, setTokens, clearTokens, apiFetch, ApiError } from "@/lib/api";

const mockStore = new Map<string, string>();

jest.mock("@/lib/storage", () => ({
  getItem: jest.fn(async (k: string) => mockStore.get(k) ?? null),
  setItem: jest.fn(async (k: string, v: string) => {
    mockStore.set(k, v);
  }),
  removeItem: jest.fn(async (k: string) => {
    mockStore.delete(k);
  }),
}));

type FetchResponse = {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

/** Queues responses consumed one per fetch call. */
function mockFetch(...responses: FetchResponse[]) {
  const queue = [...responses];
  return jest.fn<(url: string, init?: RequestInit) => Promise<unknown>>(
    async (_url: string, _init?: RequestInit) => {
      const next = queue.shift();
      if (!next) throw new Error("unexpected extra fetch call");
      return {
        ok: next.ok,
        status: next.status,
        json: next.json ?? (async () => ({})),
        text: next.text ?? (async () => ""),
      };
    },
  );
}

function stubFetch(...responses: FetchResponse[]) {
  const fn = mockFetch(...responses);
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
});

describe("token storage", () => {
  it("returns null when no token is stored", async () => {
    expect(await getAccessToken()).toBeNull();
  });

  it("round-trips tokens through storage", async () => {
    await setTokens({
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 900,
      must_change: false,
    });
    expect(await getAccessToken()).toBe("access-1");
  });

  it("clears both tokens", async () => {
    await setTokens({
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 900,
      must_change: false,
    });
    await clearTokens();
    expect(await getAccessToken()).toBeNull();
  });
});

describe("apiFetch", () => {
  it("returns the parsed body on success", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, json: async () => ({ data: "ok" }) });

    expect(await apiFetch<{ data: string }>("/members")).toEqual({ data: "ok" });
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/api\/v1\/members$/);
  });

  it("sends the bearer token when one is stored", async () => {
    await setTokens({
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 900,
      must_change: false,
    });
    const fetchMock = stubFetch({ ok: true, status: 200 });

    await apiFetch("/members");
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer access-1");
  });

  it("throws ApiError with the status and detail on failure", async () => {
    stubFetch({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid input" }),
      text: async () => "Invalid input",
    });

    let caught: ApiError | undefined;
    try {
      await apiFetch("/members");
    } catch (e) {
      caught = e as ApiError;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught?.status).toBe(400);
    expect(caught?.message).toContain("Invalid input");
  });

  it("refreshes the token once and retries after a 401", async () => {
    await setTokens({
      access_token: "stale",
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 900,
      must_change: false,
    });

    stubFetch(
      { ok: false, status: 401 },
      {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: "fresh",
          refresh_token: "refresh-2",
          token_type: "bearer",
          expires_in: 900,
          must_change: false,
        }),
      },
      { ok: true, status: 200, json: async () => ({ data: "final" }) },
    );

    expect(await apiFetch<{ data: string }>("/members")).toEqual({ data: "final" });
    expect(await getAccessToken()).toBe("fresh");
  });

  it("clears tokens and throws when refresh fails", async () => {
    await setTokens({
      access_token: "stale",
      refresh_token: "refresh-1",
      token_type: "bearer",
      expires_in: 900,
      must_change: false,
    });

    stubFetch({ ok: false, status: 401 }, { ok: false, status: 401 });

    await expect(apiFetch("/members")).rejects.toThrow("Unauthorized");
    expect(await getAccessToken()).toBeNull();
  });
});
