import { formatHouseholdActivityTime } from "./household-activity";

const now = new Date("2026-08-29T12:00:00Z");
const cases = [
  ["2026-08-29T11:59:45Z", "Just now"],
  ["2026-08-29T11:55:00Z", "5 minutes ago"],
  ["2026-08-29T10:00:00Z", "2 hours ago"],
  ["2026-08-28T12:00:00Z", "yesterday"],
] as const;

for (const [createdAt, expected] of cases) {
  const actual = formatHouseholdActivityTime(createdAt, now, "en");
  if (actual !== expected) {
    throw new Error(`${createdAt}: expected ${expected}, received ${actual}`);
  }
}
