"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StartExamButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function onStart() {
    setBusy(true);
    router.push("/exam");
  }

  return (
    <button className="primaryBtn" type="button" onClick={onStart} disabled={busy}>
      {busy ? "Preparing..." : "Start Full Exam"}
    </button>
  );
}
