const pad = (value: number) => String(value).padStart(2, "0");

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const todayKey = () => toDateKey(new Date());

export const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const addMonthsKeepingDay = (date: Date, amount: number) => {
  const targetDay = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(targetDay, lastDay));
  return next;
};

export const dateRange = (start: Date, days: number) =>
  Array.from({ length: days }, (_, index) => addDays(start, index));

export const startOfWeekMonday = (date: Date) => {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(date, diff);
};

export const formatMD = (value: string | Date) => {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

export const formatWeekday = (value: string | Date) => {
  const date = typeof value === "string" ? parseDateKey(value) : value;
  return ["日", "月", "火", "水", "木", "金", "土"][date.getDay()];
};

export const formatJapaneseDate = (value: string) => {
  const date = parseDateKey(value);
  return `${date.getMonth() + 1}月${date.getDate()}日（${formatWeekday(date)}）`;
};

export const daysUntil = (value: string) => {
  const now = parseDateKey(todayKey()).getTime();
  const due = parseDateKey(value).getTime();
  return Math.round((due - now) / 86400000);
};
