"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { SupportedLanguage } from "@/lib/types";

type LanguageContextValue = {
  language: SupportedLanguage;
  setLanguage: (next: SupportedLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window === "undefined") {
      return "lv";
    }

    const stored = window.localStorage.getItem("vvpp-lang");
    return stored === "lv" || stored === "en" ? stored : "lv";
  });

  const setLanguage = (next: SupportedLanguage) => {
    setLanguageState(next);
    window.localStorage.setItem("vvpp-lang", next);
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
