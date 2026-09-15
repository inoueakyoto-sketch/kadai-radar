import {
  addDays,
  addMonthsKeepingDay,
  parseDateKey,
  todayKey,
  toDateKey
} from "./date";
import type {
  RepeatFrequency,
  Subject,
  TaskDraft,
  TaskKind,
  TaskType
} from "./types";
import { TASK_TYPE_LABELS } from "./types";

export const REPEAT_HORIZON_DAYS = 180;

export const inferKind = (title: string, taskType?: TaskType): TaskKind =>
  taskType === "test" || /(小テスト|テスト|試験|考査)/.test(title) ? "test" : "assignment";

export const buildRecurringDrafts = ({
  subject,
  title,
  dueDate,
  repeatFrequency,
  seriesId,
  baseDate = todayKey(),
  taskType,
  lessonId,
  lessonName,
  lessonShortName
}: {
  subject: Subject;
  title?: string;
  dueDate: string;
  repeatFrequency?: RepeatFrequency;
  seriesId: string;
  baseDate?: string;
  taskType?: TaskType;
  lessonId?: string;
  lessonName?: string;
  lessonShortName?: string;
}): TaskDraft[] => {
  const resolvedTitle = title || (taskType ? TASK_TYPE_LABELS[taskType] : "課題");
  const kind = inferKind(resolvedTitle, taskType);
  const firstDue = parseDateKey(dueDate);

  const base = {
    subject,
    title: resolvedTitle,
    kind,
    taskType,
    lessonId,
    lessonName,
    lessonShortName
  };

  if (!repeatFrequency) {
    return [
      {
        ...base,
        assignedDate: baseDate,
        dueDate
      }
    ];
  }

  const horizon = addDays(firstDue, REPEAT_HORIZON_DAYS);
  const drafts: TaskDraft[] = [];
  let currentDue = firstDue;
  let previousDue: Date | null = null;
  let index = 0;

  while (currentDue <= horizon) {
    drafts.push({
      ...base,
      assignedDate:
        index === 0
          ? baseDate
          : toDateKey(addDays(previousDue ?? currentDue, 1)),
      dueDate: toDateKey(currentDue),
      repeatSeriesId: seriesId,
      repeatFrequency,
      repeatIndex: index
    });

    previousDue = currentDue;
    if (repeatFrequency === "weekly") currentDue = addDays(currentDue, 7);
    if (repeatFrequency === "biweekly") currentDue = addDays(currentDue, 14);
    if (repeatFrequency === "monthly") currentDue = addMonthsKeepingDay(firstDue, index + 1);
    index += 1;
  }

  return drafts;
};
