import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSeedData } from "../lib/content";

const raw = readFileSync(join(process.cwd(), "prisma", "seed-data", "tasks.json"), "utf-8");
const parsed = parseSeedData(JSON.parse(raw));

const pointsBySkill = new Map<string, number>();
const officialOrders = new Set<number>();
for (const item of parsed) {
  pointsBySkill.set(item.skill, (pointsBySkill.get(item.skill) ?? 0) + item.points);

  if (officialOrders.has(item.metadata.officialOrder)) {
    throw new Error(`Duplicate officialOrder ${item.metadata.officialOrder}`);
  }
  officialOrders.add(item.metadata.officialOrder);
}

for (const [skill, points] of pointsBySkill.entries()) {
  if (points !== 15) {
    throw new Error(`Skill ${skill} must total 15 points; got ${points}`);
  }
}

const sortedOrders = [...officialOrders].sort((a, b) => a - b);
for (let i = 0; i < sortedOrders.length; i += 1) {
  const expected = i + 1;
  if (sortedOrders[i] !== expected) {
    throw new Error(`officialOrder must be contiguous starting at 1. Missing ${expected}`);
  }
}

console.log("Seed data valid.");
