/** Taipei-calendar week ending on `date` (inclusive): the 7 days a weekly review covers. */
export function weekWindow(date: string) {
  const end = new Date(`${date}T00:00:00+08:00`).valueOf() + 86_400_000;
  const start = end - 7 * 86_400_000;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
}
