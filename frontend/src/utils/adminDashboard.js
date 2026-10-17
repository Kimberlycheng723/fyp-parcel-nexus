export function malaysiaToday(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function dashboardGreeting(date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "numeric", hourCycle: "h23" }).format(date));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function parcelIconTone(reference) {
  const hash = [...String(reference || "")].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return ["blue", "amber", "rose", "green"][hash % 4];
}

export function roomCollectionRange(period, date = new Date()) {
  const today = malaysiaToday(date), start = new Date(`${today}T00:00:00Z`);
  if (period === "week") start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (period === "month") start.setUTCDate(1);
  return { collected_from: start.toISOString().slice(0, 10), collected_to: today };
}

export function shiftDashboardDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function adminRangeLabel(period, startDate) {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return "Showing selected range";
  const format = (date) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC", day: "2-digit", month: "short", year: "numeric"
  }).format(date);
  if (period === "day") return `Showing ${format(start)}`;
  let end;
  if (period === "week") end = new Date(`${shiftDashboardDate(startDate, 6)}T00:00:00Z`);
  else {
    // The API clamps the next calendar month, whose boundary is exclusive.
    end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(start.getUTCDate(), lastDay) - 1);
  }
  return `Showing ${format(start)} - ${format(end)}`;
}
