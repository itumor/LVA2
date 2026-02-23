"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
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
  feedback?: {
    rawScore?: number;
    rawMax?: number;
    adaptiveEvaluation?: {
      method: "openai" | "heuristic";
      model?: string;
      score: number;
      maxScore: number;
      rubric: {
        taskCompletion: number;
        grammar: number;
        vocabulary: number;
        coherence: number;
        fluency?: number;
      };
      strengths: string[];
      improvements: string[];
      corrections: Array<{
        questionId: string;
        original: string;
        corrected: string;
        note: string;
      }>;
      overallFeedback: string;
      warnings?: string[];
    };
  };
};

type SpeechRecognitionLikeResult = {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
  };
};

type SpeechRecognitionLikeEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionLikeResult>;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionLikeEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
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

const fillBlankDistractorsByTaskId: Record<string, string[]> = {
  listen_short_dialog_fill_001: ["veikala", "autobusu", "54", "23.10"],
};

function imageFromQuestion(question: Question, questionId: string) {
  const explicit = typeof question.imageUrl === "string" ? question.imageUrl : null;
  if (explicit) {
    const legacyMap: Record<string, string> = {
      "/images/writing-q1.svg": "/images/writing-q1.jpg",
      "/images/writing-q2.svg": "/images/writing-q2.jpg",
      "/images/writing-q3.svg": "/images/writing-q3.jpg",
      "/images/writing-q4.svg": "/images/writing-q4.jpg",
      "/images/speaking-q1.svg": "/images/speaking-q1.jpg",
      "/images/speaking-q2.svg": "/images/speaking-q2.jpg",
    };
    return legacyMap[explicit] ?? explicit;
  }
  const hint = typeof question.imageHint === "string" ? question.imageHint.toLowerCase() : "";

  if (hint.includes("park")) return "/images/speaking-q1.jpg";
  if (hint.includes("kafejn")) return "/images/speaking-q2.jpg";

  const fallbackMap: Record<string, string> = {
    q1: "/images/writing-q1.jpg",
    q2: "/images/writing-q2.jpg",
    q3: "/images/writing-q3.jpg",
    q4: "/images/writing-q4.jpg",
  };

  return fallbackMap[questionId] ?? null;
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

    const fillBlankIndex = tasks.findIndex((task) => task.taskType === "FILL_BLANK");
    if (fillBlankIndex >= 0) return fillBlankIndex;

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

    return 0;
  });
  const [answers, setAnswers] = useState<Record<string, string | number | boolean | string[]>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [draggingWord, setDraggingWord] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [promptAudioSupported, setPromptAudioSupported] = useState(false);
  const [speechTargetQuestionId, setSpeechTargetQuestionId] = useState<string | null>(null);
  const [speakingQuestionId, setSpeakingQuestionId] = useState<string | null>(null);
  const [speechInterimText, setSpeechInterimText] = useState("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const promptUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const task = tasks[taskIndex];

  const audioSrc = useMemo(() => {
    if (!task?.audioRef) return null;
    if (task.audioRef.includes("a_2_limenis_audio.mp3")) return "/media/a_2_limenis_audio.mp3";
    return null;
  }, [task?.audioRef]);

  const fillBlankQuestionIds = useMemo(() => {
    if (task.taskType !== "FILL_BLANK") return [];
    return task.questions.map((question, idx) => String(question.id ?? `q${idx + 1}`));
  }, [task]);

  const fillBlankWordBank = useMemo(() => {
    if (task.taskType !== "FILL_BLANK") return [];

    const words: string[] = [];
    for (const question of task.questions) {
      if (Array.isArray(question.options)) {
        for (const option of question.options) {
          words.push(String(option));
        }
      }
      if (typeof question.correctAnswer === "string") {
        words.push(question.correctAnswer);
      }
    }

    for (const distractor of fillBlankDistractorsByTaskId[task.id] ?? []) {
      words.push(distractor);
    }

    return words.filter((word, index, arr) => word && arr.indexOf(word) === index);
  }, [task]);

  const isSpeechTask =
    task.taskType === "INTERVIEW" || task.taskType === "IMAGE_DESCRIPTION" || task.taskType === "AD_QUESTION";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    setSpeechSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    setPromptAudioSupported(
      Boolean(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === "function"),
    );
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.stop();
      if (typeof window !== "undefined") {
        window.speechSynthesis?.cancel();
      }
      promptUtteranceRef.current = null;
    };
  }, []);

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

  function answerFor(key: string) {
    return answers[key];
  }

  function assignFillBlankAnswer(questionId: string, value: string) {
    if (!value) return;
    setAnswers((prev) => {
      const next: Record<string, string | number | boolean | string[]> = { ...prev };
      for (const existingId of fillBlankQuestionIds) {
        if (existingId !== questionId && String(next[existingId] ?? "") === value) {
          next[existingId] = "";
        }
      }
      next[questionId] = value;
      return next;
    });
    setSelectedWord(null);
    setDraggingWord(null);
  }

  function clearFillBlankAnswer(questionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: "" }));
  }

  function appendSpeechText(questionId: string, transcript: string) {
    const cleanTranscript = transcript.trim();
    if (!cleanTranscript) return;

    setAnswers((prev) => {
      const currentValue = String(prev[questionId] ?? "").trim();
      const nextValue = currentValue ? `${currentValue} ${cleanTranscript}` : cleanTranscript;
      return { ...prev, [questionId]: nextValue };
    });
  }

  function stopSpeechRecognition() {
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    setSpeechTargetQuestionId(null);
    setSpeechInterimText("");
  }

  function stopPromptAudio(resetState = true) {
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    promptUtteranceRef.current = null;
    if (resetState) {
      setSpeakingQuestionId(null);
    }
  }

  function playPromptAudio(questionId: string, promptText: string) {
    const cleanPrompt = promptText.trim();
    if (!cleanPrompt || typeof window === "undefined") return;
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") return;

    stopSpeechRecognition();
    stopPromptAudio();

    const utterance = new window.SpeechSynthesisUtterance(cleanPrompt);
    utterance.lang = "lv-LV";
    utterance.rate = 0.95;
    utterance.onend = () => {
      if (promptUtteranceRef.current === utterance) {
        promptUtteranceRef.current = null;
      }
      setSpeakingQuestionId((current) => (current === questionId ? null : current));
    };
    utterance.onerror = () => {
      if (promptUtteranceRef.current === utterance) {
        promptUtteranceRef.current = null;
      }
      setSpeakingQuestionId((current) => (current === questionId ? null : current));
    };

    promptUtteranceRef.current = utterance;
    setSpeakingQuestionId(questionId);
    window.speechSynthesis.speak(utterance);
  }

  function startSpeechRecognition(questionId: string) {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const SpeechRecognitionConstructor =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionConstructor) {
      setSpeechError("Speech recognition is not available in this browser.");
      return;
    }

    stopPromptAudio();
    stopSpeechRecognition();
    setSpeechError(null);
    setSpeechInterimText("");
    setSpeechTargetQuestionId(questionId);

    const recognition = new SpeechRecognitionConstructor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "lv-LV";
    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let idx = event.resultIndex; idx < event.results.length; idx += 1) {
        const result = event.results[idx];
        const transcript = result[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) {
          finalTranscript += `${transcript} `;
        } else {
          interimTranscript += `${transcript} `;
        }
      }

      if (finalTranscript.trim()) {
        appendSpeechText(questionId, finalTranscript.trim());
      }
      setSpeechInterimText(interimTranscript.trim());
    };
    recognition.onerror = (event) => {
      setSpeechError(event.error ? `Speech recognition error: ${event.error}.` : "Speech recognition failed.");
      setSpeechTargetQuestionId(null);
      setSpeechInterimText("");
    };
    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      setSpeechTargetQuestionId((current) => (current === questionId ? null : current));
      setSpeechInterimText("");
    };

    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (error) {
      speechRecognitionRef.current = null;
      setSpeechTargetQuestionId(null);
      setSpeechInterimText("");
      setSpeechError(error instanceof Error ? error.message : "Unable to start speech recognition.");
    }
  }

  function renderSpeechControl(questionId: string) {
    if (!isSpeechTask) return null;

    const listening = speechTargetQuestionId === questionId;
    return (
      <div className="speechTools">
        <button
          type="button"
          className={listening ? "secondaryBtn" : "primaryBtn"}
          onClick={() => (listening ? stopSpeechRecognition() : startSpeechRecognition(questionId))}
          disabled={!speechSupported}
        >
          {listening ? "Stop mic" : "Speak answer"}
        </button>
        <p className="speechHint">
          {speechSupported
            ? listening
              ? "Listening... speak naturally, text will appear below."
              : "Use mic to convert your voice to text."
            : "Mic-to-text is unavailable in this browser. Please use Chrome or Edge."}
        </p>
        {listening && speechInterimText ? <p className="speechInterim">{speechInterimText}</p> : null}
      </div>
    );
  }

  function renderPromptAudioControl(questionId: string, promptText: string) {
    if (!isSpeechTask) return null;
    if (!promptText.trim()) return null;

    const speaking = speakingQuestionId === questionId;

    return (
      <button
        type="button"
        className={`${speaking ? "primaryBtn" : "secondaryBtn"} promptAudioBtn`}
        onClick={() => (speaking ? stopPromptAudio() : playPromptAudio(questionId, promptText))}
        disabled={!promptAudioSupported}
      >
        {speaking ? "Stop question audio" : "Play question"}
      </button>
    );
  }

  function onBlankDrop(questionId: string, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const droppedWord = event.dataTransfer.getData("text/plain");
    const value = droppedWord || draggingWord || selectedWord;
    if (value) {
      assignFillBlankAnswer(questionId, value);
    }
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

  function renderTaskBody() {
    if (task.taskType === "MCQ") {
      return (
        <ol className="questionGroup">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? `Jautājums ${idx + 1}`);
            const options = Array.isArray(question.options)
              ? question.options.map((option) => String(option))
              : [];

            return (
              <li key={questionId} className="questionItem">
                <p className="questionStem">
                  {idx + 1}. {stem}
                </p>
                <div className="optionList">
                  {options.map((option) => (
                    <label className="optionRow" htmlFor={`${questionId}-${option}`} key={option}>
                      <input
                        id={`${questionId}-${option}`}
                        type="radio"
                        name={questionId}
                        checked={String(answerFor(questionId) ?? "") === option}
                        onChange={() => changeAnswer(questionId, option)}
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
              const questionId = String(question.id ?? `q${idx + 1}`);
              const stem = String(question.stemLv ?? question.promptLv ?? `Apgalvojums ${idx + 1}`);
              const selected = String(answerFor(questionId) ?? "");
              return (
                <tr key={questionId}>
                  <td>
                    {idx + 1}. {stem}
                  </td>
                  <td className="answerCell">
                    <input
                      type="radio"
                      name={questionId}
                      checked={selected === "true"}
                      onChange={() => changeAnswer(questionId, "true")}
                    />
                  </td>
                  <td className="answerCell">
                    <input
                      type="radio"
                      name={questionId}
                      checked={selected === "false"}
                      onChange={() => changeAnswer(questionId, "false")}
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
      const activeWordsUsed = new Map<string, string>();
      for (const questionId of fillBlankQuestionIds) {
        const value = String(answerFor(questionId) ?? "");
        if (value) activeWordsUsed.set(value, questionId);
      }

      return (
        <div className="questionGroup">
          <ul className="examRuleList" style={{ marginTop: 0 }}>
            <li>Klausieties sarunas! Sarunas skanēs divas reizes.</li>
            <li>
              Ievelciet atbilstošo skaitli vai vārdu! <u>Četras atbildes ir liekas.</u>
            </li>
          </ul>

          <ol className="blankList">
            {task.questions.map((question, idx) => {
              const questionId = String(question.id ?? `q${idx + 1}`);
              const stem = String(question.stemLv ?? "");
              const value = String(answerFor(questionId) ?? "");
              return (
                <li key={questionId} className="matchRow">
                  {renderStemWithBlank(
                    `${idx + 1}. ${stem}`,
                    <button
                      type="button"
                      className={`blankDrop ${value ? "filled" : ""}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onBlankDrop(questionId, event)}
                      onClick={() => {
                        if (selectedWord) {
                          assignFillBlankAnswer(questionId, selectedWord);
                          return;
                        }
                        if (value) {
                          clearFillBlankAnswer(questionId);
                        }
                      }}
                    >
                      {value || "..."}
                    </button>,
                  )}
                </li>
              );
            })}
          </ol>

          {fillBlankWordBank.length > 0 ? (
            <>
              <div className="wordBankDivider" />
              <div className="chipRow wordBankWrap">
                {fillBlankWordBank.map((word) => {
                  const usedByQuestion = activeWordsUsed.get(word);
                  const isUsed = Boolean(usedByQuestion);
                  const isSelected = selectedWord === word;
                  return (
                    <button
                      key={word}
                      type="button"
                      draggable={!isUsed}
                      className={`answerChip dragWordChip ${isSelected ? "selected" : ""} ${isUsed ? "used" : ""}`}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", word);
                        setDraggingWord(word);
                      }}
                      onDragEnd={() => setDraggingWord(null)}
                      onClick={() => {
                        if (isUsed) return;
                        setSelectedWord((prev) => (prev === word ? null : word));
                      }}
                      disabled={isUsed}
                    >
                      {word}
                    </button>
                  );
                })}
              </div>
              <p className="fillBlankHint">
                Velc vārdu uz tukšo lauku, vai izvēlies vārdu un pēc tam klikšķini uz tukšās vietas.
              </p>
            </>
          ) : null}
        </div>
      );
    }

    if (task.taskType === "MATCHING") {
      return (
        <div className="questionGroup">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
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
              <div key={questionId}>
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
                    const selectedChoice = String(
                      answerFor(rowId) ?? answerFor(`evidence::${rowId}`) ?? "",
                    );
                    return (
                      <li key={rowId} className="matchRow">
                        <span>
                          {rowIndex + 1}. {String(row.textLv ?? rowId)}
                        </span>
                        <select
                          value={selectedChoice}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            changeAnswer(rowId, nextValue);
                            changeAnswer(`evidence::${rowId}`, nextValue);
                          }}
                          disabled={evidenceChoices.length === 0}
                        >
                          <option value="">
                            {evidenceChoices.length > 0 ? "Izvēlies" : "Nav izvēļu"}
                          </option>
                          {evidenceChoices.map((choice) => (
                            <option value={choice} key={`${rowId}-${choice}`}>
                              {choice}
                            </option>
                          ))}
                        </select>
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
            const questionId = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? `Teikums ${idx + 1}`);
            const options = Array.isArray(question.options)
              ? question.options.map((option) => String(option))
              : [];
            return (
              <li key={questionId} className="matchRow">
                <span>
                  {idx + 1}. {stem}
                </span>
                <select
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
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
            const questionId = String(question.id ?? `q${idx + 1}`);
            const imageSrc = imageFromQuestion(question, questionId);
            const imageHint = typeof question.imageHint === "string" ? question.imageHint : null;
            const minWords = Number(question.minWords ?? 5);

            return (
              <article key={questionId} className="taskImageRow">
                <p className="questionStem">
                  {idx + 1}. Uzraksti teikumu ({minWords}+ vārdi).
                </p>
                {imageSrc ? (
                  <figure className="taskImageWrap">
                    <img src={imageSrc} alt={imageHint ?? `Attēls ${questionId}`} className="taskImage" />
                    {imageHint ? <figcaption>{imageHint}</figcaption> : null}
                  </figure>
                ) : null}
                <textarea
                  className="linedAnswer"
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
                  placeholder="Raksti teikumu"
                />
              </article>
            );
          })}
        </div>
      );
    }

    if (task.taskType === "WORD_FORM") {
      return (
        <ol className="blankList">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
            const stem = String(question.stemLv ?? `Teikums ${idx + 1}`);
            return (
              <li key={questionId} className="matchRow">
                <span>
                  {idx + 1}. {stem}
                </span>
                <input
                  className="blankInput"
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
                  placeholder="forma"
                />
              </li>
            );
          })}
        </ol>
      );
    }

    if (task.taskType === "MESSAGE_ADVERT") {
      const firstQuestion = task.questions[0] ?? {};
      const bulletPoints = Array.isArray(firstQuestion.bulletPoints)
        ? firstQuestion.bulletPoints.map((point) => String(point))
        : [];
      const minWords = Number(firstQuestion.minWords ?? 35);
      const questionId = String(firstQuestion.id ?? "q1");

      return (
        <div className="questionGroup">
          <div className="adPrompt">
            <p className="questionStem">Uzraksti ziņu, iekļaujot punktus:</p>
            <ul className="examRuleList">
              {bulletPoints.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            <p className="questionStem">Minimālais apjoms: {minWords} vārdi.</p>
          </div>

          <textarea
            className="linedAnswer"
            value={String(answerFor(questionId) ?? "")}
            onChange={(event) => changeAnswer(questionId, event.target.value)}
            placeholder="Raksti ziņu"
          />
        </div>
      );
    }

    if (task.taskType === "INTERVIEW") {
      return (
        <ol className="blankList">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
            const prompt = String(question.promptLv ?? question.stemLv ?? `Jautājums ${idx + 1}`);
            return (
              <li key={questionId} className="questionItem">
                <div className="questionStemRow">
                  <p className="questionStem">
                    {idx + 1}. {prompt}
                  </p>
                  {renderPromptAudioControl(questionId, prompt)}
                </div>
                <textarea
                  className="linedAnswer"
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
                  placeholder="Atbilde"
                />
                {renderSpeechControl(questionId)}
              </li>
            );
          })}
        </ol>
      );
    }

    if (task.taskType === "IMAGE_DESCRIPTION") {
      return (
        <div className="questionGroup">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
            const imageSrc = imageFromQuestion(question, questionId);
            const imageHint = typeof question.imageHint === "string" ? question.imageHint : null;
            const followUp = typeof question.followUp === "string" ? question.followUp : null;
            const prompt = "Aplūko attēlu un atbildi: KAS? KO DARA? KUR?";
            const promptAudioText = followUp ? `${prompt} ${followUp}` : prompt;
            return (
              <article key={questionId} className="taskImageRow">
                <div className="questionStemRow">
                  <p className="questionStem">
                    {idx + 1}. {prompt}
                  </p>
                  {renderPromptAudioControl(questionId, promptAudioText)}
                </div>
                {imageSrc ? (
                  <figure className="taskImageWrap">
                    <img src={imageSrc} alt={imageHint ?? `Attēls ${questionId}`} className="taskImage" />
                    {imageHint ? <figcaption>{imageHint}</figcaption> : null}
                  </figure>
                ) : null}
                {followUp ? <p style={{ margin: 0 }}>{followUp}</p> : null}
                <textarea
                  className="linedAnswer"
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
                  placeholder="Apraksts"
                />
                {renderSpeechControl(questionId)}
              </article>
            );
          })}
        </div>
      );
    }

    if (task.taskType === "AD_QUESTION") {
      return (
        <ol className="blankList">
          {task.questions.map((question, idx) => {
            const questionId = String(question.id ?? `q${idx + 1}`);
            const adText = String(question.adText ?? "Sludinājums");
            const target = String(question.target ?? "informācija");
            return (
              <li key={questionId} className="questionItem">
                <div className="adPrompt">
                  <strong>{idx + 1}. {adText}</strong>
                  <p style={{ margin: "0.3rem 0 0" }}>Uzdod jautājumu par: {target}</p>
                  <div style={{ marginTop: "0.45rem" }}>
                    {renderPromptAudioControl(questionId, `${adText}. Uzdod jautājumu par: ${target}`)}
                  </div>
                </div>
                <input
                  style={{ marginTop: "0.4rem" }}
                  value={String(answerFor(questionId) ?? "")}
                  onChange={(event) => changeAnswer(questionId, event.target.value)}
                  placeholder="Uzdod jautājumu"
                />
                {renderSpeechControl(questionId)}
              </li>
            );
          })}
        </ol>
      );
    }

    return (
      <div className="questionGroup">
        {task.questions.map((question, idx) => {
          const questionId = String(question.id ?? `q${idx + 1}`);
          return (
            <div className="questionItem" key={questionId}>
              <p className="questionStem">{String(question.stemLv ?? `Jautājums ${idx + 1}`)}</p>
              <input
                value={String(answerFor(questionId) ?? "")}
                onChange={(event) => changeAnswer(questionId, event.target.value)}
                placeholder="Atbilde"
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section className="examFlow">
      <article className="examCover">
        <div className="examMetaRow">
          <p className="examMetaTitle">{title}</p>
          <span className="badge">{task.skill}</span>
        </div>
        <h2 className="examHeading">{description}</h2>
        <p className="examSubheading">Atlasiet uzdevumu un trenējieties eksāmena formātā.</p>

        <div style={{ marginTop: "0.95rem" }}>
          <label htmlFor="task-picker">Uzdevums</label>
          <select
            id="task-picker"
            value={task.id}
            onChange={(event) => {
              const nextIndex = tasks.findIndex((candidate) => candidate.id === event.target.value);
              stopSpeechRecognition();
              stopPromptAudio();
              setSpeechError(null);
              setTaskIndex(nextIndex >= 0 ? nextIndex : 0);
              setAnswers({});
              setResult(null);
              setPlayCount(0);
              setSelectedWord(null);
              setDraggingWord(null);
            }}
          >
            {tasks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.id} · {item.taskType.toLowerCase()} · {item.topic}
              </option>
            ))}
          </select>
        </div>

        <div className="timerRibbon">
          {task.promptLv}
          <br />
          {task.promptEn}
        </div>

        {audioSrc ? (
          <div style={{ marginTop: "0.8rem" }}>
            <audio
              controls
              src={audioSrc}
              onPlay={() => setPlayCount((prev) => prev + 1)}
              style={{ width: "100%" }}
            />
            <small style={{ color: "var(--ink-soft)" }}>Atskaņots: {playCount} reizes</small>
          </div>
        ) : null}
      </article>

      <article className="examSheet">
        <header className="examTaskHeader">
          <p className="badge">{task.id}</p>
          <h3 className="examTaskTitle">{taskTypeTitlesLv[task.taskType] ?? task.taskType}</h3>
          <p className="examTaskPrompt">Maksimālais punktu skaits: {task.points}</p>
        </header>

        {isSpeechTask ? (
          <div className="speechBanner">
            <strong>Speech to text enabled.</strong> Use <em>Speak answer</em> on each question to fill text from
            your microphone.
          </div>
        ) : null}

        {speechError ? <p className="speechError">{speechError}</p> : null}

        {renderTaskBody()}

        {(task.taskType === "MESSAGE_ADVERT" ||
          task.taskType === "PICTURE_SENTENCE" ||
          task.taskType === "WORD_FORM" ||
          task.taskType === "INTERVIEW" ||
          task.taskType === "IMAGE_DESCRIPTION" ||
          task.taskType === "AD_QUESTION") && (
          <div className="panel" style={{ marginTop: "1rem", padding: "0.8rem", boxShadow: "none" }}>
            <h4 style={{ marginTop: 0 }}>Optional rubric hints</h4>
            <p style={{ marginTop: "0.25rem", color: "var(--ink-soft)" }}>
              Leave these empty to use adaptive scoring and corrections automatically.
            </p>
            <div className="grid two">
              {(task.taskType === "MESSAGE_ADVERT" ||
                task.taskType === "INTERVIEW" ||
                task.taskType === "IMAGE_DESCRIPTION" ||
                task.taskType === "AD_QUESTION") && (
                <div>
                  <label htmlFor="rubricChecks">Rubric checks passed</label>
                  <input
                    id="rubricChecks"
                    type="number"
                    min={0}
                    max={6}
                    value={String(answerFor("rubricChecks") ?? "")}
                    onChange={(event) => changeAnswer("rubricChecks", Number(event.target.value))}
                  />
                </div>
              )}

              {task.taskType === "MESSAGE_ADVERT" && (
                <div>
                  <label htmlFor="wordCount">Word count</label>
                  <input
                    id="wordCount"
                    type="number"
                    min={0}
                    value={String(answerFor("wordCount") ?? "")}
                    onChange={(event) => changeAnswer("wordCount", Number(event.target.value))}
                  />
                </div>
              )}

              {task.taskType === "PICTURE_SENTENCE" && (
                <div>
                  <label htmlFor="sentenceChecks">Sentence checks</label>
                  <input
                    id="sentenceChecks"
                    type="number"
                    min={0}
                    max={4}
                    value={String(answerFor("sentenceChecks") ?? "")}
                    onChange={(event) => changeAnswer("sentenceChecks", Number(event.target.value))}
                  />
                </div>
              )}

              {task.taskType === "WORD_FORM" && (
                <div>
                  <label htmlFor="correctForms">Correct forms</label>
                  <input
                    id="correctForms"
                    type="number"
                    min={0}
                    max={5}
                    value={String(answerFor("correctForms") ?? "")}
                    onChange={(event) => changeAnswer("correctForms", Number(event.target.value))}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div className="paperFooter">
          <span>{task.skill}</span>
          <span>VISC, 2026</span>
        </div>
      </article>

      <article className="examSummary">
        <h3 style={{ marginTop: 0 }}>Iesniegšana</h3>
        <p>Iesniedz atbildes, lai redzētu automātisko rezultātu.</p>
        <div className="ctaRow">
          <button className="primaryBtn" type="button" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit Answers"}
          </button>
        </div>

        {result ? (
          <div className="panel" style={{ marginTop: "0.9rem", padding: "0.9rem", boxShadow: "none" }}>
            <h3 style={{ marginTop: 0 }}>Result</h3>
            <p>
              Score: <strong>{result.score}</strong> / {result.maxScore}
            </p>
            {result.feedback?.adaptiveEvaluation ? (
              <p>
                {result.feedback.adaptiveEvaluation.method === "openai"
                  ? "AI-evaluated with dynamic corrections."
                  : "Adaptive fallback evaluation with smart local scoring."}
              </p>
            ) : (
              <p>{result.autoGraded ? "Auto-graded" : "Rubric-guided score recorded"}</p>
            )}

            {result.feedback?.adaptiveEvaluation ? (
              <div>
                <p style={{ marginBottom: "0.45rem" }}>
                  <strong>Feedback:</strong> {result.feedback.adaptiveEvaluation.overallFeedback}
                </p>
                <p style={{ marginBottom: "0.45rem" }}>
                  Rubric: task completion {result.feedback.adaptiveEvaluation.rubric.taskCompletion}/5, grammar{" "}
                  {result.feedback.adaptiveEvaluation.rubric.grammar}/5, vocabulary{" "}
                  {result.feedback.adaptiveEvaluation.rubric.vocabulary}/5, coherence{" "}
                  {result.feedback.adaptiveEvaluation.rubric.coherence}/5
                  {typeof result.feedback.adaptiveEvaluation.rubric.fluency === "number"
                    ? `, fluency ${result.feedback.adaptiveEvaluation.rubric.fluency}/5`
                    : ""}
                </p>

                {result.feedback.adaptiveEvaluation.strengths.length > 0 ? (
                  <>
                    <p style={{ marginBottom: "0.3rem" }}>
                      <strong>Strengths</strong>
                    </p>
                    <ul style={{ marginTop: 0 }}>
                      {result.feedback.adaptiveEvaluation.strengths.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {result.feedback.adaptiveEvaluation.improvements.length > 0 ? (
                  <>
                    <p style={{ marginBottom: "0.3rem" }}>
                      <strong>Improvements</strong>
                    </p>
                    <ul style={{ marginTop: 0 }}>
                      {result.feedback.adaptiveEvaluation.improvements.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </>
                ) : null}

                {result.feedback.adaptiveEvaluation.corrections.length > 0 ? (
                  <details>
                    <summary>Corrections</summary>
                    <div style={{ marginTop: "0.5rem", display: "grid", gap: "0.45rem" }}>
                      {result.feedback.adaptiveEvaluation.corrections.map((item) => (
                        <article
                          key={`${item.questionId}-${item.original}`}
                          style={{
                            border: "1px solid color-mix(in oklab, var(--line) 88%, transparent)",
                            borderRadius: "10px",
                            padding: "0.55rem",
                          }}
                        >
                          <p style={{ margin: 0, fontWeight: 600 }}>{item.questionId}</p>
                          <p style={{ margin: "0.2rem 0" }}>
                            <strong>Original:</strong> {item.original}
                          </p>
                          <p style={{ margin: "0.2rem 0" }}>
                            <strong>Suggested:</strong> {item.corrected}
                          </p>
                          <p style={{ margin: 0, color: "var(--ink-soft)" }}>{item.note}</p>
                        </article>
                      ))}
                    </div>
                  </details>
                ) : null}

                {result.feedback.adaptiveEvaluation.warnings?.length ? (
                  <p style={{ marginTop: "0.55rem", color: "var(--ink-soft)" }}>
                    {result.feedback.adaptiveEvaluation.warnings.join(" ")}
                  </p>
                ) : null}
              </div>
            ) : null}

            {task.transcript ? (
              <details>
                <summary>Transcript</summary>
                <p>{task.transcript}</p>
              </details>
            ) : null}
          </div>
        ) : null}
      </article>
    </section>
  );
}
