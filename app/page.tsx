import Link from "next/link";
import { StartExamButton } from "@/components/StartExamButton";
import { getDashboardSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getDashboardSnapshot();

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>VVPP A2 Mission Control</h2>
        <p>Adaptive daily training across Listening, Reading, Writing, and Speaking.</p>
      </header>

      <div className="grid three">
        <article className="card">
          <p className="badge">Overall Accuracy</p>
          <h3>{snapshot.accuracy}%</h3>
          <div className="meter">
            <span style={{ width: `${snapshot.accuracy}%` }} />
          </div>
        </article>
        <article className="card">
          <p className="badge">Tracked Attempts</p>
          <h3>{snapshot.attemptsCount}</h3>
          <p>Scored submissions saved locally in Postgres.</p>
        </article>
        <article className="card">
          <p className="badge">Today Plan Items</p>
          <h3>{snapshot.dailyPlan.length}</h3>
          <p>50/30/20 mix of review, weak spots, and interleaved prompts.</p>
        </article>
      </div>

      <div className="panel" style={{ padding: "1rem" }}>
        <h3>Quick Start</h3>
        <div className="ctaRow">
          <StartExamButton />
          <Link className="secondaryBtn buttonLike" href="/trainer/listening">
            Listening Trainer
          </Link>
          <Link className="secondaryBtn buttonLike" href="/review">
            Review Queue
          </Link>
        </div>
      </div>

      <div className="grid two">
        <section className="panel" style={{ padding: "1rem" }}>
          <h3>Weak Areas</h3>
          {snapshot.weakest.length === 0 ? (
            <p>No weakness data yet. Submit a few trainer tasks first.</p>
          ) : (
            <div className="grid">
              {snapshot.weakest.map((item) => (
                <article className="card" key={item.topic}>
                  <h4 style={{ margin: 0 }}>{item.topic}</h4>
                  <p style={{ marginBottom: "0.5rem" }}>{item.accuracy.toFixed(1)}% accuracy</p>
                  <div className="meter">
                    <span style={{ width: `${item.accuracy}%` }} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel" style={{ padding: "1rem" }}>
          <h3>Recent Exam Sessions</h3>
          {snapshot.recentSessions.length === 0 ? (
            <p>No completed exam yet.</p>
          ) : (
            <table className="tableLike">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.recentSessions.map((session) => (
                  <tr key={session.id}>
                    <td>{session.endedAt?.toLocaleDateString() ?? "-"}</td>
                    <td>{session.totalScore ?? 0}</td>
                    <td>{session.passAll ? "PASS" : "FAIL"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </section>
  );
}
