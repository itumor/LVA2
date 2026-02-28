import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createJobMock: vi.fn(),
  getJobMock: vi.fn(),
}));

vi.mock("@/lib/vvpp-a2-generation-jobs", () => ({
  createVvppA2GenerationJob: mocks.createJobMock,
  getVvppA2GenerationJob: mocks.getJobMock,
}));

describe("VVPP generator background job routes", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createJobMock.mockReset();
    mocks.getJobMock.mockReset();
  });

  it("POST /jobs returns 202 with initial job snapshot", async () => {
    mocks.createJobMock.mockReturnValue({
      jobId: "job-1",
      status: "queued",
      progress: {
        phase: "queued",
        percent: 0,
        totalExams: 3,
        completedExams: 0,
        llmCount: 0,
        fallbackCount: 0,
      },
      createdAt: "2026-02-28T10:00:00.000Z",
      startedAt: null,
      updatedAt: "2026-02-28T10:00:00.000Z",
      completedAt: null,
    });

    const { POST } = await import("@/app/api/content/generate-vvpp-a2/jobs/route");
    const response = await POST(
      new Request("http://localhost/api/content/generate-vvpp-a2/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ n: 3, seed: 2026 }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(202);
    expect(payload.ok).toBe(true);
    expect(payload.data.jobId).toBe("job-1");
  });

  it("GET /jobs/[jobId] returns running snapshot", async () => {
    mocks.getJobMock.mockReturnValue({
      jobId: "job-2",
      status: "running",
      progress: {
        phase: "generating",
        percent: 33,
        totalExams: 3,
        completedExams: 1,
        llmCount: 1,
        fallbackCount: 0,
      },
      createdAt: "2026-02-28T10:00:00.000Z",
      startedAt: "2026-02-28T10:00:01.000Z",
      updatedAt: "2026-02-28T10:00:02.000Z",
      completedAt: null,
    });

    const { GET } = await import("@/app/api/content/generate-vvpp-a2/jobs/[jobId]/route");
    const response = await GET(
      new Request("http://localhost/api/content/generate-vvpp-a2/jobs/job-2"),
      { params: Promise.resolve({ jobId: "job-2" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe("running");
    expect(payload.data.progress.percent).toBe(33);
  });

  it("GET /jobs/[jobId] returns completed snapshot with result", async () => {
    mocks.getJobMock.mockReturnValue({
      jobId: "job-3",
      status: "completed",
      progress: {
        phase: "completed",
        percent: 100,
        totalExams: 2,
        completedExams: 2,
        llmCount: 2,
        fallbackCount: 0,
      },
      createdAt: "2026-02-28T10:00:00.000Z",
      startedAt: "2026-02-28T10:00:01.000Z",
      updatedAt: "2026-02-28T10:00:10.000Z",
      completedAt: "2026-02-28T10:00:10.000Z",
      result: {
        payload: {
          generator: { name: "VVPP_A2_Generator", seed: 2026, n: 2 },
          exams: [],
        },
        diagnostics: {
          requestedUseLlm: true,
          requireLlm: true,
          selectedBaseUrl: "http://127.0.0.1:1234",
          model: "openai/gpt-oss-20b",
          baseUrlProbes: [],
          stats: {
            llmRequested: true,
            llmPreflightPassed: true,
            llmCount: 2,
            fallbackCount: 0,
            total: 2,
          },
        },
      },
    });

    const { GET } = await import("@/app/api/content/generate-vvpp-a2/jobs/[jobId]/route");
    const response = await GET(
      new Request("http://localhost/api/content/generate-vvpp-a2/jobs/job-3"),
      { params: Promise.resolve({ jobId: "job-3" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe("completed");
    expect(payload.data.result.diagnostics.stats.total).toBe(2);
  });

  it("GET /jobs/[jobId] returns failed snapshot", async () => {
    mocks.getJobMock.mockReturnValue({
      jobId: "job-4",
      status: "failed",
      progress: {
        phase: "failed",
        percent: 67,
        totalExams: 3,
        completedExams: 2,
        llmCount: 1,
        fallbackCount: 1,
      },
      createdAt: "2026-02-28T10:00:00.000Z",
      startedAt: "2026-02-28T10:00:01.000Z",
      updatedAt: "2026-02-28T10:00:05.000Z",
      completedAt: "2026-02-28T10:00:05.000Z",
      error: "Generation failed",
      code: "GENERATION_FAILED",
    });

    const { GET } = await import("@/app/api/content/generate-vvpp-a2/jobs/[jobId]/route");
    const response = await GET(
      new Request("http://localhost/api/content/generate-vvpp-a2/jobs/job-4"),
      { params: Promise.resolve({ jobId: "job-4" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.status).toBe("failed");
    expect(payload.data.code).toBe("GENERATION_FAILED");
  });

  it("GET /jobs/[jobId] returns 404 for unknown job", async () => {
    mocks.getJobMock.mockReturnValue(null);

    const { GET } = await import("@/app/api/content/generate-vvpp-a2/jobs/[jobId]/route");
    const response = await GET(
      new Request("http://localhost/api/content/generate-vvpp-a2/jobs/missing"),
      { params: Promise.resolve({ jobId: "missing" }) },
    );

    const payload = await response.json();
    expect(response.status).toBe(404);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("JOB_NOT_FOUND");
  });
});
