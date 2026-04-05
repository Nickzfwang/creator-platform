import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { locales, defaultLocale } from "../../i18n/config";

const MESSAGES_DIR = path.resolve(__dirname, "../../messages");

function flattenKeys(
  obj: Record<string, any>,
  prefix = "",
): { key: string; value: any }[] {
  const entries: { key: string; value: any }[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      entries.push(...flattenKeys(value, fullKey));
    } else {
      entries.push({ key: fullKey, value });
    }
  }
  return entries;
}

function loadLocale(locale: string): Record<string, any> {
  const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("Translation Completeness", () => {
  const defaultMessages = loadLocale(defaultLocale);
  const defaultEntries = flattenKeys(defaultMessages);
  const defaultKeys = defaultEntries.map((e) => e.key);

  it("should have a JSON file for every configured locale", () => {
    for (const locale of locales) {
      const filePath = path.join(MESSAGES_DIR, `${locale}.json`);
      expect(fs.existsSync(filePath), `Missing file: ${locale}.json`).toBe(
        true,
      );
    }
  });

  it(`should have a reasonable number of keys in default locale (${defaultLocale})`, () => {
    expect(defaultKeys.length).toBeGreaterThan(100);
  });

  for (const locale of locales) {
    if (locale === defaultLocale) continue;

    describe(`${locale}`, () => {
      const messages = loadLocale(locale);
      const entries = flattenKeys(messages);
      const keys = entries.map((e) => e.key);

      it("should have no missing keys", () => {
        const missing = defaultKeys.filter((k) => !keys.includes(k));
        expect(missing, `Missing keys in ${locale}`).toEqual([]);
      });

      it("should have no extra keys", () => {
        const extra = keys.filter((k) => !defaultKeys.includes(k));
        expect(extra, `Extra keys in ${locale}`).toEqual([]);
      });

      it("should have no empty string values", () => {
        const empty = entries.filter(
          (e) => typeof e.value === "string" && e.value.trim() === "",
        );
        expect(
          empty.map((e) => e.key),
          `Empty values in ${locale}`,
        ).toEqual([]);
      });

      it("should preserve all ICU placeholders from default locale", () => {
        const placeholderRegex = /\{(\w+)\}/g;
        const mismatches: string[] = [];

        for (const defaultEntry of defaultEntries) {
          const localeEntry = entries.find((e) => e.key === defaultEntry.key);
          if (!localeEntry || typeof defaultEntry.value !== "string") continue;

          const defaultPlaceholders = [
            ...defaultEntry.value.matchAll(placeholderRegex),
          ]
            .map((m) => m[1])
            .sort();
          const localePlaceholders = [
            ...String(localeEntry.value).matchAll(placeholderRegex),
          ]
            .map((m) => m[1])
            .sort();

          if (
            JSON.stringify(defaultPlaceholders) !==
            JSON.stringify(localePlaceholders)
          ) {
            mismatches.push(
              `${defaultEntry.key}: expected {${defaultPlaceholders.join(", ")}} got {${localePlaceholders.join(", ")}}`,
            );
          }
        }

        expect(mismatches, `Placeholder mismatches in ${locale}`).toEqual([]);
      });
    });
  }
});
