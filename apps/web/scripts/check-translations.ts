/**
 * Translation Key Completeness Checker
 *
 * Compares all locale JSON files against the default locale (zh-TW)
 * and reports missing or extra keys.
 *
 * Usage: npx tsx scripts/check-translations.ts
 */

import fs from "fs";
import path from "path";

const MESSAGES_DIR = path.resolve(__dirname, "../messages");
const DEFAULT_LOCALE = "zh-TW";

function flattenKeys(obj: Record<string, any>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function main() {
  const files = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
  const locales: Record<string, string[]> = {};

  for (const file of files) {
    const locale = file.replace(".json", "");
    const content = JSON.parse(
      fs.readFileSync(path.join(MESSAGES_DIR, file), "utf-8"),
    );
    locales[locale] = flattenKeys(content);
  }

  const defaultKeys = new Set(locales[DEFAULT_LOCALE]);
  if (!defaultKeys.size) {
    console.error(`❌ Default locale ${DEFAULT_LOCALE}.json not found or empty`);
    process.exit(1);
  }

  let hasErrors = false;

  for (const [locale, keys] of Object.entries(locales)) {
    if (locale === DEFAULT_LOCALE) continue;

    const localeKeys = new Set(keys);
    const missing = [...defaultKeys].filter((k) => !localeKeys.has(k));
    const extra = [...localeKeys].filter((k) => !defaultKeys.has(k));

    if (missing.length === 0 && extra.length === 0) {
      console.log(`✅ ${locale}: all ${defaultKeys.size} keys match`);
    } else {
      hasErrors = true;
      if (missing.length > 0) {
        console.error(`❌ ${locale}: ${missing.length} missing keys:`);
        missing.forEach((k) => console.error(`   - ${k}`));
      }
      if (extra.length > 0) {
        console.warn(`⚠️  ${locale}: ${extra.length} extra keys:`);
        extra.forEach((k) => console.warn(`   + ${k}`));
      }
    }
  }

  console.log(`\n📊 Default locale (${DEFAULT_LOCALE}): ${defaultKeys.size} keys`);
  console.log(`📁 Locales checked: ${Object.keys(locales).filter(l => l !== DEFAULT_LOCALE).join(", ")}`);

  if (hasErrors) {
    process.exit(1);
  } else {
    console.log("\n✅ All locales are in sync!");
  }
}

main();
