import { describe, it, expect } from "vitest";
import { locales, defaultLocale, localeNames } from "../../i18n/config";

describe("i18n Config", () => {
  it("should have zh-TW as default locale", () => {
    expect(defaultLocale).toBe("zh-TW");
  });

  it("should support exactly 5 locales", () => {
    expect(locales).toHaveLength(5);
    expect(locales).toContain("zh-TW");
    expect(locales).toContain("zh-CN");
    expect(locales).toContain("en");
    expect(locales).toContain("ja");
    expect(locales).toContain("ko");
  });

  it("should have a display name for every locale", () => {
    for (const locale of locales) {
      expect(localeNames[locale]).toBeDefined();
      expect(localeNames[locale].length).toBeGreaterThan(0);
    }
  });

  it("should display locale names in their own language", () => {
    expect(localeNames["zh-TW"]).toBe("繁體中文");
    expect(localeNames["zh-CN"]).toBe("简体中文");
    expect(localeNames["en"]).toBe("English");
    expect(localeNames["ja"]).toBe("日本語");
    expect(localeNames["ko"]).toBe("한국어");
  });
});
