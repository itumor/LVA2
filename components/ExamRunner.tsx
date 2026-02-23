"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const sectionOrder = ["LISTENING", "READING", "WRITING", "SPEAKING"] as const;
const sectionMinutes: Record<(typeof sectionOrder)[number], number> = {
  LISTENING: 25,
  READING: 30,
  WRITING: 35,
  SPEAKING: 15,
};

type ExamStrictness = "OFFICIAL" | "PRACTICE";

type ExamTask = {
  id: string;
  skill: string;
  taskType: string;
  topic: string;
  promptLv: string;
  promptEn?: string;
  audioRef?: string | null;
  transcript?: string | null;
  points: number;
  questions: Array<Record<string, unknown>>;
};

type GroupedTasks = Record<string, ExamTask[]>;

type ListeningPlayState = {
  playsUsed: number;
  playsRemaining: number;
  locked: boolean;
};

type SectionSummary = {
  sectionResult: {
    skill: string;
    score: number;
    maxScore: number;
    passed: boolean;
    status: string;
  };
  weakTaskTypes: string[];
  weakTopics: string[];
  recommendedTaskIds: string[];
};

type FinalResult = {
  id: string;
  passAll: boolean | null;
  totalScore: number | null;
  failReasonsDetailed: Array<{
    skill: string;
    criterion: string;
    explanation: string;
    requiredScore: number;
    actualScore: number;
    shortfall: number;
  }>;
  remediationPlan: Array<{
    skill: string;
    weakTaskTypes: string[];
    weakTopics: string[];
    recommendedTaskIds: string[];
  }>;
};

function toSeconds(deadlineIso: string | null, fallbackMinutes: number) {
  if (!deadlineIso) return fallbackMinutes * 60;
  const diff = new Date(deadlineIso).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 1000));
}

export function ExamRunner({ tasksBySkill }: { tasksBySkill: GroupedTasks }) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [sessionId, setSessionId] = useState<string | null>(searchParams.get("sessionId"));
  const [strictness, setStrictness] = useState<ExamStrictness>("OFFICIAL");
  const [sectionDeadlines, setSectionDeadlines] = useState<Partial<Record<(typeof sectionOrder)[number], string>>>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(sectionMinutes.LISTENING * 60);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Select a simulation mode to begin.");
  const [busy, setBusy] = useState(false);
  const [playState, setPlayState] = useState<Record<string, ListeningPlayState>>({});
  const [submittedTaskIds, setSubmittedTaskIds] = useState<Record<string, boolean>>({});
  const [sectionSummary, setSectionSummary] = useState<SectionSummary | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);

  const activeSkill = sectionOrder[activeSectionIndex];
  const sectionTasks = tasksBySkill[activeSkill] ?? [];
  const activeDeadline = sectionDeadlines[activeSkill] ?? null;

  useEffect(() => {
    if (!sessionId) return;
    const sid = sessionId;

    let cancelled = false;

    async function hydrateSession() {
      const response = await fetch(`/api/session/${sessionId}/result`);
      const payload = await response.json();
      if (!payload.ok || cancelled) return;

      const data = payload.data as {
        strictness?: ExamStrictness;
        sectionDeadlines?: Partial<Record<(typeof sectionOrder)[number], string>>;
        currentSection?: (typeof sectionOrder)[number] | null;
        isFinished?: boolean;
        passAll?: boolean;
        totalScore?: number;
        failReasonsDetailed?: FinalResult["failReasonsDetailed"];
        remediationPlan?: FinalResult["remediationPlan"];
      };

      if (data.strictness) setStrictness(data.strictness);
      if (data.sectionDeadlines) setSectionDeadlines(data.sectionDeadlines);
      if (data.currentSection) {
        const nextIndex = sectionOrder.findIndex((skill) => skill === data.currentSection);
        if (nextIndex >= 0) setActiveSectionIndex(nextIndex);
      }

      if (data.isFinished) {
        setFinalResult({
          id: sid,
          passAll: data.passAll ?? false,
          totalScore: data.totalScore ?? 0,
          failReasonsDetailed: data.failReasonsDetailed ?? [],
          remediationPlan: data.remediationPlan ?? [],
        });
      }
    }

    void hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    setRemainingSec(toSeconds(activeDeadline, sectionMinutes[activeSkill]));
  }, [activeDeadline, activeSkill]);

  useEffect(() => {
    if (!sessionId || sectionSummary || finalResult) return;

    const handle = setInterval(() => {
      setRemainingSec(toSeconds(activeDeadline, sectionMinutes[activeSkill]));
    }, 1000);

    return () => clearInterval(handle);
  }, [activeDeadline, activeSkill, finalResult, sectionSummary, sessionId]);

  useEffect(() => {
    if (!sessionId || sectionSummary || finalResult || busy) return;
    if (remainingSec > 0) return;
    void autoSubmitSection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, finalResult, remainingSec, sectionSummary, sessionId]);

  const displayTimer = useMemo(() => {
    const min = Math.floor(remainingSec / 60)
      .toString()
      .padStart(2, "0");
    const sec = Math.floor(remainingSec % 60)
      .toString()
      .padStart(2, "0");
    return `${min}:${sec}`;
  }, [remainingSec]);

  function setAnswer(taskId: string, questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [`${taskId}::${questionId}`]: value }));
  }

  function audioForTask(task: ExamTask) {
    if (!task.audioRef) return null;
    if (task.audioRef.includes("a_2_limenis_audio.mp3")) return "/media/a_2_limenis_audio.mp3";
    return null;
  }

  async function startExamSession(options?: { allowWhileBusy?: boolean }) {
    const allowWhileBusy = options?.allowWhileBusy ?? false;
    if (busy && !allowWhileBusy) return null;
    const toggledBusy = !busy;
    if (toggledBusy) setBusy(true);
    try {
      const response = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "EXAM",
          strictness,
        }),
      });

      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? "Could not create session");
      }

      const data = payload.data as {
        id: string;
        strictness: ExamStrictness;
        sectionDeadlines?: Partial<Record<(typeof sectionOrder)[number], string>>;
      };

      setSessionId(data.id);
      setStrictness(data.strictness);
      setSectionDeadlines(data.sectionDeadlines ?? {});
      setStatus(`${data.strictness} mode started. Follow section rules.`);
      router.replace(`/exam?sessionId=${data.id}`);
      return data.id;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start exam");
      return null;
    } finally {
      if (toggledBusy) {
        setBusy(false);
      }
    }
  }

  async function ensureSession() {
    if (sessionId) return sessionId;

    const nextId = await startExamSession({ allowWhileBusy: true });
    if (!nextId) {
      throw new Error("Session not initialized");
    }
    return nextId;
  }

  async function onListeningPlay(taskId: string, element: HTMLAudioElement) {
    try {
      const sid = await ensureSession();
      const response = await fetch(`/api/session/${sid}/listening-play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          playEventAt: new Date().toISOString(),
        }),
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? "Could not track replay");
      }

      const data = payload.data as {
        playsUsed: number;
        playsRemaining: number;
        locked: boolean;
      };

      setPlayState((prev) => ({
        ...prev,
        [taskId]: {
          playsUsed: data.playsUsed,
          playsRemaining:
            Number.isFinite(data.playsRemaining) && data.playsRemaining >= 0
              ? data.playsRemaining
              : 999,
          locked: data.locked,
        },
      }));

      if (data.locked) {
        element.pause();
        element.currentTime = 0;
        setStatus("Listening replay limit reached for this task.");
      } else if (strictness === "PRACTICE" && data.playsUsed > 2) {
        setStatus("Practice mode warning: replay count is above official 2-play limit.");
      }
    } catch (error) {
      element.pause();
      element.currentTime = 0;
      setStatus(error instanceof Error ? error.message : "Replay tracking failed");
    }
  }

  async function submitCurrentSection() {
    if (busy || sectionSummary || finalResult) return;
    setBusy(true);
    try {
      const sid = await ensureSession();
      const submitted: Record<string, boolean> = { ...submittedTaskIds };

      for (const task of sectionTasks) {
        const payload: Record<string, string> = {};
        for (const question of task.questions) {
          const questionId = String(question.id);
          payload[questionId] = answers[`${task.id}::${questionId}`] ?? "";

          if (Array.isArray(question.statements)) {
            const statements = question.statements as Array<Record<string, unknown>>;
            for (const statement of statements) {
              const rowId = String(statement.id);
              payload[rowId] = answers[`${task.id}::${rowId}`] ?? "";
              payload[`evidence::${rowId}`] = answers[`${task.id}::evidence::${rowId}`] ?? "";
            }
          }

          if (Array.isArray(question.situations)) {
            const situations = question.situations as Array<Record<string, unknown>>;
            for (const situation of situations) {
              const rowId = String(situation.id);
              payload[rowId] = answers[`${task.id}::${rowId}`] ?? "";
              payload[`evidence::${rowId}`] = answers[`${task.id}::evidence::${rowId}`] ?? "";
            }
          }
        }

        const answerResponse = await fetch(`/api/session/${sid}/answer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id, answers: payload, source: "EXAM" }),
        });
        const answerPayload = await answerResponse.json();
        if (!answerPayload.ok) {
          throw new Error(answerPayload.code ?? answerPayload.error ?? "Answer submission failed");
        }

        submitted[task.id] = true;
      }

      setSubmittedTaskIds(submitted);

      const sectionResponse = await fetch(`/api/session/${sid}/submit-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skill: activeSkill }),
      });
      const sectionPayload = await sectionResponse.json();
      if (!sectionPayload.ok) {
        throw new Error(sectionPayload.code ?? sectionPayload.error ?? "Section submission failed");
      }

      setSectionSummary(sectionPayload.data as SectionSummary);
      setStatus(`${activeSkill} completed. Review remediation and continue.`);

      if (activeSectionIndex + 1 >= sectionOrder.length) {
        const finishRes = await fetch(`/api/session/${sid}/finish`, { method: "POST" });
        const finishPayload = await finishRes.json();
        if (!finishPayload.ok) throw new Error(finishPayload.error ?? "Could not finish exam");

        const resultRes = await fetch(`/api/session/${sid}/result`);
        const resultPayload = await resultRes.json();
        if (!resultPayload.ok) throw new Error(resultPayload.error ?? "Could not load final result");

        const data = resultPayload.data as FinalResult;
        setFinalResult(data);
        setStatus(`Exam finished: ${data.passAll ? "PASSED" : "NOT PASSED"}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  async function autoSubmitSection() {
    if (busy || sectionSummary || finalResult) return;
    setStatus(`Time is up for ${activeSkill}. Auto-submitting...`);
    await submitCurrentSection();
  }

  function continueToNextSection() {
    if (activeSectionIndex + 1 >= sectionOrder.length) return;
    setActiveSectionIndex((prev) => prev + 1);
    setAnswers({});
    setPlayState({});
    setSubmittedTaskIds({});
    setSectionSummary(null);
  }

  function transcriptVisible(taskId: string) {
    if (strictness === "OFFICIAL") {
      return Boolean(sectionSummary);
    }
    return Boolean(submittedTaskIds[taskId]);
  }

  if (!sessionId) {
    return (
      <section className="grid">
        <header className="pageHeader">
          <h2>Exam Simulator</h2>
          <p>Select mode and run a full four-section simulation.</p>
        </header>

        <div className="panel" style={{ padding: "1rem" }}>
          <h3>Simulation Mode</h3>
          <div className="grid two" style={{ marginTop: "0.7rem" }}>
            <button
              type="button"
              className={strictness === "OFFICIAL" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setStrictness("OFFICIAL")}
            >
              Official Simulation
            </button>
            <button
              type="button"
              className={strictness === "PRACTICE" ? "primaryBtn" : "secondaryBtn"}
              onClick={() => setStrictness("PRACTICE")}
            >
              Practice Simulation
            </button>
          </div>

          <div className="timerRibbon" style={{ marginTop: "0.8rem" }}>
            {strictness === "OFFICIAL"
              ? "OFFICIAL rules: server lock by deadline, listening replay max 2, transcripts after section submit."
              : "PRACTICE rules: server timer still active, guided remediation enabled, transcript after task submission."}
          </div>

          <div className="ctaRow" style={{ marginTop: "0.8rem" }}>
            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                void startExamSession();
              }}
              disabled={busy}
            >
              {busy ? "Preparing..." : "Start Simulation"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>Exam Simulator</h2>
        <p>Server-enforced timing and section lock rules with remediation outputs.</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <div className="grid two">
          <div>
            <p className="badge">Current section</p>
            <h3>{activeSkill}</h3>
          </div>
          <div>
            <p className="badge">Server countdown</p>
            <h3>{displayTimer}</h3>
          </div>
        </div>
        <p className="badge" style={{ marginTop: "0.65rem" }}>
          {strictness} mode
        </p>
        <div className="timerRibbon">{status}</div>
      </div>

      {sectionTasks.map((task) => (
        <div className="panel" style={{ padding: "1rem" }} key={task.id}>
          <p className="badge">
            {task.taskType.toLowerCase()} · {task.points} pts
          </p>
          <h3 style={{ marginTop: "0.6rem" }}>{task.promptLv}</h3>
          {activeSkill === "LISTENING" && audioForTask(task) ? (
            <div style={{ marginTop: "0.7rem" }}>
              <p className="badge">Audio replay policy</p>
              <audio
                controls
                src={audioForTask(task) ?? undefined}
                onPlay={(event) => {
                  void onListeningPlay(task.id, event.currentTarget);
                }}
                style={{ width: "100%", marginTop: "0.45rem" }}
              />
              <small style={{ color: "var(--ink-soft)" }}>
                Plays used: {playState[task.id]?.playsUsed ?? 0}
                {strictness === "OFFICIAL"
                  ? `/${2} · remaining ${Math.max(0, playState[task.id]?.playsRemaining ?? 2)}`
                  : " · practice mode allows extra plays"}
              </small>
            </div>
          ) : null}

          <div className="grid" style={{ marginTop: "0.8rem" }}>
            {task.questions.map((question, idx) => {
              const qid = String(question.id ?? `q${idx + 1}`);
              const texts = Array.isArray(question.texts) ? (question.texts as Array<Record<string, unknown>>) : [];
              const ads = Array.isArray(question.ads) ? (question.ads as Array<Record<string, unknown>>) : [];
              const evidenceChoices =
                texts.length > 0
                  ? texts.map((text) => String(text.id))
                  : ads.length > 0
                    ? ads.map((ad) => String(ad.id))
                    : [];
              const imageSrc =
                typeof question.imageUrl === "string"
                  ? question.imageUrl
                  : typeof question.imageHint === "string" && question.imageHint.toLowerCase().includes("park")
                    ? "/images/speaking-q1.svg"
                    : typeof question.imageHint === "string" && question.imageHint.toLowerCase().includes("kafejn")
                      ? "/images/speaking-q2.svg"
                      : qid === "q1"
                        ? "/images/writing-q1.svg"
                        : qid === "q2"
                          ? "/images/writing-q2.svg"
                          : qid === "q3"
                            ? "/images/writing-q3.svg"
                            : qid === "q4"
                              ? "/images/writing-q4.svg"
                              : null;

              if (Array.isArray(question.statements)) {
                const statements = question.statements as Array<Record<string, unknown>>;
                return (
                  <div key={qid} className="card">
                    <h4>Statements</h4>
                    {texts.length > 0 ? (
                      <div className="sourceBlock">
                        <p className="sourceTitle">Read these texts first:</p>
                        {texts.map((text) => (
                          <div className="sourceItem" key={String(text.id)}>
                            <strong>{String(text.id)}.</strong> {String(text.contentLv ?? "")}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {statements.map((statement) => {
                      const rowId = String(statement.id);
                      return (
                        <div key={rowId} style={{ marginBottom: "0.55rem" }}>
                          <label htmlFor={`${task.id}-${rowId}`}>{String(statement.textLv ?? rowId)}</label>
                          <input
                            id={`${task.id}-${rowId}`}
                            value={answers[`${task.id}::${rowId}`] ?? ""}
                            onChange={(event) => setAnswer(task.id, rowId, event.target.value)}
                            placeholder="A / B / C"
                          />
                          {evidenceChoices.length > 0 ? (
                            <>
                              <label htmlFor={`${task.id}-evidence-${rowId}`}>Evidence source</label>
                              <select
                                id={`${task.id}-evidence-${rowId}`}
                                value={answers[`${task.id}::evidence::${rowId}`] ?? ""}
                                onChange={(event) =>
                                  setAnswer(task.id, `evidence::${rowId}`, event.target.value)
                                }
                              >
                                <option value="">Select source</option>
                                {evidenceChoices.map((choice) => (
                                  <option key={choice} value={choice}>
                                    {choice}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              if (Array.isArray(question.situations)) {
                const situations = question.situations as Array<Record<string, unknown>>;
                return (
                  <div key={qid} className="card">
                    <h4>Situations</h4>
                    {ads.length > 0 ? (
                      <div className="sourceBlock">
                        <p className="sourceTitle">Available ads:</p>
                        {ads.map((ad) => (
                          <div className="sourceItem" key={String(ad.id)}>
                            <strong>{String(ad.id)}.</strong> {String(ad.textLv ?? "")}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {situations.map((situation) => {
                      const rowId = String(situation.id);
                      return (
                        <div key={rowId} style={{ marginBottom: "0.55rem" }}>
                          <label htmlFor={`${task.id}-${rowId}`}>{String(situation.textLv ?? rowId)}</label>
                          <input
                            id={`${task.id}-${rowId}`}
                            value={answers[`${task.id}::${rowId}`] ?? ""}
                            onChange={(event) => setAnswer(task.id, rowId, event.target.value)}
                            placeholder="A / B / C"
                          />
                          {evidenceChoices.length > 0 ? (
                            <>
                              <label htmlFor={`${task.id}-evidence-${rowId}`}>Evidence source</label>
                              <select
                                id={`${task.id}-evidence-${rowId}`}
                                value={answers[`${task.id}::evidence::${rowId}`] ?? ""}
                                onChange={(event) =>
                                  setAnswer(task.id, `evidence::${rowId}`, event.target.value)
                                }
                              >
                                <option value="">Select source</option>
                                {evidenceChoices.map((choice) => (
                                  <option key={choice} value={choice}>
                                    {choice}
                                  </option>
                                ))}
                              </select>
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const options = Array.isArray(question.options) ? (question.options as string[]) : [];
              return (
                <div className="card" key={qid}>
                  {imageSrc ? (
                    <figure className="taskImageWrap">
                      <img
                        src={imageSrc}
                        alt={typeof question.imageHint === "string" ? question.imageHint : `Task image ${qid}`}
                        className="taskImage"
                      />
                      {typeof question.imageHint === "string" ? <figcaption>{question.imageHint}</figcaption> : null}
                    </figure>
                  ) : null}
                  <label htmlFor={`${task.id}-${qid}`}>{String(question.stemLv ?? `Question ${idx + 1}`)}</label>
                  {options.length > 0 ? (
                    <select
                      id={`${task.id}-${qid}`}
                      value={answers[`${task.id}::${qid}`] ?? ""}
                      onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                    >
                      <option value="">Select</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`${task.id}-${qid}`}
                      value={answers[`${task.id}::${qid}`] ?? ""}
                      onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                      placeholder="Type answer"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {task.transcript && transcriptVisible(task.id) ? (
            <details style={{ marginTop: "0.7rem" }}>
              <summary>Transcript</summary>
              <p>{task.transcript}</p>
            </details>
          ) : null}
        </div>
      ))}

      {sectionSummary ? (
        <div className="panel" style={{ padding: "1rem" }}>
          <h3>Section Diagnostic</h3>
          <p>
            {sectionSummary.sectionResult.skill}: {sectionSummary.sectionResult.score}/
            {sectionSummary.sectionResult.maxScore} · {sectionSummary.sectionResult.passed ? "PASS" : "FAIL"}
            {sectionSummary.sectionResult.status === "EXPIRED" ? " · expired" : ""}
          </p>

          <div className="grid two" style={{ marginTop: "0.7rem" }}>
            <div>
              <p className="badge">Weak task types</p>
              <p>{sectionSummary.weakTaskTypes.length > 0 ? sectionSummary.weakTaskTypes.join(", ") : "None flagged"}</p>
            </div>
            <div>
              <p className="badge">Weak topics</p>
              <p>{sectionSummary.weakTopics.length > 0 ? sectionSummary.weakTopics.join(", ") : "None flagged"}</p>
            </div>
          </div>

          <div style={{ marginTop: "0.8rem" }}>
            <p className="badge">Practice this now</p>
            <div className="ctaRow" style={{ marginTop: "0.4rem", flexWrap: "wrap" }}>
              {sectionSummary.recommendedTaskIds.map((taskId) => (
                <Link
                  key={taskId}
                  className="secondaryBtn buttonLike"
                  href={`/trainer/${activeSkill.toLowerCase()}?taskId=${taskId}`}
                >
                  {taskId}
                </Link>
              ))}
            </div>
          </div>

          {activeSectionIndex + 1 < sectionOrder.length ? (
            <div className="ctaRow" style={{ marginTop: "0.9rem" }}>
              <button className="primaryBtn" type="button" onClick={continueToNextSection}>
                Continue to {sectionOrder[activeSectionIndex + 1]}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="ctaRow">
          <button className="primaryBtn" type="button" onClick={submitCurrentSection} disabled={busy}>
            {busy ? "Submitting..." : `Submit ${activeSkill}`}
          </button>
        </div>
      )}

      {finalResult ? (
        <div className="panel" style={{ padding: "1rem" }}>
          <h3>Final Exam Result</h3>
          <p>
            {finalResult.passAll ? "PASS" : "FAIL"} · total score {finalResult.totalScore ?? 0}
          </p>

          <div className="grid" style={{ marginTop: "0.8rem" }}>
            <article className="card">
              <h4>Why this failed</h4>
              {finalResult.failReasonsDetailed.length === 0 ? (
                <p>All section criteria met.</p>
              ) : (
                <ul>
                  {finalResult.failReasonsDetailed.map((item) => (
                    <li key={item.skill}>
                      {item.skill}: {item.actualScore}/{item.requiredScore} required, shortfall {item.shortfall}. {item.explanation}
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="card">
              <h4>What to do next</h4>
              {finalResult.remediationPlan.map((plan) => (
                <div key={plan.skill} style={{ marginBottom: "0.8rem" }}>
                  <p className="badge">{plan.skill}</p>
                  <p>
                    Weak types: {plan.weakTaskTypes.length > 0 ? plan.weakTaskTypes.join(", ") : "None"}
                    <br />
                    Weak topics: {plan.weakTopics.length > 0 ? plan.weakTopics.join(", ") : "None"}
                  </p>
                  <div className="ctaRow" style={{ flexWrap: "wrap" }}>
                    {plan.recommendedTaskIds.slice(0, 3).map((taskId) => (
                      <Link
                        key={`${plan.skill}-${taskId}`}
                        className="secondaryBtn buttonLike"
                        href={`/trainer/${plan.skill.toLowerCase()}?taskId=${taskId}`}
                      >
                        {taskId}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </article>
          </div>

          <div className="ctaRow" style={{ marginTop: "0.7rem" }}>
            <Link className="primaryBtn buttonLike" href="/analytics">
              Open Analytics
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
