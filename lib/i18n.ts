import type { SupportedLanguage } from "@/lib/types";

export const dictionary = {
  lv: {
    dashboard: "Panelis",
    exam: "Eksāmens",
    listening: "Klausīšanās",
    reading: "Lasīšana",
    writing: "Rakstīšana",
    speaking: "Runāšana",
    review: "Atkārtošana",
    analytics: "Analītika",
    generator: "Ģenerators",
    settings: "Iestatījumi",
    todayPlan: "Šodienas plāns",
    weakAreas: "Vājās vietas",
    quickStart: "Ātrais starts",
  },
  en: {
    dashboard: "Dashboard",
    exam: "Exam",
    listening: "Listening",
    reading: "Reading",
    writing: "Writing",
    speaking: "Speaking",
    review: "Review",
    analytics: "Analytics",
    generator: "Generator",
    settings: "Settings",
    todayPlan: "Today's Plan",
    weakAreas: "Weak Areas",
    quickStart: "Quick Start",
  },
} as const;

export function t(lang: SupportedLanguage, key: keyof (typeof dictionary)["lv"]) {
  return dictionary[lang][key];
}

export function languageLabel(lang: SupportedLanguage) {
  return lang === "lv" ? "Latviešu" : "English";
}
