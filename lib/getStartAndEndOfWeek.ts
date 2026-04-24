import { addDays, startOfWeek } from "date-fns";

export function getStartAndEndOfWeek(week: number, year: number) {
  const jan1 = new Date(year, 0, 1);
  const firstMonday = startOfWeek(jan1, { weekStartsOn: 1 });
  const weekStart = addDays(firstMonday, (week - 1) * 7);
  const weekEnd = addDays(weekStart, 6);
  return { weekStart, weekEnd };
}
