import { getAnalyticsSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const snapshot = await getAnalyticsSnapshot();

  return (
    <section className="grid">
      <header className="pageHeader">
        <h2>Analytics</h2>
        <p>Accuracy by skill/task type plus exam section pass tracking.</p>
      </header>

      <div className="grid two">
        <section className="panel" style={{ padding: "1rem" }}>
          <h3>Task Type Accuracy</h3>
          {snapshot.byTask.length === 0 ? (
            <p>No attempts recorded yet.</p>
          ) : (
            <table className="tableLike">
              <thead>
                <tr>
                  <th>Skill:Type</th>
                  <th>Accuracy</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.byTask.map((row) => (
                  <tr key={row.key}>
                    <td>{row.key}</td>
                    <td>{row.accuracy}%</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ padding: "1rem" }}>
          <h3>Section Outcomes</h3>
          {snapshot.sectionResults.length === 0 ? (
            <p>No section submissions yet.</p>
          ) : (
            <table className="tableLike">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Score</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.sectionResults.map((row) => (
                  <tr key={row.id}>
                    <td>{row.skill}</td>
                    <td>
                      {row.score}/{row.maxScore}
                    </td>
                    <td>{row.passed ? "PASS" : "FAIL"}</td>
                    <td>{row.submittedAt.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="panel" style={{ padding: "1rem" }}>
        <h3>Recent Attempts</h3>
        {snapshot.attempts.length === 0 ? (
          <p>No attempt history yet.</p>
        ) : (
          <table className="tableLike">
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Skill</th>
                <th>Topic</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.attempts.slice(0, 20).map((attempt) => (
                <tr key={attempt.id}>
                  <td>{attempt.submittedAt.toLocaleString()}</td>
                  <td>{attempt.task.id}</td>
                  <td>{attempt.skill}</td>
                  <td>{attempt.task.topic}</td>
                  <td>
                    {attempt.score}/{attempt.maxScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </section>
  );
}
