import { z } from "zod";
import { DEFAULT_LEARNER_ID } from "@/lib/constants";
import { fail, ok } from "@/lib/http";
import { uploadAudioObject } from "@/lib/minio";
import { prisma } from "@/lib/prisma";

const metadataSchema = z.object({
  sessionId: z.string().optional(),
  taskId: z.string().optional(),
  durationSec: z.coerce.number().optional(),
});

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return fail("Missing audio file");
    }

    const metadata = metadataSchema.parse({
      sessionId: formData.get("sessionId"),
      taskId: formData.get("taskId"),
      durationSec: formData.get("durationSec"),
    });

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const extension = file.type.includes("wav") ? "wav" : "webm";
    const key = `speaking/${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.${extension}`;

    const uploaded = await uploadAudioObject({
      key,
      body: bytes,
      contentType: file.type || "audio/webm",
    });

    const record = await prisma.speakingRecording.create({
      data: {
        learnerId: DEFAULT_LEARNER_ID,
        sessionId: metadata.sessionId,
        taskId: metadata.taskId,
        objectKey: uploaded.key,
        bucket: uploaded.bucket,
        durationSec: metadata.durationSec,
      },
    });

    return ok(record);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Audio upload failed");
  }
}
