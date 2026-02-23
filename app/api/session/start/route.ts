import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { parseMode, parseStrictness, startSession } from "@/lib/session";

const schema = z.object({
  mode: z.string().optional().default("EXAM"),
  strictness: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const session = await startSession(parseMode(body.mode), parseStrictness(body.strictness));
    return ok(session);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Failed to start session");
  }
}
