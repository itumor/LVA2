# VVPP A2 Trainer

Local-first web app for Latvian VVPP A2 exam simulation and adaptive practice.

## Stack
- Next.js 16 (App Router, TypeScript)
- PostgreSQL 16 (Prisma)
- MinIO (S3-compatible speaking recording storage)
- Docker Compose (`web`, `db`, `minio`, `minio-init`)

## Features Implemented
- Dual-mode exam simulation: `OFFICIAL` (strict) and `PRACTICE` (guided)
- Server-side section deadlines, lock enforcement, and active-section task validation
- Listening replay governance via server (`2 max` in `OFFICIAL`)
- Transcript reveal policy by mode (`OFFICIAL`: after section submit, `PRACTICE`: after task submit)
- Section and final-result remediation plans with direct trainer task recommendations
- Official sample content schema validation (`officialPart`, `officialOrder`, `answerKeyVersion`, evidence refs)
- Full exam-mode flow with official skill order and per-skill threshold (`>=9/15`)
- Trainers for Listening, Reading, Writing, Speaking
- Auto-scoring for listening/reading task types
- Adaptive scoring and corrections for writing/speaking (OpenAI + local fallback)
- Adaptive daily-plan API using spaced intervals (1/3/7/14 days)
- Speaking audio recording upload to MinIO
- Analytics and review queue pages
- Bilingual LV/EN UI toggle persisted in browser

## Local Run (Docker)
```bash
docker compose up -d --build
```

App URLs:
- App: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Stop:
```bash
docker compose down
```

## Local Run (without Docker for web)
Prereq: Docker `db` + `minio` running.

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Optional:
- Configure OpenAI-compatible evaluator in `.env`:
  - `OPENAI_BASE_URL=http://192.168.0.198:1234` (or `http://127.0.0.1:1234`)
  - `OPENAI_EVALUATOR_MODEL=openai/gpt-oss-20b`
  - `OPENAI_API_KEY=local-ai` (many local servers accept any non-empty token)

## Database + Seed
- Prisma schema: `prisma/schema.prisma`
- Migration: `prisma/migrations/20260223193000_init/migration.sql`
- Seed data: `prisma/seed-data/tasks.json`

Validation:
```bash
npm run seed:validate
```

## Test + Lint
```bash
npm run test
npm run lint
npm run build
```

## Key API Endpoints
- `POST /api/session/start`
- `POST /api/session/:id/answer`
- `POST /api/session/:id/submit-section`
- `POST /api/session/:id/finish`
- `GET /api/session/:id/result`
- `POST /api/session/:id/listening-play`
- `GET /api/daily-plan`
- `POST /api/review/:cardId/grade`
- `POST /api/audio/upload`
- `GET /api/analytics/summary`
- `GET /api/content/tasks?skill=&topic=&type=`

## Backup / Restore
```bash
scripts/backup.sh
scripts/restore.sh backups/db-<timestamp>.sql
```

## Notes
- Seed content is exam-structured training data for local study use.
- Uploaded recordings are stored in bucket `vvpp-recordings`.
- The provided `a_2_limenis_audio.mp3` and `a_2_limenis.pdf` are available under `public/media/`.
- New migration for exam fidelity v1: `prisma/migrations/20260223223500_exam_fidelity_v1/migration.sql`.
# LVA2
