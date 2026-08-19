export function parseDate(dateStr: string | Date): Date {
  if (dateStr instanceof Date) return dateStr;
  if (!dateStr) return new Date();
  let formattedStr = dateStr;
  if (typeof dateStr === "string" && !dateStr.includes("Z") && !dateStr.includes("+")) {
    formattedStr = dateStr.replace(" ", "T") + "Z";
  }
  const parsed = new Date(formattedStr);
  return isNaN(parsed.getTime()) ? new Date(dateStr) : parsed;
}

export function formatMalaysiaDateTime(dateStr: string | Date): string {
  const d = parseDate(dateStr);
  return d.toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatMalaysiaTime(dateStr: string | Date): string {
  const d = parseDate(dateStr);
  return d.toLocaleTimeString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function getMalaysiaDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}
