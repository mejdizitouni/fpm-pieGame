const fs = require("fs");
const path = require("path");
const vm = require("vm");

const targetPath = path.join(process.cwd(), "src", "i18n", "translations.js");

function loadTranslations(filePath) {
  let code = fs.readFileSync(filePath, "utf8");
  code = code.replace(/export const /g, "const ");
  code += "\nmodule.exports = { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS };\n";

  const context = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, context);
  return context.module.exports;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  const { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS } = loadTranslations(targetPath);
  const defaultLocale = TRANSLATIONS[DEFAULT_LANGUAGE];

  if (!defaultLocale || typeof defaultLocale !== "object") {
    throw new Error(`Default language '${DEFAULT_LANGUAGE}' not found in TRANSLATIONS.`);
  }

  const defaultKeys = new Set(Object.keys(defaultLocale));
  const localeCodes = SUPPORTED_LANGUAGES.map((lang) => lang.code);

  let hasError = false;

  for (const code of localeCodes) {
    const locale = TRANSLATIONS[code];
    if (!locale || typeof locale !== "object") {
      hasError = true;
      fail(`Missing locale object: ${code}`);
      continue;
    }

    const localeKeys = new Set(Object.keys(locale));
    const missing = [...defaultKeys].filter((key) => !localeKeys.has(key));
    const extra = [...localeKeys].filter((key) => !defaultKeys.has(key));

    if (missing.length || extra.length) {
      hasError = true;
      if (missing.length) {
        fail(`Locale '${code}' is missing ${missing.length} key(s): ${missing.join(", ")}`);
      }
      if (extra.length) {
        fail(`Locale '${code}' has ${extra.length} extra key(s): ${extra.join(", ")}`);
      }
    }
  }

  if (hasError) {
    process.exit(1);
  }

  console.log(`i18n parity check passed for ${localeCodes.length} locales using base '${DEFAULT_LANGUAGE}'.`);
}

main();
