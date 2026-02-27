"use client";

import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { SupportedLanguage } from "@/lib/types";

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);
const LANGUAGE_KEY = "vvpp-lang";
const LANGUAGE_EVENT = "vvpp-lang-change";

function readLanguageFromStorage(): SupportedLanguage {
  const stored = window.localStorage.getItem(LANGUAGE_KEY);
  return stored === "lv" || stored === "en" ? stored : "lv";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(
    (onStoreChange) => {
      const onStorage = (event: StorageEvent) => {
        if (!event.key || event.key === LANGUAGE_KEY) {
          onStoreChange();
        }
      };
      const onLanguageChange = () => onStoreChange();
      window.addEventListener("storage", onStorage);
      window.addEventListener(LANGUAGE_EVENT, onLanguageChange);
      return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener(LANGUAGE_EVENT, onLanguageChange);
      };
    },
    readLanguageFromStorage,
    (): SupportedLanguage => "lv",
  );

  const setLanguage = (next: SupportedLanguage) => {
    window.localStorage.setItem(LANGUAGE_KEY, next);
    window.dispatchEvent(new Event(LANGUAGE_EVENT));
  };

  const value = useMemo(
    () => ({
      language,
      setLanguage,
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider");
  }
  return context;
}
