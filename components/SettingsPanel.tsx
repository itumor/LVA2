"use client";

import { useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";

export function SettingsPanel() {
  const { language, setLanguage } = useLanguage();
  const [replayRule, setReplayRule] = useState("2");

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>Settings</h2>
        <p>Language mode and trainer behavior preferences.</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <div className="grid two">
          <div>
            <label htmlFor="lang">UI Language</label>
            <select
              id="lang"
              value={language}
              onChange={(event) => setLanguage(event.target.value === "en" ? "en" : "lv")}
            >
              <option value="lv">Latviešu</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label htmlFor="replay">Listening replay limit</label>
            <select id="replay" value={replayRule} onChange={(event) => setReplayRule(event.target.value)}>
              <option value="1">1 play</option>
              <option value="2">2 plays</option>
              <option value="3">3 plays</option>
            </select>
          </div>
        </div>
      </div>
    </section>
  );
}
