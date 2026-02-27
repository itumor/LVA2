import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { fail } from "@/lib/http";
import { resolveTtsCacheDir } from "@/lib/tts";

const FILE_RE = /^[a-f0-9]{64}\.wav$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ file: string }> },
) {
  const { file } = await context.params;

  if (!FILE_RE.test(file)) {
    return fail("Invalid audio file", 400, "INVALID_FILE");
  }

  const filePath = path.join(resolveTtsCacheDir(), file);

  try {
    await access(filePath);
    const bytes = await readFile(filePath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fail("Audio not found", 404, "AUDIO_NOT_FOUND");
  }
}
