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

  // NOTE: Hermes does not support Intl.RelativeTimeFormat, so keep relative labels dependency-free.
  if (elapsedSeconds < 3_600) {
    const minutes = Math.floor(elapsedSeconds / 60);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsedSeconds < 86_400) {
    const hours = Math.floor(elapsedSeconds / 3_600);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsedSeconds < 604_800) {
    const days = Math.floor(elapsedSeconds / 86_400);
    return days === 1 ? "yesterday" : `${days} days ago`;
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: created.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(created);
}
