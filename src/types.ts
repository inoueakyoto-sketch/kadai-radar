export type Subject = "国語" | "数学" | "英語" | "理科" | "社会" | "その他";
export type TaskSource = "manual" | "screenshot";
export type TaskKind = "assignment" | "test";
export type TaskType = "homework" | "submission" | "test";
export type RepeatFrequency = "weekly" | "biweekly" | "monthly";
export type WorkState = "notStarted" | "inProgress";

export type Course = {
  id: string;
  name: string;
  shortName: string;
  subject: Subject;
  builtIn?: boolean;
};

export type TimetableConfig = {
  periods: number;
  courses: Course[];
  /** key: `${weekday}-${period}` where weekday is 1(Mon) ... 5(Fri) */
  slots: Record<string, string>;
};

export type Task = {
  id: string;
  subject: Subject;
  title: string;
  assignedDate: string;
  dueDate: string;
  completed: boolean;
  source: TaskSource;
  createdAt: number;
  kind?: TaskKind;
  taskType?: TaskType;
  lessonId?: string;
  lessonName?: string;
  lessonShortName?: string;
  repeatSeriesId?: string;
  repeatFrequency?: RepeatFrequency;
  repeatIndex?: number;
  /** User has started this task but has not finished it yet. */
  workState?: WorkState;
};

export type TaskDraft = Omit<Task, "id" | "createdAt" | "completed" | "source">;

export const SUBJECTS: Subject[] = ["国語", "数学", "英語", "理科", "社会", "その他"];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  homework: "宿題",
  submission: "提出",
  test: "小テスト"
};

export const DEFAULT_COURSES: Course[] = [
  { id: "jp", name: "国語", shortName: "国", subject: "国語", builtIn: true },
  { id: "math", name: "数学", shortName: "数", subject: "数学", builtIn: true },
  { id: "en", name: "英語", shortName: "英", subject: "英語", builtIn: true },
  { id: "science", name: "理科", shortName: "理", subject: "理科", builtIn: true },
  { id: "social", name: "社会", shortName: "社", subject: "社会", builtIn: true },
  { id: "pe", name: "体育", shortName: "体", subject: "その他", builtIn: true },
  { id: "music", name: "音楽", shortName: "音", subject: "その他", builtIn: true },
  { id: "art", name: "美術", shortName: "美", subject: "その他", builtIn: true },
  { id: "tech", name: "技術", shortName: "技", subject: "その他", builtIn: true },
  { id: "homeec", name: "家庭", shortName: "家", subject: "その他", builtIn: true },
  { id: "homeroom", name: "学活", shortName: "学", subject: "その他", builtIn: true },
  { id: "integrated", name: "総合", shortName: "総", subject: "その他", builtIn: true }
];

export const createDefaultTimetable = (): TimetableConfig => ({
  periods: 6,
  courses: DEFAULT_COURSES.map((course) => ({ ...course })),
  slots: {}
});
