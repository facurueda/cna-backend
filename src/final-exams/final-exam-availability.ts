const FINAL_EXAM_CATALOG_TIME_ZONE = 'America/Argentina/Cordoba';

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: FINAL_EXAM_CATALOG_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isValidFinalExamAvailableUntilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [yearString, monthString, dayString] = value.split('-');
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export function getCurrentFinalExamBusinessDate(now = new Date()) {
  const parts = BUSINESS_DATE_FORMATTER.formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Unable to resolve current business date for final exams');
  }

  return `${year}-${month}-${day}`;
}

export function isFinalExamCatalogClosed(
  availableUntilDate?: string | null,
  now = new Date(),
) {
  if (!availableUntilDate) return false;
  return getCurrentFinalExamBusinessDate(now) > availableUntilDate;
}
