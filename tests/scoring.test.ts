import { computeExamOutcome, evaluateSectionPass, scoreAutoGradedTask } from "@/lib/scoring";

describe("scoreAutoGradedTask", () => {
  it("scores MCQ correctly", () => {
    const questions = [
      { id: "q1", correctAnswer: "A" },
      { id: "q2", correctAnswer: "B" },
    ];

    const result = scoreAutoGradedTask("MCQ", questions, {
      q1: "A",
      q2: "C",
    });

    expect(result.score).toBe(1);
    expect(result.maxScore).toBe(2);
    expect(result.isAutoGraded).toBe(true);
  });

  it("scores matching statements", () => {
    const questions = [
      {
        id: "q1",
        statements: [
          { id: "s1", answer: "A" },
          { id: "s2", answer: "B" },
        ],
      },
    ];

    const result = scoreAutoGradedTask("MATCHING", questions, {
      s1: "A",
      s2: "B",
    });

    expect(result.score).toBe(2);
    expect(result.maxScore).toBe(2);
  });
});

describe("exam outcome", () => {
  it("fails when any skill below 9", () => {
    const outcome = computeExamOutcome([
      evaluateSectionPass("LISTENING", 10),
      evaluateSectionPass("READING", 9),
      evaluateSectionPass("WRITING", 8),
      evaluateSectionPass("SPEAKING", 12),
    ]);

    expect(outcome.passAll).toBe(false);
    expect(outcome.failReasons).toContain("WRITING is below 9/15");
    expect(outcome.failReasonsDetailed[0]?.skill).toBe("WRITING");
    expect(outcome.failReasonsDetailed[0]?.requiredScore).toBe(9);
  });
});
