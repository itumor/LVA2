"use client";

import { useState } from "react";

type ReviewCard = {
  id: string;
  dueDate: string;
  weaknessScore: number;
  task: {
    id: string;
    skill: string;
    taskType: string;
    promptLv: string;
    topic: string;
  };
};

export function ReviewBoard({ cards }: { cards: ReviewCard[] }) {
  const [localCards, setLocalCards] = useState(cards);
  const [status, setStatus] = useState<string>("");

  async function grade(cardId: string, value: number) {
    const response = await fetch(`/api/review/${cardId}/grade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade: value }),
    });

    const payload = await response.json();
    if (!payload.ok) {
      setStatus(payload.error ?? "Could not grade");
      return;
    }

    setLocalCards((prev) => prev.filter((card) => card.id !== cardId));
    setStatus("Card graded and rescheduled.");
  }

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>Review Queue</h2>
        <p>Spaced repetition cards generated from mistakes and weak confidence.</p>
      </header>

      <div className="panel" style={{ padding: "1rem" }}>
        <p style={{ marginTop: 0 }}>{status}</p>
        {localCards.length === 0 ? (
          <p>No due cards. Come back after your next training session.</p>
        ) : (
          <div className="grid">
            {localCards.map((card) => (
              <article className="card" key={card.id}>
                <p className="badge">
                  {card.task.skill.toLowerCase()} · {card.task.taskType.toLowerCase()} · {card.task.topic}
                </p>
                <h3 style={{ marginTop: "0.45rem" }}>{card.task.promptLv}</h3>
                <p>
                  Due: {new Date(card.dueDate).toLocaleDateString()} · Weakness {card.weaknessScore.toFixed(2)}
                </p>
                <div className="ctaRow">
                  <button className="secondaryBtn" type="button" onClick={() => grade(card.id, 2)}>
                    Hard
                  </button>
                  <button className="primaryBtn" type="button" onClick={() => grade(card.id, 4)}>
                    Good
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
