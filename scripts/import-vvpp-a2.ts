import { readFileSync } from "node:fs";
import { importGeneratedExamToDb, parseGeneratedOutput } from "@/lib/vvpp-a2-db-import";

type CliArgs = {
  file?: string;
  examId?: string;
  replaceExisting?: boolean;
};

function parseBoolean(raw: string | undefined): boolean | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {};

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, rawValue] = arg.slice(2).split("=", 2);

    if (key === "file" && rawValue) out.file = rawValue;
    if (key === "examId" && rawValue) out.examId = rawValue;
    if (key === "replaceExisting") out.replaceExisting = parseBoolean(rawValue);
  }

  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    throw new Error("Missing --file=/absolute/path/to/vvpp.json");
  }

  const raw = readFileSync(args.file, "utf-8");
  const payload = parseGeneratedOutput(JSON.parse(raw));

  const result = await importGeneratedExamToDb(payload, {
    examId: args.examId,
    replaceExisting: args.replaceExisting ?? true,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        ...result,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`[import-vvpp-a2] ${String(error)}\n`);
  process.exit(1);
});
