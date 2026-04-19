import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES, TRANSLATIONS } from "./translations";

const STORAGE_KEY = "app.language";
const LanguageContext = createContext(null);

function getInitialLanguage() {
  const urlLanguage = new URLSearchParams(window.location.search).get("lang");
  if (urlLanguage && TRANSLATIONS[urlLanguage]) {
    return urlLanguage;
  }

  const storedLanguage = localStorage.getItem(STORAGE_KEY);
  if (storedLanguage && TRANSLATIONS[storedLanguage]) {
    return storedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getInitialLanguage);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);

  const setLanguage = useCallback((nextLanguage) => {
    if (TRANSLATIONS[nextLanguage]) {
      setLanguageState(nextLanguage);
    }
  }, []);

  const t = useCallback((key) => {
    return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key;
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      languages: SUPPORTED_LANGUAGES,
    }),
    [language, setLanguage, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context) {
    return context;
  }

  return {
    language: DEFAULT_LANGUAGE,
    setLanguage: () => {},
    t: (key) => TRANSLATIONS[DEFAULT_LANGUAGE][key] ?? key,
    languages: SUPPORTED_LANGUAGES,
  };
}
