export function formatMonthLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getCurrentMonthLocal(): string {
  return formatMonthLocal(new Date());
}
