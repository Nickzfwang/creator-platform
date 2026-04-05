import { describe, it, expect } from "vitest";
import { routing } from "../../i18n/routing";

describe("i18n Routing", () => {
  it("should use 'as-needed' locale prefix strategy", () => {
    expect(routing.localePrefix).toBe("as-needed");
  });

  it("should have zh-TW as default locale (no URL prefix)", () => {
    expect(routing.defaultLocale).toBe("zh-TW");
  });

  it("should include all 5 locales", () => {
    expect(routing.locales).toHaveLength(5);
  });
});
