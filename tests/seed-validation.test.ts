import tasks from "@/prisma/seed-data/tasks.json";
import { parseSeedData } from "@/lib/content";

describe("seed dataset", () => {
  it("has valid schema, official ordering, and 15 points per skill", () => {
    const parsed = parseSeedData(tasks);
    const totals = new Map<string, number>();
    const orders = new Set<number>();

    for (const item of parsed) {
      totals.set(item.skill, (totals.get(item.skill) ?? 0) + item.points);
      orders.add(item.metadata.officialOrder);
    }

    expect(totals.get("listening")).toBe(15);
    expect(totals.get("reading")).toBe(15);
    expect(totals.get("writing")).toBe(15);
    expect(totals.get("speaking")).toBe(15);

    const sorted = [...orders].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[sorted.length - 1]).toBe(parsed.length);
  });
});
