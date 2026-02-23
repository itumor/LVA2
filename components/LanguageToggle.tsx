"use client";

import { useLanguage } from "@/components/LanguageProvider";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="langToggle" role="group" aria-label="Language selector">
      <button
        type="button"
        className={language === "lv" ? "active" : ""}
        onClick={() => setLanguage("lv")}
      >
        LV
      </button>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
    </div>
  );
}
