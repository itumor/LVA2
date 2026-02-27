FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends espeak-ng \
  && rm -rf /var/lib/apt/lists/*

COPY tts-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY tts-service/server.py /app/server.py

ENV PIPER_MODEL_DIR=/models
ENV PIPER_DEFAULT_VOICE=lv_LV-default

EXPOSE 5001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5001"]
