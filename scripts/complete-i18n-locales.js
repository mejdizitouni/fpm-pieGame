const fs = require("fs");
const path = require("path");
const vm = require("vm");

const targetPath = path.join(process.cwd(), "src", "i18n", "translations.js");

function loadTranslationsWithoutRuntimeMerge(filePath) {
  let code = fs.readFileSync(filePath, "utf8");
  // Remove the runtime merge block to inspect raw locale coverage.
  code = code.replace(/\n\["es", "de", "pt", "ru", "ar", "zh-Hans", "zh-Hant"\][\s\S]*?\n\}\);\s*$/m, "\n");
  code = code.replace(/export const /g, "const ");
  code += "\nmodule.exports = { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS };\n";

  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, context);
  return context.module.exports;
}

function protectPlaceholders(input) {
  const placeholders = [];
  const text = input.replace(/\{[^}]+\}/g, (match) => {
    const token = `__VAR_${placeholders.length}__`;
    placeholders.push({ token, value: match });
    return token;
  });
  return { text, placeholders };
}

function restorePlaceholders(input, placeholders) {
  let output = input;
  for (const { token, value } of placeholders) {
    output = output.replaceAll(token, value);
  }
  return output;
}

async function translateText(text, targetLang, cache) {
  const cacheKey = `${targetLang}:::${text}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  if (!text || /^\s*$/.test(text)) {
    cache.set(cacheKey, text);
    return text;
  }

  const { text: protectedText, placeholders } = protectPlaceholders(text);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(protectedText)}`;

  let translated = null;
  let lastError = null;
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) {
        throw new Error(`Translation request failed (${response.status}) for lang=${targetLang}`);
      }

      const payload = await response.json();
      translated = (payload[0] || []).map((part) => part[0]).join("");
      break;
    } catch (error) {
      lastError = error;
      const backoffMs = 500 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  if (translated == null) {
    throw lastError;
  }

  // Gentle pacing avoids temporary throttling from the public endpoint.
  await new Promise((resolve) => setTimeout(resolve, 120));

  const restored = restorePlaceholders(translated, placeholders);

  cache.set(cacheKey, restored);
  return restored;
}

function formatObject(obj, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const childIndent = "  ".repeat(indentLevel + 1);
  const entries = Object.entries(obj);

  const lines = ["{"];
  for (const [key, value] of entries) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${childIndent}${JSON.stringify(key)}: ${formatObject(value, indentLevel + 1)},`);
    } else {
      lines.push(`${childIndent}${JSON.stringify(key)}: ${JSON.stringify(value)},`);
    }
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

function formatValue(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const childIndent = "  ".repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    const lines = ["["];
    value.forEach((item) => {
      if (item && typeof item === "object") {
        lines.push(`${childIndent}${formatObject(item, indentLevel + 1)},`);
      } else {
        lines.push(`${childIndent}${JSON.stringify(item)},`);
      }
    });
    lines.push(`${indent}]`);
    return lines.join("\n");
  }

  if (value && typeof value === "object") {
    return formatObject(value, indentLevel);
  }

  return JSON.stringify(value);
}

async function main() {
  const { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS } =
    loadTranslationsWithoutRuntimeMerge(targetPath);

  const en = TRANSLATIONS.en;
  const keys = Object.keys(en);

  const localeMap = {
    es: "es",
    de: "de",
    pt: "pt",
    ru: "ru",
    ar: "ar",
    "zh-Hans": "zh-CN",
    "zh-Hant": "zh-TW",
  };

  const cache = new Map();
  const completed = {
    fr: TRANSLATIONS.fr,
    en: TRANSLATIONS.en,
    es: TRANSLATIONS.es || {},
    de: TRANSLATIONS.de || {},
    pt: TRANSLATIONS.pt || {},
    ru: TRANSLATIONS.ru || {},
    ar: TRANSLATIONS.ar || {},
    "zh-Hans": TRANSLATIONS["zh-Hans"] || {},
    "zh-Hant": TRANSLATIONS["zh-Hant"] || {},
  };

  const requestedLocale = process.argv[2] || "all";
  const localesToProcess =
    requestedLocale === "all"
      ? Object.keys(localeMap)
      : [requestedLocale].filter((localeCode) => localeMap[localeCode]);

  if (localesToProcess.length === 0) {
    throw new Error(`Unknown locale '${requestedLocale}'. Expected one of: ${Object.keys(localeMap).join(", ")}, all`);
  }

  for (const localeCode of localesToProcess) {
    const apiLang = localeMap[localeCode];
    const currentLocale = TRANSLATIONS[localeCode] || {};
    const translatedLocale = {};
    const failedKeys = [];

    for (const key of keys) {
      const existing = currentLocale[key];
      const enText = en[key];

      if (existing && existing !== enText) {
        translatedLocale[key] = existing;
        continue;
      }

      try {
        translatedLocale[key] = await translateText(enText, apiLang, cache);
      } catch (error) {
        failedKeys.push(key);
        translatedLocale[key] = currentLocale[key] && currentLocale[key] !== enText ? currentLocale[key] : enText;
        console.warn(`WARN ${localeCode}.${key}: ${error.message}`);
      }
    }

    completed[localeCode] = translatedLocale;

    const outPartial = [
      `export const DEFAULT_LANGUAGE = ${JSON.stringify(DEFAULT_LANGUAGE)};`,
      "",
      `export const SUPPORTED_LANGUAGES = ${formatValue(SUPPORTED_LANGUAGES)};`,
      "",
      `export const TRANSLATIONS = ${formatObject(completed)};`,
      "",
    ].join("\n");
    fs.writeFileSync(targetPath, outPartial, "utf8");

    console.log(`Completed locale ${localeCode} (${keys.length} keys, failures=${failedKeys.length})`);
  }

  console.log("translations.js updated successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
