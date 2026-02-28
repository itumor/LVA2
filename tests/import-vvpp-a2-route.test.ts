import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyMock = vi.fn(async ({ where }: { where: { id: { startsWith: string } } }) => {
  const examId = String(where.id.startsWith).replace(/__$/, "");
  return [{ id: `${examId}__t01`, skill: "LISTENING" }, { id: `${examId}__t02`, skill: "READING" }];
});

const parseGeneratedOutputMock = vi.fn((raw: unknown) => {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid VVPP generator JSON: missing exams[]");
  }
  return raw;
});

const importGeneratedExamToDbMock = vi.fn(async () => ({
  examId: "A2_2026_001",
  versionLabel: "v1",
  importedTasks: 12,
  replacedExisting: true,
}));

const importGeneratedExamsBatchToDbMock = vi.fn(async (items: Array<{ payload: { examId?: string } }>) =>
  items.map((item, index) => ({
    ok: true as const,
    examId: item.payload?.examId ?? `A2_2026_${String(index + 1).padStart(3, "0")}`,
    versionLabel: "v1",
    importedTasks: 12,
    replacedExisting: true,
  })),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    taskItem: {
      findMany: findManyMock,
    },
  },
}));

vi.mock("@/lib/vvpp-a2-db-import", () => ({
  parseGeneratedOutput: parseGeneratedOutputMock,
  importGeneratedExamToDb: importGeneratedExamToDbMock,
  importGeneratedExamsBatchToDb: importGeneratedExamsBatchToDbMock,
}));

describe("POST /api/content/import-vvpp-a2", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("imports multiple JSON files in batch mode", async () => {
    const { POST } = await import("@/app/api/content/import-vvpp-a2/route");

    const form = new FormData();
    form.append("mode", "batch");
    form.append("replaceExisting", "true");
    form.append("files", new File([JSON.stringify({ exams: [], examId: "A2_2026_101" })], "one.json", { type: "application/json" }));
    form.append("files", new File([JSON.stringify({ exams: [], examId: "A2_2026_102" })], "two.json", { type: "application/json" }));

    const response = await POST(new Request("http://localhost/api/content/import-vvpp-a2", { method: "POST", body: form }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.totalFiles).toBe(2);
    expect(payload.data.succeeded).toBe(2);
    expect(payload.data.failed).toBe(0);
    expect(payload.data.results).toHaveLength(2);
    expect(importGeneratedExamsBatchToDbMock).toHaveBeenCalledTimes(1);
    expect(parseGeneratedOutputMock).toHaveBeenCalledTimes(2);
  });

  it("continues batch import when one file is invalid", async () => {
    importGeneratedExamsBatchToDbMock.mockResolvedValueOnce([
      {
        ok: true,
        examId: "A2_2026_201",
        versionLabel: "v2",
        importedTasks: 12,
        replacedExisting: true,
      },
    ]);

    const { POST } = await import("@/app/api/content/import-vvpp-a2/route");
    const form = new FormData();
    form.append("mode", "batch");
    form.append("files", new File([JSON.stringify({ exams: [], examId: "A2_2026_201" })], "valid.json", { type: "application/json" }));
    form.append("files", new File(["{invalid"], "invalid.json", { type: "application/json" }));

    const response = await POST(new Request("http://localhost/api/content/import-vvpp-a2", { method: "POST", body: form }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data.totalFiles).toBe(2);
    expect(payload.data.succeeded).toBe(1);
    expect(payload.data.failed).toBe(1);
    expect(payload.data.results).toHaveLength(2);
    expect(payload.data.results.some((row: { fileName: string; ok: boolean }) => row.fileName === "invalid.json" && !row.ok)).toBe(true);
  });

  it("rejects empty batch uploads", async () => {
    const { POST } = await import("@/app/api/content/import-vvpp-a2/route");
    const form = new FormData();
    form.append("mode", "batch");

    const response = await POST(new Request("http://localhost/api/content/import-vvpp-a2", { method: "POST", body: form }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("BAD_INPUT");
  });

  it("keeps JSON body import behavior", async () => {
    const { POST } = await import("@/app/api/content/import-vvpp-a2/route");

    const response = await POST(
      new Request("http://localhost/api/content/import-vvpp-a2", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payload: { exams: [] },
          examId: "A2_2026_001",
          replaceExisting: false,
        }),
      }),
    );

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(importGeneratedExamToDbMock).toHaveBeenCalledTimes(1);
  });
});
