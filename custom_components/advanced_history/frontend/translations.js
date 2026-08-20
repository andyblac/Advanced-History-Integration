
import locale0 from "./translations/en-US.js";

const TRANSLATIONS = {
  "en-US": locale0,
};

const LOCALE_LOADERS = {
  "en-GB": () => import("./translations/en-GB.js"),
  de: () => import("./translations/de.js"),
  es: () => import("./translations/es.js"),
  fr: () => import("./translations/fr.js"),
  it: () => import("./translations/it.js"),
  nl: () => import("./translations/nl.js"),
  "pt-BR": () => import("./translations/pt-BR.js"),
};

const translationLoads = new Map();

function resolveLocale(language) {
  const requested = String(language || "en-US");
  const baseLanguage = requested.split("-")[0];
  return TRANSLATIONS[requested] || LOCALE_LOADERS[requested]
    ? requested
    : TRANSLATIONS[baseLanguage] || LOCALE_LOADERS[baseLanguage]
      ? baseLanguage
      : "en-US";
}

export async function loadTranslations(language) {
  const locale = resolveLocale(language);
  if (TRANSLATIONS[locale]) return TRANSLATIONS[locale];
  if (!translationLoads.has(locale)) {
    translationLoads.set(locale, LOCALE_LOADERS[locale]()
      .then((module) => {
        TRANSLATIONS[locale] = module.default;
        return module.default;
      })
      .catch(() => TRANSLATIONS["en-US"]));
  }
  return translationLoads.get(locale);
}

export function customLocalize(language, key, replacements = {}) {
  const locale = resolveLocale(language);
  const catalogue =
    TRANSLATIONS[locale] ||
    TRANSLATIONS["en-US"];
  const fallback = TRANSLATIONS["en-US"];
  const text = catalogue[key] ?? fallback[key] ?? key;
  return String(text).replace(/\{(\w+)\}/g, (_, name) =>
    replacements[name] == null ? `{${name}}` : String(replacements[name])
  );
}
