import { readFile } from "node:fs/promises";
import path from "node:path";
import { fail } from "@/lib/http";
import { resolveImageOutputDir } from "@/lib/local-image";

type Params = {
  params: Promise<{
    file: string;
  }>;
};

function isSafePngName(file: string) {
  return /^[a-f0-9]{64}\.png$/i.test(file);
}

export async function GET(_: Request, { params }: Params) {
  const { file } = await params;

  if (!isSafePngName(file)) {
    return fail("Invalid image filename.", 400, "INVALID_IMAGE_NAME");
  }

  const fullPath = path.join(resolveImageOutputDir(), file);

  try {
    const bytes = await readFile(fullPath);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return fail("Image not found.", 404, "IMAGE_NOT_FOUND");
  }
}
