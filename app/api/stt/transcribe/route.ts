import { fail, ok } from "@/lib/http";
import { transcribeWithActiveStt } from "@/lib/stt-transcribe";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail("Missing audio file", 400, "MISSING_FILE");

    const result = await transcribeWithActiveStt(file);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "STT request failed";
    const code = message.includes("Server STT is not active") ? "STT_BROWSER_MODE" : "STT_PROVIDER_UNAVAILABLE";
    const status = code === "STT_BROWSER_MODE" ? 400 : 502;
    return fail(message, status, code);
  }
}
