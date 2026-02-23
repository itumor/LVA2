import { buildFailReasonsDetailed, buildSectionRemediation } from "@/lib/remediation";

describe("buildSectionRemediation", () => {
  it("returns weak areas and recommendations", () => {
    const remediation = buildSectionRemediation({
      skill: "READING",
      attempts: [
        {
          score: 1,
          maxScore: 4,
          task: {
            id: "reading_short_texts_001",
            skill: "READING",
            taskType: "MATCHING",
            topic: "free_time",
          },
        },
      ],
      candidateTasks: [
        {
          id: "reading_short_texts_001",
          skill: "READING",
          taskType: "MATCHING",
          topic: "free_time",
        },
        {
          id: "reading_cloze_001",
          skill: "READING",
          taskType: "CLOZE",
          topic: "food",
        },
      ],
    });

    expect(remediation.weakTaskTypes).toContain("MATCHING");
    expect(remediation.weakTopics).toContain("free_time");
    expect(remediation.recommendedTaskIds.length).toBeGreaterThan(0);
  });
});

describe("buildFailReasonsDetailed", () => {
  it("returns criterion-level details", () => {
    const details = buildFailReasonsDetailed({
      sectionScores: [
        { skill: "LISTENING", score: 8, maxScore: 15, passed: false },
        { skill: "READING", score: 10, maxScore: 15, passed: true },
      ],
    });

    expect(details).toHaveLength(1);
    expect(details[0].skill).toBe("LISTENING");
    expect(details[0].requiredScore).toBe(9);
    expect(details[0].shortfall).toBe(1);
  });
});
