# VVPP A2 Trainer - User Guide

## 1) Open the app
- URL: `http://localhost:3000`
- MinIO Console (optional): `http://localhost:9001`

## 2) Start the app
From project folder:

One-time Latvian TTS model download:
```bash
mkdir -p tts-models
curl -L -o tts-models/lv_LV-aivars-medium.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx
curl -L -o tts-models/lv_LV-aivars-medium.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/lv/lv_LV/aivars/medium/lv_LV-aivars-medium.onnx.json
```

Then start services:
```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
```

You should see:
- `vvpp-web` (healthy)
- `vvpp-db` (healthy)
- `vvpp-minio` (up)
- `vvpp-tts` (healthy)

## 3) Stop the app
```bash
docker compose down
```

## 4) Main pages
- `/` Dashboard: overall accuracy, weak areas, today plan, quick start
- `/exam`: full exam simulator with mode selector (Listening -> Reading -> Writing -> Speaking)
- `/trainer/listening`: announcements, true/false dialogue, fill blanks
- `/trainer/reading`: matching + cloze
- `/trainer/writing`: adaptive writing scoring + corrections
- `/trainer/speaking`: adaptive speaking scoring + corrections + audio recorder/upload
- `/review`: spaced repetition queue from mistakes
- `/analytics`: scores by skill/type + recent attempts
- `/settings`: LV/EN language toggle and replay preference UI
  - Includes **TTS Model Lab**: choose installed local model, set rate, benchmark prompts, and rate outputs.

## 5) Typical workflow
1. Open dashboard and click **Start Full Exam** (opens `/exam` mode selector) or a trainer.
2. Submit answers in trainer/exam pages.
3. Open `/review` for scheduled weak cards.
4. Check `/analytics` for progress by skill and task type.

## 6) Exam modes and rules
- `Official Simulation`
  - Server lock by section deadline (client timer is display-only).
  - Listening replay limit: max 2 plays per task.
  - Listening transcript visible only after section submit.
- `Practice Simulation`
  - Same server-based section timing.
  - Listening replay above 2 is allowed (warning only).
  - Guided reading evidence capture and remediation suggestions.
  - Transcript available after task submission.

## 7) Speaking recording
- On speaking trainer page, click **Start recording** -> **Stop recording**.
- Recording is uploaded to MinIO and saved to DB (`speaking_recording`).

## 8) Seed content and DB
- Seed runs automatically on container startup.
- To reseed manually:

```bash
npm run db:seed
```

Seed dataset now enforces:
- Official metadata: `officialPart`, `officialOrder`, `answerKeyVersion`
- Evidence references for listening and applicable reading tasks

## 9) Quick health checks
- API health: `http://localhost:3000/api/health`
- TTS sidecar health: `http://localhost:5001/health`
- Content API example: `http://localhost:3000/api/content/tasks?skill=listening`

## 10) Local dev checks
```bash
npm run test
npm run lint
npm run build
```
