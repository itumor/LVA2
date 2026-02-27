"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/components/LanguageProvider";
import { primeClientTtsConfig } from "@/lib/tts-client";

type TtsModel = {
  id: string;
  label: string;
  filesPresent: { onnx: boolean; json: boolean };
  sizeBytes?: number;
  updatedAt?: string;
  provider: "piper" | "f5";
};

type SttModel = { id: string; provider: "whisper-ct2" | "whisper-transformers" | "whisper-cpp" };

type BenchmarkSummaryRow = {
  modelId: string;
  samples: number;
  avgNaturalness: number;
  avgPronunciation: number;
  avgLatencyMs: number;
  compositeScore: number;
  lastTestedAt: string;
};

type BenchmarkRun = { runId: string; audioUrl: string; latencyMs: number; cacheHit: boolean };

type CatalogModel = {
  id: string;
  repo: string;
  task: string;
  runtime: "piper" | "whisper" | "f5" | "unknown";
  supportedInApp: boolean;
};

type SttBenchmarkResult = {
  provider: string;
  modelId: string;
  transcript: string;
  latencyMs: number;
  referenceText: string | null;
  wordAccuracy: number | null;
};

const promptPack = [
  { id: "p1", text: "Labdien! Mani sauc Anna, un es mācos latviešu valodu." },
  { id: "p2", text: "Šodien ir 14. februāris, pulkstenis ir 17:35." },
  { id: "p3", text: "Dzīvoklis atrodas centrā, netālu no stacijas un tirgus." },
  { id: "p4", text: "Vai jūs varat pateikt, cik maksā īre mēnesī?" },
  { id: "p5", text: "Rīt būs saulains laiks, bet vakarā iespējams neliels lietus." },
  { id: "p6", text: "Es vēlētos rezervēt galdiņu diviem cilvēkiem plkst. septiņos." },
];

function formatBytes(bytes?: number) {
  if (!bytes || bytes <= 0) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsPanel() {
  const { language, setLanguage } = useLanguage();
  const [replayRule, setReplayRule] = useState("2");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [ttsModels, setTtsModels] = useState<TtsModel[]>([]);
  const [sttModels, setSttModels] = useState<SttModel[]>([]);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [summaryRows, setSummaryRows] = useState<BenchmarkSummaryRow[]>([]);

  const [ttsProvider, setTtsProvider] = useState<"piper" | "f5">("piper");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedRate, setSelectedRate] = useState(1);

  const [sttProvider, setSttProvider] = useState<"browser" | "whisper-ct2" | "whisper-transformers" | "whisper-cpp">("browser");
  const [sttModelId, setSttModelId] = useState("");
  const [sttBenchmarkFile, setSttBenchmarkFile] = useState<File | null>(null);
  const [sttRecordedBlob, setSttRecordedBlob] = useState<Blob | null>(null);
  const [sttRecordedUrl, setSttRecordedUrl] = useState<string | null>(null);
  const [sttRecording, setSttRecording] = useState(false);
  const [sttReferenceText, setSttReferenceText] = useState("");
  const [sttBenchmarkResult, setSttBenchmarkResult] = useState<SttBenchmarkResult | null>(null);
  const sttRecorderRef = useRef<MediaRecorder | null>(null);
  const sttStreamRef = useRef<MediaStream | null>(null);
  const sttChunksRef = useRef<Blob[]>([]);

  const [selectedPromptId, setSelectedPromptId] = useState(promptPack[0]?.id ?? "p1");
  const [lastRun, setLastRun] = useState<BenchmarkRun | null>(null);
  const [ratingNaturalness, setRatingNaturalness] = useState(4);
  const [ratingPronunciation, setRatingPronunciation] = useState(4);
  const [ratingNotes, setRatingNotes] = useState("");

  const activeTopModel = summaryRows[0]?.modelId ?? null;

  async function loadData() {
    setLoading(true);
    setStatus(null);
    try {
      const [ttsModelsRes, ttsSummaryRes, catalogRes, sttModelsRes, ttsConfigRes, sttConfigRes] = await Promise.all([
        fetch("/api/tts/models"),
        fetch("/api/tts/benchmark/summary"),
        fetch("/api/tts/catalog"),
        fetch("/api/stt/models"),
        fetch("/api/tts/config"),
        fetch("/api/stt/config"),
      ]);

      const ttsModelsPayload = await ttsModelsRes.json();
      const ttsSummaryPayload = await ttsSummaryRes.json();
      const catalogPayload = await catalogRes.json();
      const sttModelsPayload = await sttModelsRes.json();
      const ttsConfigPayload = await ttsConfigRes.json();
      const sttConfigPayload = await sttConfigRes.json();

      if (!ttsModelsPayload.ok || !ttsSummaryPayload.ok || !catalogPayload.ok || !sttModelsPayload.ok) {
        throw new Error("Could not load model catalogs");
      }

      const loadedTts = ttsModelsPayload.data.models as TtsModel[];
      const loadedStt = sttModelsPayload.data.models as SttModel[];
      setTtsModels(loadedTts);
      setSttModels(loadedStt);
      setSummaryRows(ttsSummaryPayload.data.rows as BenchmarkSummaryRow[]);
      setCatalogModels(catalogPayload.data.models as CatalogModel[]);

      const ttsConfig = ttsConfigPayload.ok ? ttsConfigPayload.data : null;
      if (ttsConfig) {
        setTtsProvider(ttsConfig.provider ?? "piper");
        setSelectedModelId(ttsConfig.modelId);
        setSelectedRate(ttsConfig.rate);
        primeClientTtsConfig({ provider: ttsConfig.provider, modelId: ttsConfig.modelId, rate: ttsConfig.rate });
      } else if (loadedTts.length > 0) {
        setSelectedModelId(loadedTts[0].id);
        setTtsProvider(loadedTts[0].provider);
      }

      const sttConfig = sttConfigPayload.ok ? sttConfigPayload.data : null;
      if (sttConfig) {
        setSttProvider(sttConfig.provider);
        setSttModelId(sttConfig.modelId);
      } else if (loadedStt.length > 0) {
        setSttProvider(loadedStt[0].provider);
        setSttModelId(loadedStt[0].id);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const firstForProvider = ttsModels.find((m) => m.provider === ttsProvider);
    if (!firstForProvider) return;
    const found = ttsModels.find((m) => m.provider === ttsProvider && m.id === selectedModelId);
    if (!found) setSelectedModelId(firstForProvider.id);
  }, [ttsModels, ttsProvider, selectedModelId]);

  const selectedPrompt = useMemo(() => promptPack.find((p) => p.id === selectedPromptId) ?? promptPack[0], [selectedPromptId]);

  async function saveTtsConfig(modelId: string, rate: number) {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/tts/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: ttsProvider, modelId, rate }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save TTS config");
      primeClientTtsConfig({ provider: payload.data.provider, modelId: payload.data.modelId, rate: payload.data.rate });
      setStatus(`TTS active model set to ${payload.data.modelId} (${payload.data.provider}).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save TTS config");
    } finally {
      setBusy(false);
    }
  }

  async function saveSttConfig() {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/stt/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: sttProvider, modelId: sttModelId || "browser" }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save STT config");
      setStatus(`STT config saved (${payload.data.provider}: ${payload.data.modelId}).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save STT config");
    } finally {
      setBusy(false);
    }
  }

  async function runSttBenchmark() {
    const sourceBlob = sttRecordedBlob ?? sttBenchmarkFile;
    if (!sourceBlob) {
      setStatus("Please choose an audio file for STT benchmark.");
      return;
    }

    setBusy(true);
    setStatus(null);
    try {
      const form = new FormData();
      const fileName = sttRecordedBlob ? `stt-benchmark-${Date.now()}.webm` : (sttBenchmarkFile?.name ?? `stt-benchmark-${Date.now()}.webm`);
      form.set("file", sourceBlob, fileName);
      form.set("referenceText", sttReferenceText);

      const response = await fetch("/api/stt/benchmark/run", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "STT benchmark failed");
      setSttBenchmarkResult(payload.data as SttBenchmarkResult);
      setStatus("STT benchmark completed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "STT benchmark failed");
    } finally {
      setBusy(false);
    }
  }

  async function startSttRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      sttStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      sttChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) sttChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(sttChunksRef.current, { type: "audio/webm" });
        if (sttRecordedUrl) URL.revokeObjectURL(sttRecordedUrl);
        const nextUrl = URL.createObjectURL(blob);
        setSttRecordedBlob(blob);
        setSttRecordedUrl(nextUrl);
        setSttRecording(false);
        for (const track of stream.getTracks()) track.stop();
        sttStreamRef.current = null;
      };

      recorder.start();
      sttRecorderRef.current = recorder;
      setSttRecording(true);
      setStatus("Recording STT sample...");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Microphone recording failed.");
    }
  }

  function stopSttRecording() {
    if (!sttRecorderRef.current) return;
    sttRecorderRef.current.stop();
    sttRecorderRef.current = null;
  }

  useEffect(() => {
    return () => {
      if (sttRecordedUrl) URL.revokeObjectURL(sttRecordedUrl);
      if (sttStreamRef.current) {
        for (const track of sttStreamRef.current.getTracks()) track.stop();
      }
    };
  }, [sttRecordedUrl]);

  async function runBenchmark(modelId: string, promptId: string) {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/tts/benchmark/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: ttsProvider, modelId, rate: selectedRate, promptId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Benchmark run failed");
      setLastRun(payload.data as BenchmarkRun);
      setStatus(`Benchmark completed for ${modelId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Benchmark failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRating() {
    if (!lastRun) return;
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch("/api/tts/benchmark/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: lastRun.runId,
          naturalness: ratingNaturalness,
          pronunciation: ratingPronunciation,
          notes: ratingNotes.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? "Could not save rating");
      await loadData();
      setStatus("Rating saved.");
      setRatingNotes("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save rating");
    } finally {
      setBusy(false);
    }
  }

  const ttsOptionsForProvider = ttsModels.filter((m) => m.provider === ttsProvider);
  const sttOptionsForProvider = sttModels.filter((m) => m.provider === sttProvider);

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>Settings</h2>
        <p>Language mode, trainer preferences, and full model control for TTS/STT.</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <div className="grid two">
          <div>
            <label htmlFor="lang">UI Language</label>
            <select id="lang" value={language} onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "lv")}>
              <option value="lv">Latviešu</option>
              <option value="en">English</option>
            </select>
          </div>
          <div>
            <label htmlFor="replay">Listening replay limit</label>
            <select id="replay" value={replayRule} onChange={(e) => setReplayRule(e.target.value)}>
              <option value="1">1 play</option>
              <option value="2">2 plays</option>
              <option value="3">3 plays</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel" style={{ padding: "1rem", display: "grid", gap: "1rem" }}>
        <h3 style={{ margin: 0 }}>TTS Model Lab</h3>
        {status ? <p style={{ margin: 0 }}>{status}</p> : null}
        {loading ? <p style={{ margin: 0 }}>Loading models...</p> : null}

        {!loading ? (
          <>
            <div className="grid two">
              <div>
                <label htmlFor="tts-provider">TTS provider</label>
                <select id="tts-provider" value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value as "piper" | "f5")}>
                  <option value="piper">piper</option>
                  <option value="f5">f5</option>
                </select>
              </div>
              <div>
                <label htmlFor="tts-model">Active model</label>
                <select id="tts-model" value={selectedModelId} onChange={(e) => setSelectedModelId(e.target.value)}>
                  {ttsOptionsForProvider.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="tts-rate">Rate: {selectedRate.toFixed(2)}</label>
              <input id="tts-rate" type="range" min={0.7} max={1.3} step={0.05} value={selectedRate} onChange={(e) => setSelectedRate(Number(e.target.value))} />
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
              <button className="primaryBtn" type="button" disabled={busy || !selectedModelId} onClick={() => void saveTtsConfig(selectedModelId, selectedRate)}>Save active TTS config</button>
              {activeTopModel ? <button className="secondaryBtn" type="button" disabled={busy} onClick={() => void saveTtsConfig(activeTopModel, selectedRate)}>Use best model ({activeTopModel})</button> : null}
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="trueFalseTable">
                <thead><tr><th>Model</th><th>Provider</th><th>Files</th><th>Size</th><th>Last tested</th><th>Avg latency</th><th>Score</th></tr></thead>
                <tbody>
                  {ttsModels.map((m) => {
                    const row = summaryRows.find((r) => r.modelId === m.id);
                    return (
                      <tr key={m.id}>
                        <td>{m.id}</td>
                        <td>{m.provider}</td>
                        <td>{m.filesPresent.onnx ? "ONNX" : "-"} / {m.filesPresent.json ? "JSON" : "-"}</td>
                        <td>{formatBytes(m.sizeBytes)}</td>
                        <td>{row?.lastTestedAt ? new Date(row.lastTestedAt).toLocaleString() : "-"}</td>
                        <td>{row ? `${row.avgLatencyMs.toFixed(0)} ms` : "-"}</td>
                        <td>{row ? row.compositeScore.toFixed(2) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ borderTop: "1px solid #ddd", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
              <h4 style={{ margin: 0 }}>TTS Benchmark</h4>
              <label htmlFor="benchmark-prompt">Prompt</label>
              <select id="benchmark-prompt" value={selectedPromptId} onChange={(e) => setSelectedPromptId(e.target.value)}>
                {promptPack.map((p) => <option key={p.id} value={p.id}>{p.id}: {p.text}</option>)}
              </select>
              <button className="primaryBtn" type="button" disabled={busy || !selectedModelId} onClick={() => void runBenchmark(selectedModelId, selectedPrompt.id)}>Run benchmark for active model</button>

              {lastRun ? (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  <p style={{ margin: 0 }}>Last run: {lastRun.latencyMs} ms {lastRun.cacheHit ? "(cache hit)" : "(fresh synthesis)"}</p>
                  <audio controls src={lastRun.audioUrl} style={{ width: "100%" }} />
                  <div className="grid two">
                    <div><label htmlFor="rate-naturalness">Naturalness (1-5)</label><input id="rate-naturalness" type="number" min={1} max={5} value={ratingNaturalness} onChange={(e) => setRatingNaturalness(Number(e.target.value))} /></div>
                    <div><label htmlFor="rate-pron">Pronunciation (1-5)</label><input id="rate-pron" type="number" min={1} max={5} value={ratingPronunciation} onChange={(e) => setRatingPronunciation(Number(e.target.value))} /></div>
                  </div>
                  <label htmlFor="rate-notes">Notes</label>
                  <textarea id="rate-notes" rows={3} value={ratingNotes} onChange={(e) => setRatingNotes(e.target.value)} />
                  <button className="primaryBtn" type="button" disabled={busy} onClick={() => void submitRating()}>Save rating</button>
                </div>
              ) : null}
            </div>

            <div style={{ borderTop: "1px solid #ddd", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
              <h4 style={{ margin: 0 }}>STT Models</h4>
              <div className="grid two">
                <div>
                  <label htmlFor="stt-provider">STT provider</label>
                  <select id="stt-provider" value={sttProvider} onChange={(e) => setSttProvider(e.target.value as "browser" | "whisper-ct2" | "whisper-transformers" | "whisper-cpp")}>
                    <option value="browser">browser</option>
                    <option value="whisper-ct2">whisper-ct2</option>
                    <option value="whisper-transformers">whisper-transformers</option>
                    <option value="whisper-cpp">whisper-cpp</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="stt-model">STT model</label>
                  <select id="stt-model" value={sttModelId} onChange={(e) => setSttModelId(e.target.value)} disabled={sttProvider === "browser"}>
                    {sttProvider === "browser" ? <option value="browser">Browser SpeechRecognition</option> : sttOptionsForProvider.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                  </select>
                </div>
              </div>
              <button className="primaryBtn" type="button" disabled={busy} onClick={() => void saveSttConfig()}>Save STT config</button>
              <p style={{ margin: 0, opacity: 0.8 }}>Server STT uses <code>/api/stt/transcribe</code>. Browser mode keeps current in-browser mic recognition.</p>

              <div style={{ borderTop: "1px solid #ddd", paddingTop: "0.75rem", display: "grid", gap: "0.5rem" }}>
                <h5 style={{ margin: 0 }}>STT Benchmark</h5>
                <label htmlFor="stt-benchmark-file">Audio file</label>
                <input
                  id="stt-benchmark-file"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    setSttBenchmarkFile(e.target.files?.[0] ?? null);
                    setSttRecordedBlob(null);
                    if (sttRecordedUrl) {
                      URL.revokeObjectURL(sttRecordedUrl);
                      setSttRecordedUrl(null);
                    }
                  }}
                />
                <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                  {!sttRecording ? (
                    <button className="secondaryBtn" type="button" disabled={busy} onClick={() => void startSttRecording()}>
                      Record from mic
                    </button>
                  ) : (
                    <button className="secondaryBtn" type="button" disabled={busy} onClick={stopSttRecording}>
                      Stop recording
                    </button>
                  )}
                  {sttRecordedBlob ? <p style={{ margin: 0, alignSelf: "center" }}>Using recorded audio sample.</p> : null}
                </div>
                {sttRecordedUrl ? <audio controls src={sttRecordedUrl} style={{ width: "100%" }} /> : null}
                <label htmlFor="stt-reference">Reference text (optional, for accuracy)</label>
                <textarea
                  id="stt-reference"
                  rows={3}
                  value={sttReferenceText}
                  onChange={(e) => setSttReferenceText(e.target.value)}
                />
                <button className="primaryBtn" type="button" disabled={busy || (!sttBenchmarkFile && !sttRecordedBlob)} onClick={() => void runSttBenchmark()}>
                  Run benchmark for active STT model
                </button>
                {sttBenchmarkResult ? (
                  <div style={{ display: "grid", gap: "0.35rem" }}>
                    <p style={{ margin: 0 }}>
                      Result: {sttBenchmarkResult.provider} / {sttBenchmarkResult.modelId}, {sttBenchmarkResult.latencyMs} ms
                    </p>
                    {sttBenchmarkResult.wordAccuracy !== null ? (
                      <p style={{ margin: 0 }}>Word accuracy: {sttBenchmarkResult.wordAccuracy.toFixed(2)}%</p>
                    ) : null}
                    <p style={{ margin: 0 }}><strong>Transcript:</strong> {sttBenchmarkResult.transcript || "(empty)"}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ borderTop: "1px solid #ddd", paddingTop: "1rem", display: "grid", gap: "0.75rem" }}>
              <h4 style={{ margin: 0 }}>RaivisDejus Catalog</h4>
              <div style={{ overflowX: "auto" }}>
                <table className="trueFalseTable">
                  <thead><tr><th>Model</th><th>Task</th><th>Runtime</th><th>Supported in app</th></tr></thead>
                  <tbody>{catalogModels.map((m) => <tr key={m.id}><td>{m.id}</td><td>{m.task}</td><td>{m.runtime}</td><td>{m.supportedInApp ? "Yes" : "Partial"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
