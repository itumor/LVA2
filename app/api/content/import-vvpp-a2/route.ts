import { readFileSync } from "node:fs";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { importGeneratedExamToDb, importGeneratedExamsBatchToDb, parseGeneratedOutput } from "@/lib/vvpp-a2-db-import";

function parseBoolean(raw: FormDataEntryValue | undefined, fallback: boolean) {
  if (typeof raw !== "string") return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const mode = String(form.get("mode") ?? "").trim().toLowerCase();
      if (mode !== "batch") {
        return fail("Unsupported multipart mode", 400, "BAD_INPUT");
      }

      const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
      if (files.length === 0) {
        return fail("No JSON files uploaded", 400, "BAD_INPUT");
      }

      const replaceExisting = parseBoolean(form.get("replaceExisting") ?? undefined, true);
      const preGenerateAssets = parseBoolean(form.get("preGenerateAssets") ?? undefined, false);
      const parsedItems: Array<{ fileName: string; payload: ReturnType<typeof parseGeneratedOutput> }> = [];
      const failedParseResults: Array<{ fileName: string; ok: false; error: string }> = [];

      for (const file of files) {
        const fileName = file.name || "unknown.json";
        try {
          const rawText = await file.text();
          const payloadRaw = JSON.parse(rawText);
          parsedItems.push({
            fileName,
            payload: parseGeneratedOutput(payloadRaw),
          });
        } catch (error) {
          failedParseResults.push({
            fileName,
            ok: false,
            error: error instanceof Error ? error.message : "Invalid JSON file",
          });
        }
      }

      const importResults = await importGeneratedExamsBatchToDb(
        parsedItems.map((item) => ({ payload: item.payload })),
        { replaceExisting, preGenerateAssets },
      );

      const dbCache = new Map<string, { dbTaskCount: number; importedTaskIds: string[] }>();
      const getDbMeta = async (examId: string) => {
        const cached = dbCache.get(examId);
        if (cached) return cached;

        const importedRows = await prisma.taskItem.findMany({
          where: {
            id: {
              startsWith: `${examId}__`,
            },
          },
          orderBy: [{ skill: "asc" }, { id: "asc" }],
        });

        const value = {
          dbTaskCount: importedRows.length,
          importedTaskIds: importedRows.map((row) => row.id),
        };
        dbCache.set(examId, value);
        return value;
      };

      const importResultRows: Array<{
        fileName: string;
        ok: boolean;
        error?: string;
        examId?: string;
        versionLabel?: string;
        importedTasks?: number;
        dbTaskCount?: number;
        importedTaskIds?: string[];
        assetStats?: {
          generatedImages: number;
          generatedAudio: number;
          imageFailures: number;
          audioFailures: number;
        };
      }> = [];

      for (let index = 0; index < parsedItems.length; index += 1) {
        const fileName = parsedItems[index]?.fileName ?? `file-${index + 1}.json`;
        const itemResult = importResults[index];

        if (!itemResult || !itemResult.ok) {
          importResultRows.push({
            fileName,
            ok: false,
            error: itemResult?.ok === false ? itemResult.error : "Import failed",
          });
          continue;
        }

        const dbMeta = await getDbMeta(itemResult.examId);
        importResultRows.push({
          fileName,
          ok: true,
          examId: itemResult.examId,
          versionLabel: itemResult.versionLabel,
          importedTasks: itemResult.importedTasks,
          assetStats: itemResult.assetStats,
          dbTaskCount: dbMeta.dbTaskCount,
          importedTaskIds: dbMeta.importedTaskIds,
        });
      }

      const results = [...importResultRows, ...failedParseResults];
      const succeeded = results.filter((row) => row.ok).length;
      const failed = results.length - succeeded;

      return ok({
        totalFiles: files.length,
        succeeded,
        failed,
        replacedExisting: replaceExisting,
        results,
      });
    }

    const body = (await request.json()) as {
      filePath?: string;
      examId?: string;
      replaceExisting?: boolean;
      preGenerateAssets?: boolean;
      payload?: unknown;
    };

    const payloadRaw = body.payload ?? (body.filePath ? JSON.parse(readFileSync(body.filePath, "utf-8")) : null);
    if (!payloadRaw) {
      return fail("Provide payload or filePath", 400, "BAD_INPUT");
    }

    const parsed = parseGeneratedOutput(payloadRaw);
    const result = await importGeneratedExamToDb(parsed, {
      examId: body.examId,
      replaceExisting: body.replaceExisting ?? true,
      preGenerateAssets: body.preGenerateAssets ?? false,
    });

    const importedRows = await prisma.taskItem.findMany({
      where: {
        id: {
          startsWith: `${result.examId}__`,
        },
      },
      orderBy: [{ skill: "asc" }, { id: "asc" }],
    });

    return ok({
      ...result,
      dbTaskCount: importedRows.length,
      importedTaskIds: importedRows.map((row) => row.id),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Import failed", 400, "IMPORT_FAILED");
  }
}
