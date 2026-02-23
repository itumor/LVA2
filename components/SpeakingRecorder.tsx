"use client";

import { useRef, useState } from "react";

export function SpeakingRecorder({ taskId }: { taskId?: string }) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string>("");
  const [durationSec, setDurationSec] = useState(0);
  const [startTs, setStartTs] = useState<number | null>(null);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const formData = new FormData();
      formData.append("file", blob, `speaking-${Date.now()}.webm`);
      if (taskId) {
        formData.append("taskId", taskId);
      }
      formData.append("durationSec", String(durationSec));

      const response = await fetch("/api/audio/upload", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (payload.ok) {
        setUploadMessage("Uploaded to MinIO and saved in progress history.");
      } else {
        setUploadMessage(`Upload failed: ${payload.error}`);
      }

      for (const track of stream.getTracks()) {
        track.stop();
      }
    };

    setStartTs(Date.now());
    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
    setUploadMessage("");
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    setRecording(false);
    if (startTs) {
      setDurationSec(Math.round((Date.now() - startTs) / 1000));
    }
  }

  return (
    <div className="panel" style={{ padding: "1rem" }}>
      <h3>Speaking Recorder</h3>
      <p>Record your response and replay it before the next prompt.</p>
      <div className="ctaRow">
        {!recording ? (
          <button className="primaryBtn" type="button" onClick={startRecording}>
            Start recording
          </button>
        ) : (
          <button className="secondaryBtn" type="button" onClick={stopRecording}>
            Stop recording
          </button>
        )}
      </div>
      {audioUrl ? (
        <div style={{ marginTop: "0.8rem" }}>
          <audio controls src={audioUrl} style={{ width: "100%" }} />
          <p style={{ marginTop: "0.5rem", color: "var(--ink-soft)" }}>{uploadMessage}</p>
        </div>
      ) : null}
    </div>
  );
}
