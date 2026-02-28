"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

type GeneratedPayload = {
  generator: { name: string; seed: number; n: number };
  exams: Array<{ examId: string; versionLabel: string; validation: { totalPoints: number } }>;
};

type GenerationDiagnostics = {
  requestedUseLlm: boolean;
  requireLlm: boolean;
  selectedBaseUrl: string | null;
  model: string;
  baseUrlProbes: Array<{ baseUrl: string; ok: boolean; models?: string[]; error?: string }>;
  stats: {
    llmRequested: boolean;
    llmPreflightPassed: boolean;
    llmCount: number;
    fallbackCount: number;
    total: number;
    preflightError?: string;
  };
};

type ImportResult = {
  examId: string;
  versionLabel: string;
  importedTasks: number;
  replacedExisting: boolean;
  dbTaskCount: number;
  importedTaskIds: string[];
};

type BatchImportResultItem = {
  fileName: string;
  ok: boolean;
  error?: string;
  examId?: string;
  versionLabel?: string;
  importedTasks?: number;
  dbTaskCount?: number;
  importedTaskIds?: string[];
};

type BatchImportResult = {
  totalFiles: number;
  succeeded: number;
  failed: number;
  replacedExisting: boolean;
  results: BatchImportResultItem[];
};

type JobStatus = "queued" | "running" | "completed" | "failed";

type JobPhase = "queued" | "start" | "preflight" | "generating" | "completed" | "failed";

type GenerationJobProgress = {
  phase: JobPhase;
  percent: number;
  totalExams: number;
  completedExams: number;
  llmCount: number;
  fallbackCount: number;
  currentExamId?: string;
};

type GenerationJobSnapshot = {
  jobId: string;
  status: JobStatus;
  progress: GenerationJobProgress;
  createdAt: string;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  result?: {
    payload: GeneratedPayload;
    diagnostics: GenerationDiagnostics;
  };
  error?: string;
  code?: string;
};

const JOB_STORAGE_KEY = "vvpp-generator-job-id";

export function GeneratorConsole() {
  const [n, setN] = useState(3);
  const [seed, setSeed] = useState(2026);
  const [extraPracticeVariants, setExtraPracticeVariants] = useState(2);
  const [useLlm, setUseLlm] = useState(true);
  const [timeoutMs, setTimeoutMs] = useState(60000);
  const [maxRetries, setMaxRetries] = useState(1);
  const [concurrency, setConcurrency] = useState(1);
  const [chunkSize, setChunkSize] = useState(1);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [requireLlm, setRequireLlm] = useState(true);

  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [busyImport, setBusyImport] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [progress, setProgress] = useState<GenerationJobProgress>({
    phase: "queued",
    percent: 0,
    totalExams: n + extraPracticeVariants,
    completedExams: 0,
    llmCount: 0,
    fallbackCount: 0,
  });
  const [selectedExamId, setSelectedExamId] = useState("");
  const [payload, setPayload] = useState<GeneratedPayload | null>(null);
  const [diagnostics, setDiagnostics] = useState<GenerationDiagnostics | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchImportResult, setBatchImportResult] = useState<BatchImportResult | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof window.setInterval> | null>(null);

  const examOptions = useMemo(() => payload?.exams ?? [], [payload]);
  const busyGenerate = jobStatus === "running";

  const clearStoredJob = useCallback(() => {
    window.localStorage.removeItem(JOB_STORAGE_KEY);
    setJobId(null);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const applyRunningStatus = useCallback((snapshot: GenerationJobSnapshot) => {
    const currentExamHint = snapshot.progress.currentExamId ? ` · ${snapshot.progress.currentExamId}` : "";
    setStatus(
      `Generating exams... ${snapshot.progress.percent}% (${snapshot.progress.completedExams}/${snapshot.progress.totalExams})${currentExamHint}`,
    );
  }, []);

  const handleCompletedSnapshot = useCallback(
    (snapshot: GenerationJobSnapshot) => {
      if (!snapshot.result) {
        throw new Error("Generation job completed without result payload.");
      }

      const nextPayload = snapshot.result.payload;
      const nextDiagnostics = snapshot.result.diagnostics;

      setPayload(nextPayload);
      setDiagnostics(nextDiagnostics);
      setSelectedExamId(nextPayload.exams[0]?.examId ?? "");
      setStatus(
        `Generated ${nextPayload.exams.length} exam version(s). LLM exams: ${nextDiagnostics.stats.llmCount}, fallbacks: ${nextDiagnostics.stats.fallbackCount}.`,
      );
      setJobStatus("completed");
      clearStoredJob();
      stopPolling();
    },
    [clearStoredJob, stopPolling],
  );

  const handleFailedSnapshot = useCallback(
    (snapshot: GenerationJobSnapshot) => {
      setStatus(`Generation failed: ${snapshot.error ?? "Generation failed"}`);
      setJobStatus("failed");
      clearStoredJob();
      stopPolling();
    },
    [clearStoredJob, stopPolling],
  );

  const pollJob = useCallback(
    async (activeJobId: string) => {
      try {
        const response = await fetch(`/api/content/generate-vvpp-a2/jobs/${encodeURIComponent(activeJobId)}`, {
          method: "GET",
          cache: "no-store",
        });
        const json = (await response.json()) as {
          ok: boolean;
          error?: string;
          code?: string;
          data?: GenerationJobSnapshot;
        };

        if (response.status === 404 || json.code === "JOB_NOT_FOUND") {
          setStatus("Previous generation job was not found (expired or server restarted). Start a new job.");
          setJobStatus("idle");
          clearStoredJob();
          stopPolling();
          return;
        }

        if (!response.ok || !json.ok || !json.data) {
          throw new Error(json.error ?? "Failed to load generation job status");
        }

        const snapshot = json.data;
        setJobId(snapshot.jobId);
        setProgress(snapshot.progress);

        if (snapshot.status === "completed") {
          handleCompletedSnapshot(snapshot);
          return;
        }

        if (snapshot.status === "failed") {
          handleFailedSnapshot(snapshot);
          return;
        }

        setJobStatus("running");
        applyRunningStatus(snapshot);
      } catch (error) {
        setStatus(`Generation status check failed: ${String(error)}`);
        setJobStatus("failed");
        clearStoredJob();
        stopPolling();
      }
    },
    [applyRunningStatus, clearStoredJob, handleCompletedSnapshot, handleFailedSnapshot, stopPolling],
  );

  const startPolling = useCallback(
    (activeJobId: string) => {
      stopPolling();
      void pollJob(activeJobId);
      pollTimerRef.current = window.setInterval(() => {
        void pollJob(activeJobId);
      }, 1000);
    },
    [pollJob, stopPolling],
  );

  useEffect(() => {
    const storedJobId = window.localStorage.getItem(JOB_STORAGE_KEY);
    if (!storedJobId) return;

    setJobStatus("running");
    setStatus("Resuming background generation job...");
    setJobId(storedJobId);
    startPolling(storedJobId);

    return () => {
      stopPolling();
    };
  }, [startPolling, stopPolling]);

  async function runGenerate() {
    setJobStatus("running");
    setStatus("Starting background generation...");
    setImportResult(null);
    setBatchImportResult(null);
    setDiagnostics(null);
    setPayload(null);

    setProgress({
      phase: "queued",
      percent: 0,
      totalExams: Math.max(1, n) + Math.max(0, extraPracticeVariants),
      completedExams: 0,
      llmCount: 0,
      fallbackCount: 0,
    });

    try {
      const response = await fetch("/api/content/generate-vvpp-a2/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          n,
          seed,
          extraPracticeVariants,
          useLlm,
          requireLlm,
          llm: {
            timeoutMs,
            maxRetries,
            concurrency,
            chunkSize,
          },
        }),
      });

      const json = (await response.json()) as {
        ok: boolean;
        error?: string;
        data?: GenerationJobSnapshot;
      };

      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json.error ?? "Generation failed");
      }

      const snapshot = json.data;
      setJobId(snapshot.jobId);
      setProgress(snapshot.progress);
      window.localStorage.setItem(JOB_STORAGE_KEY, snapshot.jobId);
      startPolling(snapshot.jobId);
    } catch (error) {
      setJobStatus("failed");
      clearStoredJob();
      stopPolling();
      setStatus(`Generation failed: ${String(error)}`);
    }
  }

  async function runImport() {
    if (!payload || !selectedExamId) return;

    setBusyImport(true);
    setStatus(`Importing ${selectedExamId} into DB...`);
    setBatchImportResult(null);

    try {
      const response = await fetch("/api/content/import-vvpp-a2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload,
          examId: selectedExamId,
          replaceExisting,
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? "Import failed");
      }

      const result = json.data as ImportResult;
      setImportResult(result);
      setStatus(`Imported ${result.examId}. DB now has ${result.dbTaskCount} tasks for this exam.`);
    } catch (error) {
      setStatus(`Import failed: ${String(error)}`);
    } finally {
      setBusyImport(false);
    }
  }

  function onBatchFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? []).filter((file) => file.name.toLowerCase().endsWith(".json"));
    setBatchFiles(nextFiles);
    setBatchImportResult(null);
    if (nextFiles.length === 0) {
      setStatus("No JSON files selected for batch import.");
      return;
    }
    setStatus(`Selected ${nextFiles.length} JSON file(s) for batch import.`);
  }

  async function runBatchImport() {
    if (batchFiles.length === 0) return;

    setBusyImport(true);
    setImportResult(null);
    setBatchImportResult(null);
    setStatus(`Importing ${batchFiles.length} JSON file(s) into DB...`);

    try {
      const form = new FormData();
      form.append("mode", "batch");
      form.append("replaceExisting", String(replaceExisting));
      for (const file of batchFiles) {
        form.append("files", file);
      }

      const response = await fetch("/api/content/import-vvpp-a2", {
        method: "POST",
        body: form,
      });

      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.error ?? "Batch import failed");
      }

      const result = json.data as BatchImportResult;
      setBatchImportResult(result);
      setStatus(`Batch import completed: ${result.succeeded} succeeded, ${result.failed} failed.`);
    } catch (error) {
      setStatus(`Batch import failed: ${String(error)}`);
    } finally {
      setBusyImport(false);
    }
  }

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>VVPP A2 Generator</h2>
        <p>Generate exam JSON from UI, import to DB, then open exam/trainer pages.</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <h3>Generation Settings</h3>
        <div className="grid three" style={{ marginTop: "0.75rem" }}>
          <label>
            N
            <input type="number" min={1} max={200} value={n} onChange={(e) => setN(Number(e.target.value) || 1)} />
          </label>
          <label>
            Seed
            <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 2026)} />
          </label>
          <label>
            Extra Practice
            <input
              type="number"
              min={0}
              max={200}
              value={extraPracticeVariants}
              onChange={(e) => setExtraPracticeVariants(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="grid three" style={{ marginTop: "0.75rem" }}>
          <label>
            <input type="checkbox" checked={useLlm} onChange={(e) => setUseLlm(e.target.checked)} /> Use local LLM
          </label>
          <label>
            <input type="checkbox" checked={requireLlm} onChange={(e) => setRequireLlm(e.target.checked)} /> Require LLM
          </label>
          <label>
            Timeout ms
            <input
              type="number"
              min={1000}
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value) || 60000)}
            />
          </label>
          <label>
            Max retries
            <input
              type="number"
              min={0}
              value={maxRetries}
              onChange={(e) => setMaxRetries(Number(e.target.value) || 0)}
            />
          </label>
        </div>

        <div className="grid three" style={{ marginTop: "0.75rem" }}>
          <label>
            Concurrency
            <input
              type="number"
              min={1}
              max={4}
              value={concurrency}
              onChange={(e) => setConcurrency(Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Chunk size
            <input
              type="number"
              min={1}
              max={200}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value) || 1)}
            />
          </label>
          <div />
        </div>

        <div className="ctaRow" style={{ marginTop: "1rem" }}>
          <button type="button" className="primaryBtn" onClick={runGenerate} disabled={busyGenerate || busyImport}>
            {busyGenerate ? "Generating..." : "Generate"}
          </button>
          {jobId ? <span style={{ fontSize: "0.85rem", color: "#555" }}>Job: {jobId}</span> : null}
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <h3>Import To DB</h3>
        <div className="grid two" style={{ marginTop: "0.75rem" }}>
          <label>
            Select exam
            <select value={selectedExamId} onChange={(e) => setSelectedExamId(e.target.value)} disabled={!payload}>
              <option value="">Choose exam</option>
              {examOptions.map((exam) => (
                <option key={exam.examId} value={exam.examId}>
                  {exam.versionLabel} ({exam.examId})
                </option>
              ))}
            </select>
          </label>
          <div className="ctaRow" style={{ alignItems: "end" }}>
            <label>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />{" "}
              Replace existing tasks
            </label>
            <button
              type="button"
              className="primaryBtn"
              onClick={runImport}
              disabled={!payload || !selectedExamId || busyImport || busyGenerate}
            >
              {busyImport ? "Importing..." : "Import Selected Exam"}
            </button>
          </div>
        </div>

        <div style={{ marginTop: "1rem" }}>
          <label>
            JSON files (batch)
            <input
              type="file"
              accept=".json,application/json"
              multiple
              onChange={onBatchFilesSelected}
              disabled={busyImport || busyGenerate}
            />
          </label>
          <p style={{ marginTop: "0.4rem" }}>Selected files: {batchFiles.length}</p>
          {batchFiles.length > 0 ? (
            <ul style={{ margin: "0.5rem 0", paddingLeft: "1.25rem" }}>
              {batchFiles.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`}>{file.name}</li>
              ))}
            </ul>
          ) : null}
          <button
            type="button"
            className="primaryBtn"
            onClick={runBatchImport}
            disabled={batchFiles.length === 0 || busyImport || busyGenerate}
          >
            {busyImport ? "Importing..." : "Import All JSON Files"}
          </button>
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <h3>Status</h3>
        <p>{status}</p>

        {jobStatus !== "idle" || progress.percent > 0 ? (
          <div style={{ marginTop: "0.5rem" }}>
            <p style={{ marginBottom: "0.4rem" }}>
              Progress: <strong>{progress.percent}%</strong> ({progress.completedExams}/{progress.totalExams})
            </p>
            <div className="meter">
              <span style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        ) : null}

        {payload ? (
          <>
            <p>
              Generated by <strong>{payload.generator.name}</strong> with seed {payload.generator.seed}. Exams: {payload.exams.length}
            </p>
            <table className="tableLike">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Label</th>
                  <th>Total points</th>
                </tr>
              </thead>
              <tbody>
                {payload.exams.map((exam) => (
                  <tr key={exam.examId}>
                    <td>{exam.examId}</td>
                    <td>{exam.versionLabel}</td>
                    <td>{exam.validation.totalPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}

        {diagnostics ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              LLM diagnostics: model <strong>{diagnostics.model}</strong>, base URL{" "}
              <strong>{diagnostics.selectedBaseUrl ?? "not resolved"}</strong>.
            </p>
            <p>
              Preflight: {diagnostics.stats.llmPreflightPassed ? "OK" : "FAILED"}; used on{" "}
              {diagnostics.stats.llmCount}/{diagnostics.stats.total} exam(s).
            </p>
          </div>
        ) : null}

        {importResult ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              Imported exam: <strong>{importResult.examId}</strong> ({importResult.versionLabel})
            </p>
            <p>
              Tasks imported: {importResult.importedTasks}; DB tasks for exam: {importResult.dbTaskCount}
            </p>
            <div className="ctaRow">
              <Link className="secondaryBtn buttonLike" href={`/exam?examId=${encodeURIComponent(importResult.examId)}`}>
                Open Exam Page
              </Link>
              <Link
                className="secondaryBtn buttonLike"
                href={`/trainer/listening?examId=${encodeURIComponent(importResult.examId)}`}
              >
                Open Trainer
              </Link>
            </div>
          </div>
        ) : null}

        {batchImportResult ? (
          <div style={{ marginTop: "1rem" }}>
            <p>
              Batch import: {batchImportResult.succeeded}/{batchImportResult.totalFiles} succeeded, {batchImportResult.failed} failed.
            </p>
            <table className="tableLike">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Status</th>
                  <th>Exam</th>
                  <th>Imported</th>
                  <th>DB tasks</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {batchImportResult.results.map((row) => (
                  <tr key={`${row.fileName}-${row.examId ?? "na"}-${row.ok ? "ok" : "err"}`}>
                    <td>{row.fileName}</td>
                    <td>{row.ok ? "OK" : "FAILED"}</td>
                    <td>{row.examId ?? "-"}</td>
                    <td>{row.importedTasks ?? "-"}</td>
                    <td>{row.dbTaskCount ?? "-"}</td>
                    <td>{row.error ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
