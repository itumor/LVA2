# VVPP A2 Trainer — Business and Features Document

**Document purpose:** Describe the business context, product vision, and all features of the VVPP A2 Trainer web application.  
**Audience:** Stakeholders, product owners, developers, and documentation readers.  
**Last updated:** February 2025.

---

## 1. Business Overview

### 1.1 What is VVPP A2?

**VVPP A2 Trainer** is a **local-first web application** for **Latvian VVPP A2 exam simulation and adaptive practice**. It helps learners prepare for the Latvian language proficiency exam at level A2 (Common European Framework of Reference — CEFR) by providing:

- **Exam simulation** that mirrors official timing, section order, and rules.
- **Skill-specific trainers** for Listening, Reading, Writing, and Speaking.
- **Adaptive daily plans** and **spaced repetition** to focus on weak areas.
- **Analytics and remediation** so learners know where to improve.

The application is designed to run **locally** (e.g. Docker Compose or local Node + PostgreSQL + MinIO), keeping data on the learner’s or institution’s infrastructure while still supporting optional cloud services (e.g. OpenAI-compatible APIs for writing/speaking evaluation).

### 1.2 Target Users

- **Learners** preparing for the Latvian VVPP A2 exam who want timed practice, section-by-section feedback, and targeted review.
- **Educators or institutions** who want a self-hosted, exam-aligned training tool with optional AI scoring.

### 1.3 Value Proposition

- **Exam fidelity:** Official-style section order, time limits, listening replay limits, and pass/fail rules (e.g. ≥9/15 per skill).
- **Adaptive learning:** Daily plans mix review, weak-spot practice, and mixed tasks (50/30/20 style); spaced intervals (1/3/7/14 days) drive the review queue.
- **Local-first:** Data stays in the learner’s or institution’s database and object storage; no mandatory cloud dependency.
- **Bilingual UI:** Latvian (LV) and English (EN) interface toggle, persisted in the browser.

---

## 2. Technical Context (Summary)

- **Frontend/Backend:** Next.js 16 (App Router, TypeScript).
- **Data:** PostgreSQL 16 with Prisma ORM.
- **Storage:** MinIO (S3-compatible) for speaking recordings.
- **Optional:** OpenAI-compatible API for writing/speaking evaluation; local TTS (Piper) and STT (Whisper) sidecars for speech.

This document focuses on **business and features**; technical details are in the README and codebase.

---

## 3. Features

### 3.1 Dashboard (Mission Control)

**Route:** `/` (home).

**Purpose:** Central hub showing progress and quick access to exam, trainers, and review.

**Features:**

- **Overall accuracy** — Percentage derived from all tracked task attempts (score/maxScore).
- **Tracked attempts count** — Number of scored submissions stored in the database.
- **Today’s plan items** — Count of items in the adaptive daily plan (review + weakness + mixed).
- **Quick actions:** Start Full Exam, Listening Trainer, Review Queue.
- **Weak areas** — Topics with lowest accuracy (from recent attempts); encourages targeted practice.
- **Recent exam sessions** — Table of completed exams with date, total score, and pass/fail status.

Data is loaded server-side and refreshed on each visit (`getDashboardSnapshot`).

---

### 3.2 Exam Simulation

**Route:** `/exam`.

**Purpose:** Run a full exam in official order and (optionally) under official rules.

**Modes and strictness:**

- **Session modes:** `EXAM`, `TRAINING`, `DAILY_REVIEW`. Exam mode enforces section order and timing.
- **Strictness:**
  - **OFFICIAL** — Strict: section deadlines, lock after submit, listening replay limited to **2 plays per task**, transcript only after section submit.
  - **PRACTICE** — Guided: no replay limit, transcript after each task submit, evidence-mismatch guidance in Reading.

**Exam structure:**

- **Section order:** Listening → Reading → Writing → Speaking (official skill order).
- **Section durations (minutes):** Listening 25, Reading 30, Writing 35, Speaking 15. Server computes section deadlines from session start; sections can expire and lock.
- **Scoring:** Up to 15 points per skill; **minimum to pass per skill: 9**. Final pass = pass all four sections.

**Rules enforced server-side:**

- Only the current section accepts answers; other sections are locked.
- After a section is submitted or its deadline passes, that section is locked.
- In OFFICIAL mode, listening play count per task is tracked and limited to 2.
- Exam cannot be finished until all four sections are submitted.

**Content:**

- Tasks are ordered by `officialOrder` (and metadata such as `officialPart`, `answerKeyVersion`) so the exam follows the official sample structure. Seed data is validated for contiguous `officialOrder` and schema.

**Post-exam:**

- Section results and final outcome (total score, pass/fail, fail reasons) are stored.
- Remediation plans recommend specific trainer tasks per section (weak task types, weak topics, recommended task IDs).

---

### 3.3 Skill Trainers (Listening, Reading, Writing, Speaking)

**Routes:** `/trainer/listening`, `/trainer/reading`, `/trainer/writing`, `/trainer/speaking`.

**Purpose:** Practice one skill at a time with immediate scoring and (where applicable) adaptive feedback.

**Common behavior:**

- Tasks are loaded by skill from the content store; trainers do not enforce exam timing or section order.
- Submitting an answer creates a `TaskAttempt` (source: TRAINER), updates scoring, and can create or update a **review card** for spaced repetition.
- Correct/incorrect and weakness scores drive the daily plan and review queue.

**Listening:**

- Audio playback (from task `audioRef` or TTS); in exam mode, replay is limited in OFFICIAL strictness.
- Transcript visibility depends on mode (see Exam Simulation).

**Reading:**

- Tasks can include MCQ, True/False, Fill-in-blank, Matching, Cloze, etc. Matching tasks may have evidence refs; in PRACTICE mode, evidence mismatch is reported (EVIDENCE_MISMATCH) for guidance.

**Writing:**

- Production tasks (e.g. MESSAGE_ADVERT, WORD_FORM, PICTURE_SENTENCE) can be scored by:
  - **OpenAI-compatible API** (adaptive evaluation: dimensions, corrections, feedback), or
  - **Local heuristic fallback** (rubric-style checks, word count, etc.).
- Feedback includes strengths, improvements, and optional corrections.

**Speaking:**

- Learner records audio in the browser; recording is uploaded via `POST /api/audio/upload` to MinIO (bucket `vvpp-recordings`) and linked to the learner and optional session/task.
- Optional STT (speech-to-text) for transcription; TTS (text-to-speech) for prompts (e.g. Piper sidecar, configurable model/rate).
- Speaking production tasks (e.g. INTERVIEW, IMAGE_DESCRIPTION, AD_QUESTION) can use the same adaptive evaluator (OpenAI or heuristic) for rubric-based scoring.

---

### 3.4 Scoring and Evaluation

**Auto-graded task types:** MCQ, TRUE_FALSE, FILL_BLANK, MATCHING, CLOZE — scored server-side by comparing answers to stored correct answers/keys.

**Rubric / production task types:** PICTURE_SENTENCE, WORD_FORM, MESSAGE_ADVERT, INTERVIEW, IMAGE_DESCRIPTION, AD_QUESTION — scored via:

- **Adaptive path:** `evaluateProductionTask()` calls OpenAI-compatible API; returns score, maxScore, dimensions (task completion, grammar, vocabulary, coherence, fluency), strengths, improvements, corrections.
- **Fallback:** Local heuristic scoring (e.g. rubric checks, word count, correct forms) when API is unavailable or not configured.

Scores are scaled to task `points` and stored on `TaskAttempt`; `isCorrect` and feedback (including `adaptiveEvaluation`) are persisted for analytics and remediation.

**Section pass:** For each skill, score ≥ 9 out of 15 → passed. Exam pass = all four sections passed.

**Fail reasons:** If the exam is failed, detailed fail reasons (per skill shortfall, criterion, explanation) are computed and stored for the result view.

---

### 3.5 Remediation and Recommendations

**When:** After section submit (exam or trainer flow) and when viewing session result.

**Logic:** `buildSectionRemediation()` aggregates attempts by task type and topic, finds weak task types and weak topics (e.g. accuracy &lt; 75%), and builds:

- **weakTaskTypes** / **weakTopics** — For display and filtering.
- **recommendedTaskIds** — Up to 6 task IDs suggested for practice (prioritizing tasks the learner got wrong, then backups from weak types/topics).
- **items** — Remediation items with skill, taskId, taskType, topic, reason, action (e.g. “Practice task X now”).

Remediation is stored on `SectionResult.remediation` and reused on the session result page so learners see a clear “what to do next” per section.

---

### 3.6 Daily Plan (Adaptive)

**API:** `GET /api/daily-plan` returns today’s plan for the default learner.

**Purpose:** One adaptive “today” list mixing review, weak-spot practice, and mixed tasks (50/30/20 style), capped at 10 items.

**Logic (`buildDailyPlan`):**

- **Review:** Up to 5 due review cards (spaced repetition), ordered by weakness and due date.
- **Weakness:** Tasks from the top 3 weakest (skill, taskType) combinations by historical accuracy.
- **Mixed:** A few tasks from Listening, Reading, Speaking (e.g. by recent update) for variety.

Plan is persisted in `DailyPlanLog` (one row per learner per day). Dashboard “Today Plan Items” shows the count of this list.

---

### 3.7 Review Queue (Spaced Repetition)

**Route:** `/review`.

**Purpose:** Show due review cards and let the learner grade themselves (e.g. Hard / Good), then reschedule using spaced intervals.

**Data:** Cards from `ReviewCard` for the default learner, ordered by due date and weakness score; each card is tied to a task (skill, taskType, topic, prompt).

**Grading:** `POST /api/review/:cardId/grade` with `{ grade }` (0–5). Logic uses `computeNextInterval()` and `SPACED_INTERVALS` (e.g. 1, 3, 7, 14 days) to update interval, due date, status (NEW, LEARNING, REVIEW, MASTERED), and weakness score.

**Creation:** Review cards are created or updated when the learner submits attempts (trainer or exam) via `upsertReviewCardFromAttempt()` (correct → longer interval; incorrect → shorter interval and higher weakness).

---

### 3.8 Analytics

**Route:** `/analytics`.

**Purpose:** Accuracy by skill/task type and section pass history.

**Content:**

- **Task type accuracy** — Table of (Skill:TaskType), accuracy %, and attempt count.
- **Section outcomes** — Table of section results: skill, score, maxScore, pass/fail, submitted date.
- **Recent attempts** — Last N attempts with date, task id, skill, topic, score.

Data comes from `getAnalyticsSnapshot()` (attempts and section results for the default learner).

---

### 3.9 Settings

**Route:** `/settings`.

**Purpose:** Configure language, TTS, STT, and optional benchmark/rating.

**Features:**

- **Language:** LV/EN toggle; persisted in browser (LanguageProvider).
- **TTS (Text-to-Speech):** Provider (e.g. Piper, F5), model selection, playback rate. Config persisted via `PUT /api/tts/config`; models listed from `/api/tts/models`, optional catalog from `/api/tts/catalog`.
- **TTS Model Lab:** Run benchmark (`POST /api/tts/benchmark/run`) with selected prompt and model; get latency and audio URL. Rate runs (naturalness, pronunciation, notes) via `POST /api/tts/benchmark/rate`. Summary/leaderboard from `GET /api/tts/benchmark/summary`.
- **STT (Speech-to-Text):** Provider (browser, whisper-ct2, whisper-transformers, whisper-cpp), model selection. Config via `/api/stt/config`, models from `/api/stt/models`. Optional STT benchmark (e.g. run with uploaded/recorded file and reference text) for quality/latency.
- **Listening replay rule:** UI to set replay limit (e.g. 2 for official); actual enforcement is server-side in exam OFFICIAL mode.

---

### 3.10 Speaking Recordings and Audio Upload

**API:** `POST /api/audio/upload` (multipart: file, optional `sessionId`, `taskId`, `durationSec`).

**Flow:** Audio file (e.g. WebM/WAV) is stored in MinIO (`vvpp-recordings` bucket); a `SpeakingRecording` row is created with learner, optional session/task, object key, bucket, duration. Used by the Speaking trainer and any future playback or evaluation of recordings.

---

### 3.11 Content and Tasks API

**API:** `GET /api/content/tasks?skill=&topic=&type=` — Returns tasks filtered by skill, topic, and/or task type (from `getTasks()`). Used by trainers and any client that needs filtered task lists.

---

### 3.12 Health and Operations

- **Health:** `GET /api/health` — App health check.
- **TTS sidecar:** e.g. `http://localhost:5001/health` (Piper).
- **STT sidecar:** e.g. `http://localhost:5003/health`.
- **Backup/restore:** `scripts/backup.sh`, `scripts/restore.sh` for database dumps.

---

## 4. Key API Endpoints (Reference)

| Method | Endpoint | Purpose |
|--------|----------|--------|
| POST | `/api/session/start` | Start exam/training session (body: mode, strictness) |
| POST | `/api/session/:id/answer` | Submit task answer |
| POST | `/api/session/:id/submit-section` | Submit section (exam) |
| POST | `/api/session/:id/finish` | Finish exam (all sections submitted) |
| GET | `/api/session/:id/result` | Get session result + remediation plan |
| POST | `/api/session/:id/listening-play` | Record listening play (enforces replay limit in OFFICIAL) |
| GET | `/api/daily-plan` | Get adaptive daily plan |
| POST | `/api/review/:cardId/grade` | Grade review card (spaced repetition) |
| POST | `/api/audio/upload` | Upload speaking recording to MinIO |
| POST | `/api/tts/synthesize` | Generate TTS audio |
| GET | `/api/tts/models` | List TTS models |
| GET | `/api/tts/config` | Get TTS config |
| PUT | `/api/tts/config` | Save TTS config |
| POST | `/api/tts/benchmark/run` | Run TTS benchmark |
| POST | `/api/tts/benchmark/rate` | Rate TTS benchmark run |
| GET | `/api/tts/benchmark/summary` | TTS benchmark summary/leaderboard |
| GET | `/api/analytics/summary` | Analytics snapshot (by task type, section results, attempts) |
| GET | `/api/content/tasks` | List tasks (query: skill, topic, type) |

---

## 5. Task Types (Summary)

| Task type | Skill(s) | Scoring |
|-----------|----------|--------|
| MCQ, TRUE_FALSE, FILL_BLANK, MATCHING, CLOZE | Listening, Reading | Auto-graded (answer key) |
| PICTURE_SENTENCE, WORD_FORM, MESSAGE_ADVERT | Writing | Rubric / adaptive (OpenAI or heuristic) |
| INTERVIEW, IMAGE_DESCRIPTION, AD_QUESTION | Speaking | Rubric / adaptive (OpenAI or heuristic) |

---

## 6. Data and Privacy (High Level)

- **Local-first:** PostgreSQL and MinIO typically run on the same host or network as the app; no requirement to send data to third parties.
- **Optional cloud:** If configured, an OpenAI-compatible API may receive writing/speaking content for evaluation; this is optional and configurable.
- **Single default learner:** The app uses a default learner ID for all actions; multi-tenant or multi-user would require additional identity and scoping.

---

## 7. Document History

- **February 2025** — Initial business and features document created from codebase and README.

---

*End of document.*
