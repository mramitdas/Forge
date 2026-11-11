import { jest } from "@jest/globals";
import { apiFetch } from "@/lib/api";
import { activateSubscription, fetchSubscriptions } from "@/lib/subscriptions";

jest.mock("@/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("fetchSubscriptions", () => {
  it("calls /plans/subscriptions?page_size=50", async () => {
    mockedFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 } as never);
    await fetchSubscriptions();
    expect(mockedFetch).toHaveBeenCalledWith("/plans/subscriptions?page_size=50");
  });

  it("adds status=pending when filtered", async () => {
    mockedFetch.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 } as never);
    await fetchSubscriptions("pending");
    expect(mockedFetch).toHaveBeenCalledWith("/plans/subscriptions?page_size=50&status=pending");
  });
});

describe("activateSubscription", () => {
  it("POSTs /plans/subscriptions/:id/activate", async () => {
    mockedFetch.mockResolvedValue({} as never);
    await activateSubscription("abc");
    expect(mockedFetch).toHaveBeenCalledWith("/plans/subscriptions/abc/activate", { method: "POST" });
  });
});
