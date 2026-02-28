"use client";

import { useRouter } from "next/navigation";

type ExamDatasetOption = {
  examId: string;
  versionLabel: string;
  taskCount: number;
};

export function ExamDatasetSelector({
  basePath,
  selectedExamId,
  options,
}: {
  basePath: string;
  selectedExamId: string;
  options: ExamDatasetOption[];
}) {
  const router = useRouter();

  return (
    <div className="panel" style={{ padding: "0.75rem" }}>
      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>Exam dataset</span>
        <select
          value={selectedExamId}
          onChange={(event) => {
            const nextExamId = event.target.value;
            const nextUrl = `${basePath}?examId=${encodeURIComponent(nextExamId)}`;
            router.push(nextUrl);
          }}
        >
          {options.map((option) => (
            <option key={option.examId} value={option.examId}>
              {option.versionLabel} ({option.examId}) [{option.taskCount} tasks]
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
