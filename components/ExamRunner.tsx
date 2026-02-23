"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const sectionOrder = ["LISTENING", "READING", "WRITING", "SPEAKING"] as const;
const sectionMinutes: Record<(typeof sectionOrder)[number], number> = {
  LISTENING: 25,
  READING: 30,
  WRITING: 35,
  SPEAKING: 15,
};

const sectionTitlesLv: Record<(typeof sectionOrder)[number], string> = {
  LISTENING: "Klausīšanās prasmes pārbaudes uzdevumi",
  READING: "Lasītprasmes pārbaudes uzdevumi",
  WRITING: "Rakstītprasmes pārbaudes uzdevumi",
  SPEAKING: "Runātprasmes pārbaudes uzdevumi",
};

const sectionRulesLv: Record<(typeof sectionOrder)[number], string[]> = {
  LISTENING: [
    "Klausieties ierakstu uzmanīgi. Katrs paziņojums skanēs divas reizes.",
    "Pēc katra paziņojuma atzīmējiet pareizo atbildi.",
    "Strādājiet secīgi un neatstājiet jautājumus tukšus.",
  ],
  READING: [
    "Lasiet tekstus un sludinājumus uzmanīgi.",
    "Atzīmējiet tikai vienu atbilstošu variantu.",
    "Ja vajadzīgs, norādiet arī pierādījuma avotu.",
  ],
  WRITING: [
    "Aplūkojiet attēlus vai uzdevuma situāciju.",
    "Rakstiet skaidrus un gramatiski pareizus teikumus.",
    "Ziņojuma uzdevumā ievērojiet minimālo vārdu skaitu.",
  ],
  SPEAKING: [
    "Atbildiet pilnos, saprotamos teikumos.",
    "Aprakstiet attēlos redzamo un pamatot savas atbildes.",
    "Jautājumu uzdevumā precīzi noformulējiet jautājumus.",
  ],
};

const taskTypeTitlesLv: Record<string, string> = {
  MCQ: "Izvēlies pareizo atbildi",
  TRUE_FALSE: "Atzīmē apgalvojumus (Jā/Nē)",
  FILL_BLANK: "Ieraksti trūkstošo vārdu vai skaitli",
  MATCHING: "Savieno informāciju",
  CLOZE: "Izvēlies atbilstošo vārdu",
  PICTURE_SENTENCE: "Uzraksti teikumu par attēlu",
  WORD_FORM: "Ieraksti vārdu pareizā formā",
  MESSAGE_ADVERT: "Uzraksti ziņu pēc sludinājuma",
  INTERVIEW: "Atbildi uz jautājumiem",
  IMAGE_DESCRIPTION: "Apraksti attēlu",
  AD_QUESTION: "Uzdod jautājumu par sludinājumu",
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

function renderStemWithBlank(stem: string, input: ReactNode) {
  const parts = stem.split("____");
  if (parts.length === 1) {
    return (
      <span className="inlineBlankWrap">
        {stem}
        {input}
      </span>
    );
  }

  return (
    <span className="inlineBlankWrap">
      <span>{parts[0]}</span>
      {input}
      <span>{parts.slice(1).join("____")}</span>
    </span>
  );
}

function pageStamp(section: (typeof sectionOrder)[number], taskIndex: number) {
  const sectionOffset = sectionOrder.indexOf(section) * 3;
  return sectionOffset + taskIndex + 10;
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
  const [status, setStatus] = useState("Izvēlieties režīmu un sāciet pārbaudījumu.");
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

  function answerFor(taskId: string, questionId: string) {
    return answers[`${taskId}::${questionId}`] ?? "";
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
      setStatus(`${data.strictness} režīms sākts. Sekojiet uzdevuma nosacījumiem.`);
      router.replace(`/exam?sessionId=${data.id}`);
      return data.id;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Neizdevās sākt sesiju");
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
        setStatus("Klausīšanās atkārtojumu limits šim uzdevumam ir sasniegts.");
      } else if (strictness === "PRACTICE" && data.playsUsed > 2) {
        setStatus("Prakses režīms: atkārtojumu skaits pārsniedz oficiālo 2 reižu limitu.");
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
        const payload: Record<string, string | number | boolean> = {};
        for (const question of task.questions) {
          const questionId = String(question.id);
          payload[questionId] = answerFor(task.id, questionId);

          if (Array.isArray(question.statements)) {
            const statements = question.statements as Array<Record<string, unknown>>;
            for (const statement of statements) {
              const rowId = String(statement.id);
              payload[rowId] = answerFor(task.id, rowId);
              payload[`evidence::${rowId}`] = answerFor(task.id, `evidence::${rowId}`);
            }
          }

          if (Array.isArray(question.situations)) {
            const situations = question.situations as Array<Record<string, unknown>>;
            for (const situation of situations) {
              const rowId = String(situation.id);
              payload[rowId] = answerFor(task.id, rowId);
              payload[`evidence::${rowId}`] = answerFor(task.id, `evidence::${rowId}`);
            }
          }
        }

        if (["INTERVIEW", "IMAGE_DESCRIPTION", "AD_QUESTION", "MESSAGE_ADVERT"].includes(task.taskType)) {
          payload.rubricChecks = Number(answerFor(task.id, "rubricChecks") || 0);
        }

        if (task.taskType === "MESSAGE_ADVERT") {
          payload.wordCount = Number(answerFor(task.id, "wordCount") || 0);
        }

        if (task.taskType === "PICTURE_SENTENCE") {
          payload.sentenceChecks = Number(answerFor(task.id, "sentenceChecks") || 0);
        }

        if (task.taskType === "WORD_FORM") {
          payload.correctForms = Number(answerFor(task.id, "correctForms") || 0);
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
      setStatus(`${activeSkill} pabeigts. Apskati rezultātu un turpini.`);

      if (activeSectionIndex + 1 >= sectionOrder.length) {
        const finishRes = await fetch(`/api/session/${sid}/finish`, { method: "POST" });
        const finishPayload = await finishRes.json();
        if (!finishPayload.ok) throw new Error(finishPayload.error ?? "Could not finish exam");

        const resultRes = await fetch(`/api/session/${sid}/result`);
        const resultPayload = await resultRes.json();
        if (!resultPayload.ok) throw new Error(resultPayload.error ?? "Could not load final result");

        const data = resultPayload.data as FinalResult;
        setFinalResult(data);
        setStatus(`Pārbaudījums pabeigts: ${data.passAll ? "NOKĀRTOTS" : "NENOKĀRTOTS"}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  async function autoSubmitSection() {
    if (busy || sectionSummary || finalResult) return;
    setStatus(`Laiks ${activeSkill} daļai beidzies. Notiek automātiska iesniegšana...`);
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

  function renderTaskBody(task: ExamTask) {
    if (task.taskType === "MCQ") {
      return (
        <ol className="questionGroup">
          {task.questions.map((question, idx) => {
            const qid = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? `Jautājums ${idx + 1}`);
            const options = Array.isArray(question.options)
              ? question.options.map((option) => String(option))
              : [];

            return (
              <li key={qid} className="questionItem">
                <p className="questionStem">
                  {idx + 1}. {stem}
                </p>
                <div className="optionList">
                  {options.map((option) => (
                    <label key={option} className="optionRow" htmlFor={`${task.id}-${qid}-${option}`}>
                      <input
                        id={`${task.id}-${qid}-${option}`}
                        type="radio"
                        name={`${task.id}-${qid}`}
                        checked={answerFor(task.id, qid) === option}
                        onChange={() => setAnswer(task.id, qid, option)}
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
      );
    }

    if (task.taskType === "TRUE_FALSE") {
      return (
        <table className="trueFalseTable">
          <thead>
            <tr>
              <th>Apgalvojums</th>
              <th className="answerCell">Jā</th>
              <th className="answerCell">Nē</th>
            </tr>
          </thead>
          <tbody>
            {task.questions.map((question, idx) => {
              const qid = String(question.id ?? `q${idx + 1}`);
              const stem = String(question.stemLv ?? `Apgalvojums ${idx + 1}`);
              const selected = answerFor(task.id, qid);

              return (
                <tr key={qid}>
                  <td>
                    {idx + 1}. {stem}
                  </td>
                  <td className="answerCell">
                    <input
                      type="radio"
                      name={`${task.id}-${qid}`}
                      checked={selected === "true"}
                      onChange={() => setAnswer(task.id, qid, "true")}
                    />
                  </td>
                  <td className="answerCell">
                    <input
                      type="radio"
                      name={`${task.id}-${qid}`}
                      checked={selected === "false"}
                      onChange={() => setAnswer(task.id, qid, "false")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      );
    }

    if (task.taskType === "FILL_BLANK") {
      return (
        <ol className="blankList">
          {task.questions.map((question, idx) => {
            const qid = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? "");

            return (
              <li key={qid} className="matchRow">
                {renderStemWithBlank(
                  `${idx + 1}. ${stem}`,
                  <input
                    id={`${task.id}-${qid}`}
                    className="blankInput"
                    value={answerFor(task.id, qid)}
                    onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                    placeholder="..."
                  />,
                )}
              </li>
            );
          })}
        </ol>
      );
    }

    if (task.taskType === "MATCHING") {
      return (
        <div className="questionGroup">
          {task.questions.map((question, questionIndex) => {
            const qid = String(question.id ?? `q${questionIndex + 1}`);
            const texts = Array.isArray(question.texts)
              ? (question.texts as Array<Record<string, unknown>>)
              : [];
            const ads = Array.isArray(question.ads)
              ? (question.ads as Array<Record<string, unknown>>)
              : [];
            const statements = Array.isArray(question.statements)
              ? (question.statements as Array<Record<string, unknown>>)
              : [];
            const situations = Array.isArray(question.situations)
              ? (question.situations as Array<Record<string, unknown>>)
              : [];
            const rows = statements.length > 0 ? statements : situations;
            const evidenceChoices =
              texts.length > 0
                ? texts.map((text) => String(text.id))
                : ads.length > 0
                  ? ads.map((ad) => String(ad.id))
                  : [];

            return (
              <div key={qid}>
                {texts.length > 0 ? (
                  <>
                    <p className="questionStem">Teksti:</p>
                    <div className="matchGrid">
                      {texts.map((text) => (
                        <article key={String(text.id)} className="matchCard">
                          <strong>{String(text.id)}</strong>
                          <p>{String(text.contentLv ?? "")}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}

                {ads.length > 0 ? (
                  <>
                    <p className="questionStem">Sludinājumi:</p>
                    <div className="matchGrid">
                      {ads.map((ad) => (
                        <article key={String(ad.id)} className="matchCard">
                          <strong>{String(ad.id)}</strong>
                          <p>{String(ad.textLv ?? "")}</p>
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}

                <ol className="matchList">
                  {rows.map((row, rowIndex) => {
                    const rowId = String(row.id);
                    const rowText = String(row.textLv ?? rowId);
                    return (
                      <li key={rowId} className="matchRow">
                        <span>{rowIndex + 1}. {rowText}</span>
                        <input
                          value={answerFor(task.id, rowId)}
                          onChange={(event) => setAnswer(task.id, rowId, event.target.value.toUpperCase())}
                          placeholder="A"
                        />
                        {evidenceChoices.length > 0 ? (
                          <select
                            value={answerFor(task.id, `evidence::${rowId}`)}
                            onChange={(event) =>
                              setAnswer(task.id, `evidence::${rowId}`, event.target.value)
                            }
                          >
                            <option value="">Pierādījums</option>
                            {evidenceChoices.map((choice) => (
                              <option value={choice} key={`${rowId}-${choice}`}>
                                {choice}
                              </option>
                            ))}
                          </select>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      );
    }

    if (task.taskType === "CLOZE") {
      return (
        <ol className="blankList">
          {task.questions.map((question, idx) => {
            const qid = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? "");
            const options = Array.isArray(question.options)
              ? question.options.map((option) => String(option))
              : [];

            return (
              <li key={qid} className="matchRow">
                <span>{idx + 1}. {stem}</span>
                <select
                  value={answerFor(task.id, qid)}
                  onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                >
                  <option value="">Izvēlies</option>
                  {options.map((option) => (
                    <option value={option} key={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </li>
            );
          })}
        </ol>
      );
    }

    if (task.taskType === "PICTURE_SENTENCE") {
      return (
        <div className="questionGroup">
          {task.questions.map((question, idx) => {
            const qid = String(question.id ?? `q${idx + 1}`);
            const imageUrl = typeof question.imageUrl === "string" ? question.imageUrl : null;
            const hint = String(question.imageHint ?? `Attēls ${idx + 1}`);
            const minWords = Number(question.minWords ?? 5);
            return (
              <article className="taskImageRow" key={qid}>
                <p className="questionStem">
                  {idx + 1}. Uzraksti teikumu ({minWords}+ vārdi) par attēlu.
                </p>
                {imageUrl ? (
                  <figure className="taskImageWrap">
                    <img src={imageUrl} alt={hint} className="taskImage" />
                    <figcaption>{hint}</figcaption>
                  </figure>
                ) : null}
                <textarea
                  className="linedAnswer"
                  value={answerFor(task.id, qid)}
                  onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                  placeholder="Raksti teikumu šeit..."
                />
              </article>
            );
          })}

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-sentenceChecks`}>Sentence checks (0-4)</label>
              <input
                id={`${task.id}-sentenceChecks`}
                type="number"
                min={0}
                max={4}
                value={answerFor(task.id, "sentenceChecks")}
                onChange={(event) => setAnswer(task.id, "sentenceChecks", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    if (task.taskType === "WORD_FORM") {
      return (
        <div className="questionGroup">
          <ol className="blankList">
            {task.questions.map((question, idx) => {
              const qid = String(question.id ?? `q${idx + 1}`);
              const stem = String(question.stemLv ?? `Jautājums ${idx + 1}`);
              return (
                <li key={qid} className="matchRow">
                  <span>
                    {idx + 1}. {stem}
                  </span>
                  <input
                    className="blankInput"
                    value={answerFor(task.id, qid)}
                    onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                    placeholder="vārds"
                  />
                </li>
              );
            })}
          </ol>

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-correctForms`}>Correct forms (0-5)</label>
              <input
                id={`${task.id}-correctForms`}
                type="number"
                min={0}
                max={5}
                value={answerFor(task.id, "correctForms")}
                onChange={(event) => setAnswer(task.id, "correctForms", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    if (task.taskType === "MESSAGE_ADVERT") {
      const firstQuestion = task.questions[0] ?? {};
      const bulletPoints = Array.isArray(firstQuestion.bulletPoints)
        ? firstQuestion.bulletPoints.map((point) => String(point))
        : [];
      const minWords = Number(firstQuestion.minWords ?? 35);
      const qid = String(firstQuestion.id ?? "q1");

      return (
        <div className="questionGroup">
          <div className="adPrompt">
            <p className="questionStem">Uzraksti ziņu, iekļaujot visus punktus:</p>
            <ul className="examRuleList">
              {bulletPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="questionStem">Minimālais apjoms: {minWords} vārdi.</p>
          </div>
          <textarea
            className="linedAnswer"
            value={answerFor(task.id, qid)}
            onChange={(event) => setAnswer(task.id, qid, event.target.value)}
            placeholder="Raksti ziņu šeit..."
          />

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-rubricChecks`}>Rubric checks</label>
              <input
                id={`${task.id}-rubricChecks`}
                type="number"
                min={0}
                max={6}
                value={answerFor(task.id, "rubricChecks")}
                onChange={(event) => setAnswer(task.id, "rubricChecks", event.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${task.id}-wordCount`}>Word count</label>
              <input
                id={`${task.id}-wordCount`}
                type="number"
                min={0}
                value={answerFor(task.id, "wordCount")}
                onChange={(event) => setAnswer(task.id, "wordCount", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    if (task.taskType === "INTERVIEW") {
      return (
        <div className="questionGroup">
          <ol className="blankList">
            {task.questions.map((question, idx) => {
              const qid = String(question.id ?? `q${idx + 1}`);
              const prompt = String(question.promptLv ?? question.stemLv ?? `Jautājums ${idx + 1}`);
              return (
                <li key={qid} className="questionItem">
                  <p className="questionStem">
                    {idx + 1}. {prompt}
                  </p>
                  <textarea
                    className="linedAnswer"
                    value={answerFor(task.id, qid)}
                    onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                    placeholder="Atbilde"
                  />
                </li>
              );
            })}
          </ol>

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-rubricChecks`}>Rubric checks</label>
              <input
                id={`${task.id}-rubricChecks`}
                type="number"
                min={0}
                max={5}
                value={answerFor(task.id, "rubricChecks")}
                onChange={(event) => setAnswer(task.id, "rubricChecks", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    if (task.taskType === "IMAGE_DESCRIPTION") {
      return (
        <div className="questionGroup">
          {task.questions.map((question, idx) => {
            const qid = String(question.id ?? `q${idx + 1}`);
            const imageUrl = typeof question.imageUrl === "string" ? question.imageUrl : null;
            const hint = String(question.imageHint ?? "attēls");
            const followUp = String(question.followUp ?? "");
            return (
              <article key={qid} className="taskImageRow">
                <p className="questionStem">
                  {idx + 1}. Aplūko attēlu un atbildi: KAS? KO DARA? KUR?
                </p>
                {imageUrl ? (
                  <figure className="taskImageWrap">
                    <img src={imageUrl} alt={hint} className="taskImage" />
                    <figcaption>{hint}</figcaption>
                  </figure>
                ) : null}
                {followUp ? <p>{followUp}</p> : null}
                <textarea
                  className="linedAnswer"
                  value={answerFor(task.id, qid)}
                  onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                  placeholder="Apraksts"
                />
              </article>
            );
          })}

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-rubricChecks`}>Rubric checks</label>
              <input
                id={`${task.id}-rubricChecks`}
                type="number"
                min={0}
                max={5}
                value={answerFor(task.id, "rubricChecks")}
                onChange={(event) => setAnswer(task.id, "rubricChecks", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    if (task.taskType === "AD_QUESTION") {
      return (
        <div className="questionGroup">
          <ol className="blankList">
            {task.questions.map((question, idx) => {
              const qid = String(question.id ?? `q${idx + 1}`);
              const adText = String(question.adText ?? "Sludinājums");
              const target = String(question.target ?? "informācija");
              return (
                <li key={qid} className="questionItem">
                  <div className="adPrompt">
                    <strong>{idx + 1}. {adText}</strong>
                    <p style={{ margin: "0.3rem 0 0" }}>Uzdod jautājumu par: {target}</p>
                  </div>
                  <input
                    value={answerFor(task.id, qid)}
                    onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                    placeholder="Uzdod jautājumu"
                    style={{ marginTop: "0.45rem" }}
                  />
                </li>
              );
            })}
          </ol>

          <div className="grid two">
            <div>
              <label htmlFor={`${task.id}-rubricChecks`}>Rubric checks</label>
              <input
                id={`${task.id}-rubricChecks`}
                type="number"
                min={0}
                max={5}
                value={answerFor(task.id, "rubricChecks")}
                onChange={(event) => setAnswer(task.id, "rubricChecks", event.target.value)}
              />
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="questionGroup">
        {task.questions.map((question, idx) => {
          const qid = String(question.id ?? `q${idx + 1}`);
          const stem = String(question.stemLv ?? `Jautājums ${idx + 1}`);
          return (
            <div key={qid} className="questionItem">
              <p className="questionStem">{stem}</p>
              <input
                value={answerFor(task.id, qid)}
                onChange={(event) => setAnswer(task.id, qid, event.target.value)}
                placeholder="Atbilde"
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (!sessionId) {
    return (
      <section className="examFlow">
        <article className="examCover">
          <div className="examMetaRow">
            <p className="examMetaTitle">Valsts valodas prasmes pārbaude</p>
            <span className="badge">A2 līmenis</span>
          </div>
          <h2 className="examHeading">Pārbaudes uzdevumu paraugi</h2>
          <p className="examSubheading">Klausīšanās, lasīšanas, rakstīšanas un runāšanas daļas</p>

          <ul className="examRuleList">
            <li>Oficiālajā režīmā darbojas servera laika ierobežojumi un sadaļu slēgšana.</li>
            <li>Klausīšanās daļā atskaņojumu limits: 2 reizes katram uzdevumam.</li>
            <li>Pēc sadaļas iesniegšanas redzēsi diagnostiku un ieteiktos treniņa uzdevumus.</li>
          </ul>

          <div className="chipRow" style={{ marginTop: "0.95rem" }}>
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

          <div className="timerRibbon">
            {strictness === "OFFICIAL"
              ? "OFFICIAL: stingrs taimeris, sadaļas lock pēc termiņa, klausīšanās atkārtojumi max 2."
              : "PRACTICE: servera taimeris saglabāts, atļauta elastīgāka klausīšanās un vadīti ieteikumi."}
          </div>

          <div className="ctaRow">
            <button
              className="primaryBtn"
              type="button"
              onClick={() => {
                void startExamSession();
              }}
              disabled={busy}
            >
              {busy ? "Preparing..." : "Sākt simulāciju"}
            </button>
          </div>

          <div className="paperFooter">
            <span>LVA2 Simulator</span>
            <span>VISC, 2026</span>
          </div>
        </article>
      </section>
    );
  }

  return (
    <section className="examFlow">
      <article className="examCover">
        <div className="examMetaRow">
          <p className="examMetaTitle">{sectionTitlesLv[activeSkill]}</p>
          <span className="badge">{strictness}</span>
        </div>
        <h2 className="examHeading">{activeSectionIndex + 1}. sadaļa</h2>
        <p className="examSubheading">Atlikušais laiks: {displayTimer}</p>

        <ul className="examRuleList">
          {sectionRulesLv[activeSkill].map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>

        <div className="timerRibbon">{status}</div>
        <div className="paperFooter">
          <span>{activeSkill}</span>
          <span>VISC, 2026</span>
        </div>
      </article>

      {sectionTasks.map((task, index) => (
        <article className="examSheet" key={task.id}>
          <header className="examTaskHeader">
            <p className="badge">{index + 1}. uzdevums</p>
            <h3 className="examTaskTitle">{task.promptLv}</h3>
            <p className="examTaskPrompt">
              {taskTypeTitlesLv[task.taskType] ?? task.taskType} · {task.points} punkti
            </p>
          </header>

          {activeSkill === "LISTENING" && audioForTask(task) ? (
            <div style={{ marginBottom: "0.85rem" }}>
              <audio
                controls
                src={audioForTask(task) ?? undefined}
                onPlay={(event) => {
                  void onListeningPlay(task.id, event.currentTarget);
                }}
                style={{ width: "100%" }}
              />
              <small style={{ color: "var(--ink-soft)" }}>
                Atskaņots: {playState[task.id]?.playsUsed ?? 0}
                {strictness === "OFFICIAL"
                  ? `/${2} · atlikušas ${Math.max(0, playState[task.id]?.playsRemaining ?? 2)}`
                  : " · prakses režīmā atļauti papildu atskaņojumi"}
              </small>
            </div>
          ) : null}

          {renderTaskBody(task)}

          {task.transcript && transcriptVisible(task.id) ? (
            <details style={{ marginTop: "0.9rem" }}>
              <summary>Transkripts</summary>
              <p>{task.transcript}</p>
            </details>
          ) : null}

          <div className="paperFooter">
            <span>{pageStamp(activeSkill, index)}</span>
            <span>VISC, 2026</span>
          </div>
        </article>
      ))}

      {sectionSummary ? (
        <article className="examSummary">
          <h3 style={{ marginTop: 0 }}>Sadaļas rezultāts</h3>
          <p>
            {sectionSummary.sectionResult.skill}: {sectionSummary.sectionResult.score}/
            {sectionSummary.sectionResult.maxScore} · {sectionSummary.sectionResult.passed ? "NOKĀRTOTS" : "NENOKĀRTOTS"}
            {sectionSummary.sectionResult.status === "EXPIRED" ? " · termiņš beidzies" : ""}
          </p>

          <div className="grid two" style={{ marginTop: "0.65rem" }}>
            <div>
              <p className="badge">Vājie uzdevumu tipi</p>
              <p>{sectionSummary.weakTaskTypes.length > 0 ? sectionSummary.weakTaskTypes.join(", ") : "Nav"}</p>
            </div>
            <div>
              <p className="badge">Vājās tēmas</p>
              <p>{sectionSummary.weakTopics.length > 0 ? sectionSummary.weakTopics.join(", ") : "Nav"}</p>
            </div>
          </div>

          <div style={{ marginTop: "0.75rem" }}>
            <p className="badge">Ieteiktie treniņi</p>
            <div className="ctaRow" style={{ marginTop: "0.35rem" }}>
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
            <div className="ctaRow" style={{ marginTop: "0.8rem" }}>
              <button className="primaryBtn" type="button" onClick={continueToNextSection}>
                Turpināt uz {sectionOrder[activeSectionIndex + 1]}
              </button>
            </div>
          ) : null}
        </article>
      ) : (
        <article className="examSummary">
          <h3 style={{ marginTop: 0 }}>Iesniegšana</h3>
          <p>Kad esi pabeidzis visus šīs sadaļas uzdevumus, iesniedz atbildes.</p>
          <div className="ctaRow">
            <button className="primaryBtn" type="button" onClick={submitCurrentSection} disabled={busy}>
              {busy ? "Submitting..." : `Iesniegt ${activeSkill}`}
            </button>
          </div>
        </article>
      )}

      {finalResult ? (
        <article className="examSummary">
          <h3 style={{ marginTop: 0 }}>Pārbaudījuma gala rezultāts</h3>
          <p>
            {finalResult.passAll ? "PASS" : "FAIL"} · kopējais punktu skaits {finalResult.totalScore ?? 0}
          </p>

          <div className="grid" style={{ marginTop: "0.75rem" }}>
            <article className="card">
              <h4>Kāpēc rezultāts ir šāds</h4>
              {finalResult.failReasonsDetailed.length === 0 ? (
                <p>Visi sadaļu kritēriji izpildīti.</p>
              ) : (
                <ul>
                  {finalResult.failReasonsDetailed.map((item) => (
                    <li key={item.skill}>
                      {item.skill}: {item.actualScore}/{item.requiredScore}, iztrūkums {item.shortfall}. {item.explanation}
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="card">
              <h4>Nākamie soļi</h4>
              {finalResult.remediationPlan.map((plan) => (
                <div key={plan.skill} style={{ marginBottom: "0.75rem" }}>
                  <p className="badge">{plan.skill}</p>
                  <p>
                    Vājie tipi: {plan.weakTaskTypes.length > 0 ? plan.weakTaskTypes.join(", ") : "Nav"}
                    <br />
                    Vājās tēmas: {plan.weakTopics.length > 0 ? plan.weakTopics.join(", ") : "Nav"}
                  </p>
                  <div className="ctaRow">
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

          <div className="ctaRow" style={{ marginTop: "0.65rem" }}>
            <Link className="primaryBtn buttonLike" href="/analytics">
              Open Analytics
            </Link>
          </div>
        </article>
      ) : null}
    </section>
  );
}
