from __future__ import annotations

import os
import tempfile
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="LVA2 STT Service")

_model_lock = threading.Lock()
_model_cache: dict[str, Any] = {}


def _normalize_provider(provider: str) -> str:
    value = (provider or "").strip().lower()
    if value not in {"whisper-ct2", "whisper-transformers", "whisper-cpp"}:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    return value


def _language_code(language: str) -> str:
    return (language or "lv").strip().lower()


def _language_name(language: str) -> str:
    lang = _language_code(language)
    return "latvian" if lang == "lv" else lang


def _get_ct2_model(model_id: str):
    with _model_lock:
        cached = _model_cache.get(f"ct2::{model_id}")
        if cached is not None:
            return cached
        from faster_whisper import WhisperModel

        device = os.getenv("STT_DEVICE", "cpu")
        compute_type = os.getenv("STT_COMPUTE_TYPE", "int8")
        model = WhisperModel(model_id, device=device, compute_type=compute_type)
        _model_cache[f"ct2::{model_id}"] = model
        return model


def _get_transformers_pipeline(model_id: str):
    with _model_lock:
        cached = _model_cache.get(f"hf::{model_id}")
        if cached is not None:
            return cached
        from transformers import pipeline

        pipe = pipeline("automatic-speech-recognition", model=model_id, device=-1)
        _model_cache[f"hf::{model_id}"] = pipe
        return pipe


def _transcribe_ct2(model_id: str, audio_path: str, language_code: str) -> str:
    model = _get_ct2_model(model_id)
    segments, _ = model.transcribe(audio_path, language=language_code, vad_filter=True)
    text = " ".join(segment.text.strip() for segment in segments if segment.text).strip()
    return text


def _transcribe_transformers(model_id: str, audio_path: str, language_name: str) -> str:
    pipe = _get_transformers_pipeline(model_id)
    result = pipe(audio_path, generate_kwargs={"language": language_name, "task": "transcribe"})
    if isinstance(result, dict):
        return str(result.get("text", "")).strip()
    return str(result).strip()


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "loadedModels": len(_model_cache)}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    provider: str = Form(...),
    modelId: str = Form(...),
    language: str = Form("lv"),
) -> dict[str, Any]:
    selected_provider = _normalize_provider(provider)
    selected_model = modelId.strip()
    if not selected_model:
        raise HTTPException(status_code=400, detail="modelId is required")

    if selected_provider == "whisper-cpp":
        raise HTTPException(status_code=400, detail="whisper-cpp backend is not configured in this container")

    suffix = Path(file.filename or "audio.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        tmp.write(await file.read())

    try:
        lang_code = _language_code(language)
        lang_name = _language_name(language)
        if selected_provider == "whisper-ct2":
            text = _transcribe_ct2(selected_model, tmp_path, lang_code)
        else:
            text = _transcribe_transformers(selected_model, tmp_path, lang_name)
        return {
            "text": text,
            "provider": selected_provider,
            "modelId": selected_model,
            "language": language,
        }
    except HTTPException:
        raise
    except Exception as error:  # pragma: no cover
        raise HTTPException(status_code=502, detail=f"Transcription failed: {error}")
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
