export function formatHouseholdActivityTime(
  createdAt: string,
  now = new Date(),
  locale?: string,
) {
  const created = new Date(createdAt);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now.getTime() - created.getTime()) / 1000),
  );

  if (Number.isNaN(created.getTime())) return "";
  if (elapsedSeconds < 60) return "Just now";

  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 3_600) {
    return relative.format(-Math.floor(elapsedSeconds / 60), "minute");
  }
  if (elapsedSeconds < 86_400) {
    return relative.format(-Math.floor(elapsedSeconds / 3_600), "hour");
  }
  if (elapsedSeconds < 604_800) {
    return relative.format(-Math.floor(elapsedSeconds / 86_400), "day");
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: created.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(created);
}
