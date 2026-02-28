"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageProvider";
import { t } from "@/lib/i18n";

const nav = [
  { href: "/", labelKey: "dashboard" as const },
  { href: "/exam", labelKey: "exam" as const },
  { href: "/trainer/listening", labelKey: "listening" as const },
  { href: "/trainer/reading", labelKey: "reading" as const },
  { href: "/trainer/writing", labelKey: "writing" as const },
  { href: "/trainer/speaking", labelKey: "speaking" as const },
  { href: "/review", labelKey: "review" as const },
  { href: "/analytics", labelKey: "analytics" as const },
  { href: "/generator", labelKey: "generator" as const },
  { href: "/settings", labelKey: "settings" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language } = useLanguage();

  return (
    <div className="appWrap">
      <aside className="sidePanel">
        <div>
          <p className="eyebrow">VVPP Latvian A2</p>
          <h1 className="brand">Trainer</h1>
        </div>
        <nav className="mainNav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={clsx("navItem", pathname === item.href && "active")}
            >
              {t(language, item.labelKey)}
            </Link>
          ))}
        </nav>
        <LanguageToggle />
      </aside>
      <main className="contentArea">{children}</main>
    </div>
  );
}
