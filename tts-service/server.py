from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field


class SynthesizeRequest(BaseModel):
    text: str = Field(min_length=1)
    lang: str = Field(default="lv")
    voice: str | None = Field(default=None)
    rate: float = Field(default=1.0, ge=0.7, le=1.3)


app = FastAPI()


def resolve_model_path(voice: str | None) -> str:
    default_voice = os.environ.get("PIPER_DEFAULT_VOICE", "lv_LV-aivars-medium")
    chosen_voice = (voice or default_voice).strip()

    model_dir = Path(os.environ.get("PIPER_MODEL_DIR", "/models"))
    model_path = model_dir / f"{chosen_voice}.onnx"
    if not model_path.exists():
        raise HTTPException(status_code=500, detail=f"Piper model not found: {model_path}")
    return str(model_path)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/synthesize")
def synthesize(payload: SynthesizeRequest):
    text = " ".join(payload.text.split()).strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    model_path = resolve_model_path(payload.voice)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
        temp_path = temp_file.name

    try:
        cmd = [
            "piper",
            "--model",
            model_path,
            "--output_file",
            temp_path,
            "--length_scale",
            str(1 / payload.rate),
        ]

        run = subprocess.run(
            cmd,
            input=text.encode("utf-8"),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if run.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Piper synthesis failed ({run.returncode}): {run.stderr.decode('utf-8', errors='ignore')}",
            )

        audio = Path(temp_path).read_bytes()
        if not audio:
            raise HTTPException(status_code=500, detail="Piper returned empty audio")

        return Response(content=audio, media_type="audio/wav")
    finally:
        Path(temp_path).unlink(missing_ok=True)
