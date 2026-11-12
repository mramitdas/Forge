import { TAB_ITEMS } from "@/lib/tab-items";

describe("TAB_ITEMS", () => {
  it("is Home, Members, Subscriptions, More", () => {
    expect([...TAB_ITEMS]).toEqual(["Home", "Members", "Subscriptions", "More"]);
  });

  it("does not include the old seven tab titles", () => {
    const old = ["Dashboard", "Check-In", "Billing", "Expenses", "Notifications", "Settings"];
    for (const name of old) {
      expect(TAB_ITEMS as readonly string[]).not.toContain(name);
    }
  });
});
