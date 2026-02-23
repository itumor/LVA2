"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type Question = Record<string, unknown>;

type TrainerTask = {
  id: string;
  skill: string;
  taskType: string;
  topic: string;
  promptLv: string;
  promptEn: string;
  audioRef?: string | null;
  transcript?: string | null;
  points: number;
  questions: Question[];
};

type SubmitResult = {
  score: number;
  maxScore: number;
  autoGraded: boolean;
};

function imageFromQuestion(question: Question, questionId: string) {
  const explicit = typeof question.imageUrl === "string" ? question.imageUrl : null;
  if (explicit) return explicit;
  const hint = typeof question.imageHint === "string" ? question.imageHint.toLowerCase() : "";

  if (hint.includes("park")) return "/images/speaking-q1.svg";
  if (hint.includes("kafejn")) return "/images/speaking-q2.svg";

  const fallbackMap: Record<string, string> = {
    q1: "/images/writing-q1.svg",
    q2: "/images/writing-q2.svg",
    q3: "/images/writing-q3.svg",
    q4: "/images/writing-q4.svg",
  };

  return fallbackMap[questionId] ?? null;
}

export function TrainerWorkspace({
  title,
  description,
  tasks,
}: {
  title: string;
  description: string;
  tasks: TrainerTask[];
}) {
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get("taskId");
  const [taskIndex, setTaskIndex] = useState(() => {
    if (requestedTaskId) {
      const requestedIndex = tasks.findIndex((task) => task.id === requestedTaskId);
      if (requestedIndex >= 0) return requestedIndex;
    }

    const textIndex = tasks.findIndex((task) =>
      task.questions.some((question) => Array.isArray(question.texts)),
    );
    if (textIndex >= 0) return textIndex;

    const adsIndex = tasks.findIndex((task) =>
      task.questions.some((question) => Array.isArray(question.ads)),
    );
    if (adsIndex >= 0) return adsIndex;

    const imageIndex = tasks.findIndex((task) =>
      task.questions.some(
        (question) =>
          typeof question.imageHint === "string" || typeof question.imageUrl === "string",
      ),
    );
    if (imageIndex >= 0) return imageIndex;

    const contextualIndex = tasks.findIndex((task) =>
      task.questions.some(
        (question) =>
          Array.isArray(question.texts) ||
          Array.isArray(question.ads) ||
          typeof question.imageHint === "string" ||
          typeof question.imageUrl === "string",
      ),
    );

    return contextualIndex >= 0 ? contextualIndex : 0;
  });
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | string[]>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [playCount, setPlayCount] = useState(0);

  const task = tasks[taskIndex];

  const audioSrc = useMemo(() => {
    if (!task?.audioRef) return null;
    if (task.audioRef.includes("a_2_limenis_audio.mp3")) return "/media/a_2_limenis_audio.mp3";
    return null;
  }, [task?.audioRef]);

  if (!task) {
    return (
      <section className="panel" style={{ padding: "1rem" }}>
        <h2>{title}</h2>
        <p>No tasks found for this trainer yet.</p>
      </section>
    );
  }

  function changeAnswer(key: string, value: string | number | boolean | string[]) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function ensureSession() {
    if (sessionId) return sessionId;

    const response = await fetch("/api/session/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "TRAINING" }),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error ?? "Session start failed");
    setSessionId(payload.data.id);
    return payload.data.id as string;
  }

  async function onSubmit() {
    setSubmitting(true);
    try {
      const activeSessionId = await ensureSession();
      const response = await fetch(`/api/session/${activeSessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          answers,
          source: "TRAINER",
        }),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? "Submit failed");
      setResult(payload.data);
    } finally {
      setSubmitting(false);
    }
  }

  const questionNodes = task.questions.map((question, idx) => {
    const questionId = String(question.id ?? `q${idx + 1}`);
    const options = Array.isArray(question.options) ? (question.options as string[]) : null;
    const hasBooleanAnswer = typeof question.correctAnswer === "boolean";
    const texts = Array.isArray(question.texts) ? (question.texts as Array<Record<string, unknown>>) : [];
    const ads = Array.isArray(question.ads) ? (question.ads as Array<Record<string, unknown>>) : [];
    const imageSrc = imageFromQuestion(question, questionId);
    const imageHint = typeof question.imageHint === "string" ? question.imageHint : null;

    if (Array.isArray(question.statements)) {
      const statements = question.statements as Array<Record<string, unknown>>;
      return (
        <div key={questionId} className="card">
          <h4>Matching statements</h4>
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
            const id = String(statement.id);
            return (
              <div key={id} style={{ marginBottom: "0.55rem" }}>
                <label htmlFor={`${questionId}-${id}`}>{String(statement.textLv ?? "")}</label>
                <input
                  id={`${questionId}-${id}`}
                  value={String(answers[id] ?? "")}
                  placeholder="A / B / C"
                  onChange={(event) => changeAnswer(id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      );
    }

    if (Array.isArray(question.situations)) {
      const situations = question.situations as Array<Record<string, unknown>>;
      return (
        <div key={questionId} className="card">
          <h4>Match situations</h4>
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
            const id = String(situation.id);
            return (
              <div key={id} style={{ marginBottom: "0.55rem" }}>
                <label htmlFor={`${questionId}-${id}`}>{String(situation.textLv ?? "")}</label>
                <input
                  id={`${questionId}-${id}`}
                  value={String(answers[id] ?? "")}
                  placeholder="A / B / C"
                  onChange={(event) => changeAnswer(id, event.target.value)}
                />
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div key={questionId} className="card">
        {imageSrc ? (
          <figure className="taskImageWrap">
            <img src={imageSrc} alt={imageHint ?? `Prompt image ${questionId}`} className="taskImage" />
            {imageHint ? <figcaption>{imageHint}</figcaption> : null}
          </figure>
        ) : null}
        <label htmlFor={questionId}>{String(question.stemLv ?? question.promptLv ?? `Question ${idx + 1}`)}</label>
        {options ? (
          <select id={questionId} value={String(answers[questionId] ?? "")} onChange={(event) => changeAnswer(questionId, event.target.value)}>
            <option value="">Select</option>
            {options.map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        ) : hasBooleanAnswer ? (
          <select id={questionId} value={String(answers[questionId] ?? "")} onChange={(event) => changeAnswer(questionId, event.target.value === "true")}>
            <option value="">Select</option>
            <option value="true">True / Patiesi</option>
            <option value="false">False / Nepatiesi</option>
          </select>
        ) : (
          <input
            id={questionId}
            value={String(answers[questionId] ?? "")}
            onChange={(event) => changeAnswer(questionId, event.target.value)}
            placeholder={typeof question.hint === "string" ? `Hint: ${question.hint}` : "Type answer"}
          />
        )}
      </div>
    );
  });

  return (
    <section className="grid" style={{ gap: "1rem" }}>
      <header className="pageHeader">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <label htmlFor="task-picker">Task</label>
        <select
          id="task-picker"
          value={task.id}
          onChange={(event) => {
            const nextIndex = tasks.findIndex((candidate) => candidate.id === event.target.value);
            setTaskIndex(nextIndex >= 0 ? nextIndex : 0);
            setAnswers({});
            setResult(null);
            setPlayCount(0);
          }}
        >
          {tasks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} · {item.taskType.toLowerCase()} · {item.topic}
            </option>
          ))}
        </select>

        <p style={{ marginTop: "0.8rem", color: "var(--ink-soft)" }}>
          {task.promptLv}
          <br />
          {task.promptEn}
        </p>

        {audioSrc ? (
          <div style={{ marginTop: "0.8rem" }}>
            <p className="badge">Replay rule: max 2 plays</p>
            <audio
              controls
              src={audioSrc}
              onPlay={() => setPlayCount((prev) => prev + 1)}
              style={{ width: "100%", marginTop: "0.5rem" }}
            />
            <small style={{ color: "var(--ink-soft)" }}>Plays used: {playCount}/2</small>
          </div>
        ) : null}
      </div>

      <div className="grid">{questionNodes}</div>

      {(task.taskType === "MESSAGE_ADVERT" || task.taskType === "PICTURE_SENTENCE" || task.taskType === "WORD_FORM") && (
        <div className="panel" style={{ padding: "1rem" }}>
          <h3>Guided rubric input</h3>
          <div className="grid two">
            <div>
              <label htmlFor="rubricChecks">Rubric checks passed</label>
              <input
                id="rubricChecks"
                type="number"
                min={0}
                max={6}
                value={String(answers.rubricChecks ?? "")}
                onChange={(event) => changeAnswer("rubricChecks", Number(event.target.value))}
              />
            </div>
            <div>
              <label htmlFor="wordCount">Word count</label>
              <input
                id="wordCount"
                type="number"
                min={0}
                value={String(answers.wordCount ?? "")}
                onChange={(event) => changeAnswer("wordCount", Number(event.target.value))}
              />
            </div>
          </div>
          <div className="grid two" style={{ marginTop: "0.8rem" }}>
            <div>
              <label htmlFor="sentenceChecks">Sentence checks</label>
              <input
                id="sentenceChecks"
                type="number"
                min={0}
                max={4}
                value={String(answers.sentenceChecks ?? "")}
                onChange={(event) => changeAnswer("sentenceChecks", Number(event.target.value))}
              />
            </div>
            <div>
              <label htmlFor="correctForms">Correct forms</label>
              <input
                id="correctForms"
                type="number"
                min={0}
                max={5}
                value={String(answers.correctForms ?? "")}
                onChange={(event) => changeAnswer("correctForms", Number(event.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      <div className="ctaRow">
        <button className="primaryBtn" type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Answers"}
        </button>
      </div>

      {result ? (
        <div className="panel" style={{ padding: "1rem" }}>
          <h3>Result</h3>
          <p>
            Score: <strong>{result.score}</strong> / {result.maxScore}
          </p>
          <p>{result.autoGraded ? "Auto-graded" : "Rubric-guided score recorded"}</p>
          {task.transcript ? (
            <details>
              <summary>Transcript</summary>
              <p>{task.transcript}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
