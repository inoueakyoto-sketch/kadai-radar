import { FormEvent, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from "react";
import {
  addDays,
  dateRange,
  daysUntil,
  formatJapaneseDate,
  formatMD,
  formatWeekday,
  parseDateKey,
  startOfWeekMonday,
  todayKey,
  toDateKey
} from "./date";
import {
  SUBJECTS,
  TASK_TYPE_LABELS,
  createDefaultTimetable,
  type Course,
  type RepeatFrequency,
  type Subject,
  type Task,
  type TaskDraft,
  type TaskType,
  type TimetableConfig
} from "./types";
import { buildRecurringDrafts, inferKind } from "./recurrence";

type View = "today" | "all" | "radar" | "timetable" | "add";
type SubjectFilter = "全教科" | Subject;
type DueMode = "next" | "tomorrow" | "date";

type BackupBundle = {
  format: typeof BACKUP_FORMAT;
  appVersion: string;
  exportedAt: string;
  tasks: Task[];
  timetable: TimetableConfig;
};

const TASK_STORAGE_KEY = "study-gantt-tasks-v01";
const TIMETABLE_STORAGE_KEY = "study-gantt-timetable-v01";
const LAST_BACKUP_STORAGE_KEY = "kadai-radar-last-backup-v01";
const BACKUP_FORMAT = "KADAI_RADAR_BACKUP_V1";
const GANTT_DAYS = 7;
const RADAR_SCAN_SECONDS = 4.2;
const RADAR_SCAN_MS = RADAR_SCAN_SECONDS * 1000;
const RADAR_SWEEP_TIP_DEG = 359;
const WEEKDAYS = [
  { value: 1, label: "月" },
  { value: 2, label: "火" },
  { value: 3, label: "水" },
  { value: 4, label: "木" },
  { value: 5, label: "金" }
] as const;

const createTaskId = () => {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") return randomUuid.call(globalThis.crypto);
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const loadLocalTasks = (): Task[] => {
  try {
    const raw = localStorage.getItem(TASK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Task[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const loadLocalTimetable = (): TimetableConfig => {
  try {
    const raw = localStorage.getItem(TIMETABLE_STORAGE_KEY);
    if (!raw) return createDefaultTimetable();
    const parsed = JSON.parse(raw) as TimetableConfig;
    if (!parsed || !Array.isArray(parsed.courses) || typeof parsed.slots !== "object") {
      return createDefaultTimetable();
    }
    return {
      periods: parsed.periods || 6,
      courses: parsed.courses,
      slots: parsed.slots ?? {}
    };
  } catch {
    return createDefaultTimetable();
  }
};

const normalizeTimetable = (value: unknown): TimetableConfig | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TimetableConfig>;
  if (!Array.isArray(candidate.courses) || !candidate.slots || typeof candidate.slots !== "object") return null;
  const periods = Number(candidate.periods);
  if (![5, 6, 7].includes(periods)) return null;
  return { periods, courses: candidate.courses as Course[], slots: candidate.slots as Record<string, string> };
};

const normalizeBackup = (value: unknown): BackupBundle | null => {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BackupBundle>;
  if (candidate.format !== BACKUP_FORMAT || !Array.isArray(candidate.tasks)) return null;
  const timetable = normalizeTimetable(candidate.timetable);
  if (!timetable) return null;
  return {
    format: BACKUP_FORMAT,
    appVersion: typeof candidate.appVersion === "string" ? candidate.appVersion : "unknown",
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
    tasks: candidate.tasks as Task[],
    timetable
  };
};

const formatBackupTime = (value: string | null) => {
  if (!value) return "まだバックアップしていません";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "バックアップ日時不明";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const subjectClass = (subject: Subject) =>
  ({
    国語: "subject-japanese",
    数学: "subject-math",
    英語: "subject-english",
    理科: "subject-science",
    社会: "subject-social",
    その他: "subject-other"
  })[subject];

const subjectShort = (subject: Subject) =>
  ({ 国語: "国", 数学: "数", 英語: "英", 理科: "理", 社会: "社", その他: "他" })[subject];

const taskKind = (task: Task) => task.kind ?? inferKind(task.title, task.taskType);
const taskTypeOf = (task: Task): TaskType | null =>
  task.taskType ?? (taskKind(task) === "test" ? "test" : null);
const courseNameOf = (task: Task) => task.lessonName || task.subject;
const courseShortOf = (task: Task) => task.lessonShortName || subjectShort(task.subject);
const taskLabelOf = (task: Task) => {
  const type = taskTypeOf(task);
  return type ? TASK_TYPE_LABELS[type] : task.title;
};
const taskDisplayOf = (task: Task) => `${courseNameOf(task)}｜${taskLabelOf(task)}`;

const repeatLabel = (frequency?: RepeatFrequency) => {
  if (frequency === "weekly") return "毎週";
  if (frequency === "biweekly") return "隔週";
  if (frequency === "monthly") return "毎月";
  return "";
};

const isOpenTask = (task: Task) =>
  !task.completed && !(taskKind(task) === "test" && daysUntil(task.dueDate) < 0);

const isRecommendationCandidate = (task: Task) =>
  isOpenTask(task) && (!task.repeatFrequency || daysUntil(task.dueDate) <= 0);

const dueLabel = (task: Task) => {
  const remaining = daysUntil(task.dueDate);
  if (remaining < 0) return "期限を過ぎています";
  if (remaining === 0) return taskKind(task) === "test" ? "今日" : "今日まで";
  if (remaining === 1) return taskKind(task) === "test" ? "明日" : "明日まで";
  return taskKind(task) === "test"
    ? `${formatMD(task.dueDate)}に実施`
    : `${formatMD(task.dueDate)}まで`;
};

const buildDueCounts = (tasks: Task[]) => {
  const counts = new Map<string, number>();
  tasks.filter(isOpenTask).forEach((task) => {
    counts.set(task.dueDate, (counts.get(task.dueDate) ?? 0) + 1);
  });
  return counts;
};

const slotKey = (weekday: number, period: number) => `${weekday}-${period}`;

const timetableHasSlots = (timetable: TimetableConfig) =>
  Object.values(timetable.slots).some(Boolean);

const usedCourses = (timetable: TimetableConfig) => {
  const ids: string[] = [];
  for (let weekday = 1; weekday <= 5; weekday += 1) {
    for (let period = 1; period <= timetable.periods; period += 1) {
      const id = timetable.slots[slotKey(weekday, period)];
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids
    .map((id) => timetable.courses.find((course) => course.id === id))
    .filter(Boolean) as Course[];
};

const nextLessonForCourse = (courseId: string, timetable: TimetableConfig) => {
  const start = parseDateKey(todayKey());
  for (let offset = 1; offset <= 21; offset += 1) {
    const date = addDays(start, offset);
    const weekday = date.getDay();
    if (weekday < 1 || weekday > 5) continue;
    for (let period = 1; period <= timetable.periods; period += 1) {
      if (timetable.slots[slotKey(weekday, period)] === courseId) {
        return { dateKey: toDateKey(date), weekday, period };
      }
    }
  }
  return null;
};

const autoShortName = (name: string, subject: Subject) => {
  const compact = name.replace(/\s+/g, "").trim();
  const tail = compact.match(/[A-Za-z0-9]$/)?.[0];
  if (tail) return `${subjectShort(subject)}${tail}`;
  return compact.slice(0, 2) || subjectShort(subject);
};


type RadarQuadrant = "today" | "tomorrow" | "week" | "later";

type RadarPoint = {
  task: Task;
  x: number;
  y: number;
  angleDeg: number;
  radius: number;
  quadrant: RadarQuadrant;
};

type RadarMarker = {
  id: string;
  points: RadarPoint[];
  x: number;
  y: number;
  angleDeg: number;
  quadrant: RadarQuadrant;
  representative: RadarPoint;
};

const stableHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const collapseRadarRoutineTasks = (tasks: Task[]) => {
  const openTasks = tasks.filter(isOpenTask);
  const standardTasks = openTasks.filter((task) => !task.repeatFrequency);
  const routineBySeries = new Map<string, Task>();

  openTasks
    .filter((task) => Boolean(task.repeatFrequency))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
    .forEach((task) => {
      const seriesKey = task.repeatSeriesId
        ?? `${task.lessonId ?? task.lessonName ?? task.subject}|${task.title}|${task.repeatFrequency}`;
      if (!routineBySeries.has(seriesKey)) routineBySeries.set(seriesKey, task);
    });

  return [...standardTasks, ...routineBySeries.values()]
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
};

const radarQuadrantOf = (task: Task): RadarQuadrant => {
  const remaining = daysUntil(task.dueDate);
  if (remaining <= 0) return "today";
  if (remaining === 1) return "tomorrow";
  const today = parseDateKey(todayKey());
  const daysToSunday = (7 - today.getDay()) % 7;
  const endOfWeek = toDateKey(addDays(today, daysToSunday));
  return task.dueDate <= endOfWeek ? "week" : "later";
};

const radarRadiusFor = (task: Task, quadrant: RadarQuadrant) => {
  const remaining = daysUntil(task.dueDate);
  const jitter = (stableHash(task.id) % 9) - 4;
  if (quadrant === "today") {
    if (remaining < 0) return Math.max(17, 24 + remaining * 2) + jitter * 0.35;
    return 31 + jitter * 0.45;
  }
  if (quadrant === "tomorrow") return 46 + jitter * 0.55;
  if (quadrant === "week") return Math.min(68, 53 + Math.max(0, remaining - 2) * 3.2) + jitter * 0.45;
  return Math.min(88, 73 + Math.max(0, remaining - 7) * 0.8) + jitter * 0.35;
};

const buildRadarPoints = (tasks: Task[]): RadarPoint[] => {
  const groups: Record<RadarQuadrant, Task[]> = {
    today: [],
    tomorrow: [],
    week: [],
    later: []
  };
  tasks.filter(isOpenTask).forEach((task) => groups[radarQuadrantOf(task)].push(task));
  Object.values(groups).forEach((group) => group.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id)));

  const ranges: Record<RadarQuadrant, [number, number]> = {
    today: [190, 260],
    tomorrow: [280, 350],
    week: [100, 170],
    later: [10, 80]
  };

  const result: RadarPoint[] = [];
  (Object.keys(groups) as RadarQuadrant[]).forEach((quadrant) => {
    const group = groups[quadrant];
    const [startAngle, endAngle] = ranges[quadrant];
    const span = endAngle - startAngle;
    group.forEach((task, index) => {
      const base = startAngle + span * ((index + 1) / (group.length + 1));
      const angleJitter = ((stableHash(`${task.id}-angle`) % 1000) / 1000 - 0.5) * Math.min(8, span / Math.max(3, group.length));
      const angle = (base + angleJitter) * Math.PI / 180;
      const radius = radarRadiusFor(task, quadrant);
      result.push({
        task,
        quadrant,
        angleDeg: (base + angleJitter + 360) % 360,
        radius,
        x: 50 + Math.cos(angle) * radius * 0.48,
        y: 50 + Math.sin(angle) * radius * 0.48
      });
    });
  });
  return result;
};

const radarTargetClass = (task: Task) => {
  if (task.repeatFrequency) return "radar-target-routine";
  const type = taskTypeOf(task);
  if (type === "test") return "radar-target-test";
  if (type === "submission") return "radar-target-submission";
  return "radar-target-homework";
};

const radarUrgencyClass = (task: Task) => {
  const remaining = daysUntil(task.dueDate);
  if (remaining <= 0) return "urgency-critical";
  if (remaining === 1) return "urgency-soon";
  if (remaining <= 7) return "urgency-watch";
  return "urgency-distant";
};

const buildRadarMarkers = (points: RadarPoint[]): RadarMarker[] => {
  const byDate = new Map<string, RadarPoint[]>();
  points.forEach((point) => {
    const key = `${point.quadrant}|${point.task.dueDate}`;
    const group = byDate.get(key) ?? [];
    group.push(point);
    byDate.set(key, group);
  });

  const markers: RadarMarker[] = [];
  byDate.forEach((group, key) => {
    if (group.length >= 3) {
      const x = group.reduce((sum, point) => sum + point.x, 0) / group.length;
      const y = group.reduce((sum, point) => sum + point.y, 0) / group.length;
      const representative = [...group].sort((a, b) => daysUntil(a.task.dueDate) - daysUntil(b.task.dueDate))[0];
      const angleDeg = (Math.atan2(y - 50, x - 50) * 180 / Math.PI + 360) % 360;
      markers.push({ id: `cluster-${key}`, points: group, x, y, angleDeg, quadrant: representative.quadrant, representative });
      return;
    }
    group.forEach((point) => markers.push({
      id: point.task.id,
      points: [point],
      x: point.x,
      y: point.y,
      angleDeg: point.angleDeg,
      quadrant: point.quadrant,
      representative: point
    }));
  });
  return markers.sort((a, b) => a.representative.task.dueDate.localeCompare(b.representative.task.dueDate) || a.id.localeCompare(b.id));
};

const radarSweepTimelineDelay = (nowMs: number) =>
  `${-((nowMs % RADAR_SCAN_MS) / 1000).toFixed(3)}s`;

const radarSweepDelay = (angleDeg: number, nowMs: number) => {
  // Radar point angles use 0deg at 3 o'clock and increase clockwise because y grows downward.
  // CSS conic-gradient uses 0deg at 12 o'clock. Its brightest scan tip is authored at 359deg,
  // so calculate the exact rotation at which that tip overlaps the rendered point.
  const cssPointAngleDeg = (angleDeg + 90 + 360) % 360;
  const sweepRotationAtPassDeg = (cssPointAngleDeg - RADAR_SWEEP_TIP_DEG + 360) % 360;
  const passAtMs = (sweepRotationAtPassDeg / 360) * RADAR_SCAN_MS;
  const timelineAtMs = ((nowMs % RADAR_SCAN_MS) + RADAR_SCAN_MS) % RADAR_SCAN_MS;
  // The flash keyframe peaks at 0%/100%. Start the target animation at the
  // exact phase where 0% occurs when the sweep reaches this point.
  const elapsedSincePassMs = (timelineAtMs - passAtMs + RADAR_SCAN_MS) % RADAR_SCAN_MS;
  return `${-(elapsedSincePassMs / 1000).toFixed(3)}s`;
};

function App() {
  const [view, setView] = useState<View>("today");
  const [tasks, setTasks] = useState<Task[]>(() => loadLocalTasks());
  const [timetable, setTimetable] = useState<TimetableConfig>(() => loadLocalTimetable());
  const [message, setMessage] = useState("");
  const [storageError, setStorageError] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [undoTask, setUndoTask] = useState<Task | null>(null);
  const [quickCourseId, setQuickCourseId] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(LAST_BACKUP_STORAGE_KEY));

  useEffect(() => {
    try {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
      setStorageError("");
    } catch {
      setStorageError("このブラウザでは課題データを端末内に保存できません。通常モードで開いてください。");
    }
  }, [tasks]);

  useEffect(() => {
    try {
      localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(timetable));
      setStorageError("");
    } catch {
      setStorageError("このブラウザでは時間割を端末内に保存できません。通常モードで開いてください。");
    }
  }, [timetable]);

  const visibleTasks = useMemo(
    () =>
      tasks
        .filter((task) => (showCompleted ? true : isOpenTask(task)))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks, showCompleted]
  );

  const dueCounts = useMemo(() => buildDueCounts(tasks), [tasks]);

  const nextCrowdedDate = useMemo(() => {
    const start = parseDateKey(todayKey());
    return (
      dateRange(start, 14)
        .map((date) => {
          const key = toDateKey(date);
          return { key, count: dueCounts.get(key) ?? 0 };
        })
        .filter((item) => item.count >= 2)
        .sort((a, b) => a.key.localeCompare(b.key))[0] ?? null
    );
  }, [dueCounts]);

  const recommendations = useMemo(() => {
    const pending = tasks.filter(isRecommendationCandidate);
    return [...pending]
      .sort((a, b) => {
        const dayA = daysUntil(a.dueDate);
        const dayB = daysUntil(b.dueDate);
        if (dayA !== dayB) return dayA - dayB;
        return (dueCounts.get(b.dueDate) ?? 0) - (dueCounts.get(a.dueDate) ?? 0);
      })
      .slice(0, 3);
  }, [tasks, dueCounts]);

  const addTasks = async (drafts: TaskDraft[]) => {
    const taskBodies = drafts.map((draft) => ({
      ...draft,
      completed: false,
      source: "manual" as const
    }));

    const now = Date.now();
    const localTasks: Task[] = taskBodies.map((task, index) => ({
      ...task,
      id: createTaskId(),
      createdAt: now + index
    }));
    setTasks((current) => [...current, ...localTasks]);

    setMessage(drafts.length > 1 ? `${drafts.length}回分を登録しました` : "登録しました");
    window.setTimeout(() => setMessage(""), 1800);
    setQuickCourseId(null);
    setView("all");
  };

  const saveTimetable = async (next: TimetableConfig) => {
    setTimetable(next);
    setMessage("時間割を保存しました");
    window.setTimeout(() => setMessage(""), 1600);
  };

  const setCompleted = async (task: Task, completed: boolean) => {
    setTasks((current) =>
      current.map((item) => (item.id === task.id ? { ...item, completed } : item))
    );
  };

  const completeTask = async (task: Task) => {
    await setCompleted(task, true);
    setUndoTask(task);
    window.setTimeout(() => {
      setUndoTask((current) => (current?.id === task.id ? null : current));
    }, 5000);
  };

  const undoComplete = async () => {
    if (!undoTask) return;
    const task = undoTask;
    setUndoTask(null);
    await setCompleted(task, false);
  };

  const updateTask = async (
    task: Task,
    values: Partial<Omit<Task, "id" | "createdAt" | "completed" | "source">>,
    applyToSeries: boolean
  ) => {
    const futureSeriesTasks =
      applyToSeries && task.repeatSeriesId
        ? tasks.filter(
            (item) =>
              item.repeatSeriesId === task.repeatSeriesId &&
              item.dueDate >= task.dueDate &&
              item.id !== task.id
          )
        : [];

    const futureIds = new Set(futureSeriesTasks.map((item) => item.id));
    setTasks((current) =>
      current.map((item) => {
        if (item.id === task.id) return { ...item, ...values };
        if (futureIds.has(item.id)) {
          const seriesValues = { ...values };
          delete seriesValues.dueDate;
          return { ...item, ...seriesValues };
        }
        return item;
      })
    );

    setEditingTask(null);
    setMessage(applyToSeries && futureSeriesTasks.length > 0 ? "今後の予定も修正しました" : "修正しました");
    window.setTimeout(() => setMessage(""), 1600);
  };

  const removeTask = async (task: Task) => {
    if (!window.confirm(`「${taskDisplayOf(task)}」を削除しますか？`)) return;
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setEditingTask(null);
    setMessage("削除しました");
    window.setTimeout(() => setMessage(""), 1400);
  };

  const removeSeries = async (task: Task) => {
    if (!task.repeatSeriesId) return removeTask(task);
    const seriesTasks = tasks.filter((item) => item.repeatSeriesId === task.repeatSeriesId);
    if (!window.confirm(`「${taskDisplayOf(task)}」の繰り返し予定をすべて削除しますか？`)) return;
    const ids = new Set(seriesTasks.map((item) => item.id));
    setTasks((current) => current.filter((item) => !ids.has(item.id)));
    setEditingTask(null);
    setMessage("繰り返し予定を削除しました");
    window.setTimeout(() => setMessage(""), 1600);
  };

  const exportBackup = () => {
    const exportedAt = new Date().toISOString();
    const bundle: BackupBundle = {
      format: BACKUP_FORMAT,
      appVersion: "0.6.2",
      exportedAt,
      tasks,
      timetable
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kadai-radar-backup-${todayKey()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    localStorage.setItem(LAST_BACKUP_STORAGE_KEY, exportedAt);
    setLastBackupAt(exportedAt);
    setMessage("バックアップを保存しました");
    window.setTimeout(() => setMessage(""), 1800);
  };

  const restoreBackup = async (file: File) => {
    try {
      const raw = await file.text();
      const parsed = normalizeBackup(JSON.parse(raw));
      if (!parsed) throw new Error("invalid backup");
      const ok = window.confirm(
        `バックアップから復元しますか？\n\n課題 ${parsed.tasks.length}件\n現在の課題・時間割は上書きされます。`
      );
      if (!ok) return;
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(parsed.tasks));
      localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(parsed.timetable));
      setTasks(parsed.tasks);
      setTimetable(parsed.timetable);
      setEditingTask(null);
      setUndoTask(null);
      setView("today");
      setMessage("バックアップから復元しました");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      window.alert("このファイルは課題レーダーのバックアップとして読み込めません。");
    }
  };

  const openAdd = (courseId?: string) => {
    setQuickCourseId(courseId ?? null);
    setView("add");
  };

  return (
    <div className={`app-shell ${view === "radar" ? "radar-mode" : ""}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">{view === "radar" ? "LIVE TASK RADAR" : "予定だけ、忘れない"}</p>
          <h1>課題レーダー</h1>
        </div>
        <span className="storage-dot local">このスマホ</span>
      </header>

      {storageError && <div className="notice warning">{storageError}</div>}

      <main className="main">
        {view === "today" && (
          <TodayView
            tasks={recommendations}
            crowdedDate={nextCrowdedDate}
            onComplete={completeTask}
            onEdit={setEditingTask}
            onOpenAll={() => setView("all")}
          />
        )}
        {view === "all" && (
          <AllView
            tasks={visibleTasks}
            showCompleted={showCompleted}
            onShowCompleted={setShowCompleted}
            onEdit={setEditingTask}
          />
        )}
        {view === "radar" && (
          <RadarView
            tasks={tasks}
            onEdit={setEditingTask}
            onOpenAll={() => setView("all")}
          />
        )}
        {view === "timetable" && (
          <TimetableView
            timetable={timetable}
            onSave={saveTimetable}
            onQuickAdd={(courseId) => openAdd(courseId)}
            onExportBackup={exportBackup}
            onRestoreBackup={restoreBackup}
            lastBackupAt={lastBackupAt}
          />
        )}
        {view === "add" && (
          <AddView
            timetable={timetable}
            initialCourseId={quickCourseId}
            onAdd={addTasks}
            onOpenTimetable={() => setView("timetable")}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        <NavButton active={view === "today"} symbol="●" label="今日" onClick={() => setView("today")} />
        <NavButton active={view === "all"} symbol="▦" label="全体" onClick={() => setView("all")} />
        <NavButton active={view === "radar"} symbol="⌖" label="レーダー" onClick={() => setView("radar")} />
        <NavButton active={view === "timetable"} symbol="▦" label="時間割" onClick={() => setView("timetable")} />
        <NavButton active={view === "add"} symbol="＋" label="追加" onClick={() => openAdd()} />
      </nav>

      {message && <div className="toast">{message}</div>}
      {undoTask && (
        <div className="undo-toast">
          <span>✓ 完了しました</span>
          <button type="button" onClick={undoComplete}>元に戻す</button>
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          timetable={timetable}
          onSave={updateTask}
          onDelete={removeTask}
          onDeleteSeries={removeSeries}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}

function ScreenTitle({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="screen-title-row">
      <div className="screen-title">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function TodayView({
  tasks,
  crowdedDate,
  onComplete,
  onEdit,
  onOpenAll
}: {
  tasks: Task[];
  crowdedDate: { key: string; count: number } | null;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onOpenAll: () => void;
}) {
  const first = tasks[0];
  const later = tasks.slice(1);
  return (
    <section className="screen">
      <ScreenTitle title="今日" subtitle={formatJapaneseDate(todayKey())} />
      {crowdedDate && daysUntil(crowdedDate.key) > 1 && (
        <button type="button" className="crowded-card" onClick={onOpenAll}>
          <div className="crowded-number">{crowdedDate.count}</div>
          <div>
            <strong>{formatMD(crowdedDate.key)}に{crowdedDate.count}つあります</strong>
            <p>先に1つ終わらせると、あとがラクです。</p>
          </div>
        </button>
      )}
      {!first ? (
        <div className="empty-card">
          <strong>今すぐやる課題はありません</strong>
          <p>ルーティン予定は当日になるとここに出ます。</p>
        </div>
      ) : (
        <>
          <div className="section-heading"><h3>まずこれ</h3></div>
          <TaskCard task={first} primary onComplete={onComplete} onEdit={onEdit} />
          {later.length > 0 && (
            <>
              <div className="section-heading secondary-heading"><h3>余裕があったら</h3><span>あと{later.length}つ</span></div>
              <div className="task-stack">
                {later.map((task) => <TaskCard key={task.id} task={task} onComplete={onComplete} onEdit={onEdit} />)}
              </div>
            </>
          )}
        </>
      )}
      <button type="button" className="quiet-button" onClick={onOpenAll}>全体を見る</button>
    </section>
  );
}

function TaskCard({ task, primary = false, onComplete, onEdit }: {
  task: Task;
  primary?: boolean;
  onComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
}) {
  const kind = taskKind(task);
  const canCompleteTest = kind !== "test" || daysUntil(task.dueDate) <= 0;
  return (
    <article className={`task-card ${primary ? "primary-task-card" : ""} ${subjectClass(task.subject)}`}>
      <div className="task-card-top">
        <div className="task-card-meta-left">
          <span className={`subject-badge ${subjectClass(task.subject)}`}>{courseNameOf(task)}</span>
          {task.repeatFrequency && <span className="repeat-badge">↻ {repeatLabel(task.repeatFrequency)}</span>}
        </div>
        <button type="button" className="inline-edit-button" onClick={() => onEdit(task)}>修正</button>
      </div>
      <h3>{taskLabelOf(task)}</h3>
      <div className="task-due-row"><strong>{dueLabel(task)}</strong></div>
      {canCompleteTest ? (
        <button type="button" className="done-button" onClick={() => onComplete(task)}>✓ {kind === "test" ? "終わった" : "できた"}</button>
      ) : (
        <div className="test-reminder">当日まで予定に残します</div>
      )}
    </article>
  );
}

function AllView({ tasks, showCompleted, onShowCompleted, onEdit }: {
  tasks: Task[];
  showCompleted: boolean;
  onShowCompleted: (value: boolean) => void;
  onEdit: (task: Task) => void;
}) {
  const [filter, setFilter] = useState<SubjectFilter>("全教科");
  const [weekOffset, setWeekOffset] = useState(0);
  const filtered = useMemo(
    () => tasks.filter((task) => filter === "全教科" || task.subject === filter),
    [tasks, filter]
  );
  const pendingFiltered = filtered.filter(isOpenTask);
  const dueCounts = useMemo(() => buildDueCounts(filtered), [filtered]);
  const currentMonday = startOfWeekMonday(parseDateKey(todayKey()));
  const weekStart = addDays(currentMonday, weekOffset * 7);

  return (
    <section className="screen">
      <ScreenTitle title="全体" subtitle="何があり、いつまでかだけを見る" />
      <div className="subject-filter">
        {(["全教科", ...SUBJECTS] as SubjectFilter[]).map((subject) => (
          <button
            key={subject}
            type="button"
            className={`filter-chip ${filter === subject ? "selected" : ""} ${subject === "全教科" ? "" : subjectClass(subject)}`}
            onClick={() => setFilter(subject)}
          >{subject}</button>
        ))}
      </div>
      <TwoWeekLoadMap
        tasks={pendingFiltered}
        onSelectDate={(key) => {
          const chosenWeek = startOfWeekMonday(parseDateKey(key));
          const difference = Math.round((chosenWeek.getTime() - currentMonday.getTime()) / (7 * 86400000));
          setWeekOffset(difference);
        }}
      />
      <div className="week-nav">
        <button type="button" onClick={() => setWeekOffset((value) => value - 1)}>‹ 前の週</button>
        <button type="button" className="week-current" onClick={() => setWeekOffset(0)}>{weekOffset === 0 ? "今週" : `${formatMD(weekStart)}〜`}</button>
        <button type="button" onClick={() => setWeekOffset((value) => value + 1)}>次の週 ›</button>
      </div>
      <div className="gantt-legend">
        <span><i className="legend-bar" />単発課題</span>
        <span><i className="legend-routine">●</i>ルーティン提出</span>
        <span><i className="legend-routine">★</i>ルーティン小テスト</span>
      </div>
      <Gantt tasks={filtered} dueCounts={dueCounts} start={weekStart} emptyText={`${filter}の課題はありません`} onEdit={onEdit} />
      <CompletedToggle checked={showCompleted} onChange={onShowCompleted} />
    </section>
  );
}

function TwoWeekLoadMap({ tasks, onSelectDate }: { tasks: Task[]; onSelectDate: (key: string) => void }) {
  const dates = dateRange(parseDateKey(todayKey()), 14);
  const counts = buildDueCounts(tasks);
  const max = Math.max(1, ...dates.map((date) => counts.get(toDateKey(date)) ?? 0));
  return (
    <div className="load-card">
      <div className="load-card-head"><strong>これから2週間</strong><span>多い日をタップ</span></div>
      <div className="load-strip">
        {dates.map((date) => {
          const key = toDateKey(date);
          const count = counts.get(key) ?? 0;
          const level = count === 0 ? 0 : Math.max(1, Math.ceil((count / max) * 4));
          return (
            <button type="button" key={key} className={`load-day level-${level} ${count >= 3 ? "crowded" : ""}`} onClick={() => onSelectDate(key)}>
              <small>{date.getDate()}</small><b>{count || "·"}</b>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Gantt({ tasks, dueCounts, start, emptyText = "表示する課題がありません", onEdit }: {
  tasks: Task[];
  dueCounts: Map<string, number>;
  start: Date;
  emptyText?: string;
  onEdit: (task: Task) => void;
}) {
  const dates = dateRange(start, GANTT_DAYS);
  const dateKeys = dates.map(toDateKey);
  const startKey = dateKeys[0];
  const endKey = dateKeys[dateKeys.length - 1];
  const inWindow = tasks.filter((task) => task.dueDate >= startKey && task.assignedDate <= endKey);
  const routineTasks = inWindow.filter((task) => Boolean(task.repeatFrequency));
  const standardTasks = inWindow.filter((task) => !task.repeatFrequency);

  if (inWindow.length === 0) return <div className="empty-card gantt-empty"><strong>{emptyText}</strong><p>「＋」から登録できます。</p></div>;
  const template = `repeat(${GANTT_DAYS}, minmax(0, 1fr))`;

  return (
    <div className="gantt-wrap">
      {routineTasks.length > 0 && (
        <div className="gantt-grid routine-strip" style={{ gridTemplateColumns: template }}>
          {dates.map((date, index) => {
            const key = toDateKey(date);
            const dayTasks = routineTasks.filter((task) => task.dueDate === key);
            return (
              <div key={key} className="routine-day" style={{ gridColumn: `${index + 1} / ${index + 2}` }}>
                {dayTasks.map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    className={`routine-day-chip ${subjectClass(task.subject)} ${taskKind(task) === "test" ? "routine-day-chip-test" : ""}`}
                    onClick={() => onEdit(task)}
                    title={taskDisplayOf(task)}
                  >
                    <span>{taskKind(task) === "test" ? "★" : "●"}</span>
                    <span>{courseShortOf(task)}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <div className="gantt-grid gantt-header" style={{ gridTemplateColumns: template }}>
        {dates.map((date, index) => {
          const key = toDateKey(date);
          const count = dueCounts.get(key) ?? 0;
          return (
            <div key={key} className={`date-head ${count >= 3 ? "busy" : ""}`} style={{ gridColumn: `${index + 1} / ${index + 2}` }}>
              <span>{date.getDate()}</span><small>{formatWeekday(date)}</small><b className={count > 0 ? "has-count" : ""}>{count > 0 ? count : "·"}</b>
            </div>
          );
        })}
      </div>
      {standardTasks.map((task) => {
        const clippedStart = task.assignedDate < startKey ? startKey : task.assignedDate;
        const clippedEnd = task.dueDate > endKey ? endKey : task.dueDate;
        const startIndex = dateKeys.indexOf(clippedStart);
        const endIndex = dateKeys.indexOf(clippedEnd);
        return (
          <div key={task.id} className="gantt-grid gantt-row" style={{ gridTemplateColumns: template }}>
            {dates.map((date, index) => {
              const key = toDateKey(date);
              const count = dueCounts.get(key) ?? 0;
              return <div key={key} className={`gantt-cell ${count >= 3 ? "busy-column" : ""}`} style={{ gridColumn: `${index + 1} / ${index + 2}`, gridRow: "1" }} />;
            })}
            {startIndex >= 0 && endIndex >= 0 && (
              <button
                type="button"
                className={`gantt-bar gantt-bar-button ${subjectClass(task.subject)}`}
                style={{ gridColumn: `${startIndex + 1} / ${endIndex + 2}` }}
                onClick={() => onEdit(task)}
                title={taskDisplayOf(task)}
              >
                <span className="gantt-bar-text">{taskDisplayOf(task)}</span><span className="due-dot" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}


function RadarView({ tasks, onEdit, onOpenAll }: {
  tasks: Task[];
  onEdit: (task: Task) => void;
  onOpenAll: () => void;
}) {
  const radarTasks = useMemo(() => collapseRadarRoutineTasks(tasks), [tasks]);
  const points = useMemo(() => buildRadarPoints(radarTasks), [radarTasks]);
  const markers = useMemo(() => buildRadarMarkers(points), [points]);
  const counts = useMemo(() => {
    const next = { today: 0, tomorrow: 0, week: 0, later: 0 };
    points.forEach((point) => { next[point.quadrant] += 1; });
    return next;
  }, [points]);
  const overdueCount = radarTasks.filter((task) => daysUntil(task.dueDate) < 0).length;
  const todayCount = radarTasks.filter((task) => daysUntil(task.dueDate) === 0).length;
  const tomorrowCount = radarTasks.filter((task) => daysUntil(task.dueDate) === 1).length;
  const urgentCount = overdueCount + todayCount + tomorrowCount;
  const weekCount = counts.today + counts.tomorrow + counts.week;
  const risk = overdueCount > 0 || urgentCount >= 3 || weekCount >= 6
    ? "danger"
    : urgentCount >= 1 || weekCount >= 4
      ? "caution"
      : "calm";
  const riskLabel = overdueCount > 0
    ? `期限切れ ${overdueCount}件`
    : risk === "danger"
      ? `要注意 ${Math.max(urgentCount, weekCount)}件`
      : risk === "caution"
        ? `注意 ${Math.max(urgentCount, weekCount)}件`
        : "平常";

  const closestTask = useMemo(() => {
    return [...radarTasks].sort((a, b) => {
      const dayDifference = daysUntil(a.dueDate) - daysUntil(b.dueDate);
      if (dayDifference !== 0) return dayDifference;
      return a.id.localeCompare(b.id);
    })[0] ?? null;
  }, [radarTasks]);

  const busiest = useMemo(() => {
    const dueCounts = new Map<string, number>();
    radarTasks.forEach((task) => dueCounts.set(task.dueDate, (dueCounts.get(task.dueDate) ?? 0) + 1));
    return [...dueCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? null;
  }, [radarTasks]);

  const updatedAt = useMemo(() => new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }), [radarTasks.length]);
  const radarTimelineNow = Date.now();
  const radarTimelineDelay = radarSweepTimelineDelay(radarTimelineNow);

  return (
    <section className="screen radar-screen">
      <div className="radar-intro">
        <div>
          <p className="radar-kicker">LIVE TASK SCAN</p>
          <h2>課題の接近状況</h2>
          <p>近い予定ほど中心へ。たまるほど信号が強くなります。</p>
        </div>
        <button type="button" className={`radar-status-pill ${risk}`} onClick={onOpenAll}>
          <span className="radar-status-light" />
          {riskLabel}
        </button>
      </div>

      <div className="radar-console">
        <div className="radar-console-topline">
          <span>RANGE 14D+</span>
          <span>TRACK {radarTasks.length.toString().padStart(2, "0")}</span>
          <span>UPDATE {updatedAt}</span>
        </div>

        <div className="radar-metrics" aria-label="レーダー計器">
          <div><span>CLOSEST</span><strong>{closestTask ? taskDisplayOf(closestTask) : "CLEAR"}</strong><small>{closestTask ? dueLabel(closestTask) : "接近課題なし"}</small></div>
          <div><span>HOT ZONE</span><strong>{busiest ? `${formatMD(busiest[0])}・${busiest[1]}件` : "CLEAR"}</strong><small>同日予定の最大数</small></div>
          <div><span>SIGNAL</span><strong>{radarTasks.length.toString().padStart(2, "0")}</strong><small>現在の検知数</small></div>
        </div>

        <div className="radar-stage-wrap">
          <div className="radar-label radar-label-tl"><strong>今日・期限切れ</strong><span>{counts.today}</span></div>
          <div className="radar-label radar-label-tr"><strong>明日</strong><span>{counts.tomorrow}</span></div>
          <div className="radar-label radar-label-bl"><strong>今週</strong><span>{counts.week}</span></div>
          <div className="radar-label radar-label-br"><strong>来週以降</strong><span>{counts.later}</span></div>

          <div className="radar-face" aria-label="課題レーダー">
            <div className="radar-grid" />
            <div className="radar-ring ring-1" />
            <div className="radar-ring ring-2" />
            <div className="radar-ring ring-3" />
            <span className="radar-zone-label zone-danger">DANGER</span>
            <span className="radar-zone-label zone-caution">CAUTION</span>
            <span className="radar-zone-label zone-safe">SAFE</span>
            <div className="radar-cross radar-cross-h" />
            <div className="radar-cross radar-cross-v" />
            <div className="radar-ticks" />
            <div className="radar-sweep-trail" style={{ "--scan-timeline-delay": radarTimelineDelay } as CSSProperties} />
            <div className="radar-sweep" style={{ "--scan-timeline-delay": radarTimelineDelay } as CSSProperties} />
            <div className="radar-center"><span /></div>

            {markers.map((marker) => {
              const point = marker.representative;
              const task = point.task;
              const isCluster = marker.points.length >= 3;
              if (isCluster) {
                return (
                  <button
                    type="button"
                    key={marker.id}
                    className={`radar-cluster ${radarUrgencyClass(task)}`}
                    style={{ left: `${marker.x}%`, top: `${marker.y}%`, "--scan-delay": radarSweepDelay(marker.angleDeg, radarTimelineNow) } as CSSProperties}
                    onClick={onOpenAll}
                    aria-label={`${formatMD(task.dueDate)}に${marker.points.length}件。全体を開く`}
                    title={`${formatMD(task.dueDate)}｜${marker.points.length}件`}
                  >
                    +{marker.points.length}
                  </button>
                );
              }
              return (
                <button
                  type="button"
                  key={marker.id}
                  className={`radar-target ${radarTargetClass(task)} ${subjectClass(task.subject)} ${radarUrgencyClass(task)}`}
                  style={{ left: `${marker.x}%`, top: `${marker.y}%`, "--scan-delay": radarSweepDelay(marker.angleDeg, radarTimelineNow) } as CSSProperties}
                  onClick={() => onEdit(task)}
                  aria-label={`${taskDisplayOf(task)} ${dueLabel(task)}。タップして修正`}
                  title={`${taskDisplayOf(task)}｜${dueLabel(task)}`}
                >
                  {task.repeatFrequency ? <span className="radar-target-core" /> : taskTypeOf(task) === "test" ? "★" : <span className="radar-target-core" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="radar-alert-row">
          <div className={`radar-alert-icon ${risk}`}>!</div>
          <div className="radar-alert-copy">
            <strong>中心に近いほど要注意</strong>
            <span>走査線が通過すると対象信号が強く光ります</span>
          </div>
          <button type="button" className={`radar-attention-button ${risk}`} onClick={onOpenAll}>
            {riskLabel}<span>›</span>
          </button>
        </div>

        <div className="radar-legend-panel">
          <div className="radar-range-legend">
            <span><i className="range-dot danger" />DANGER</span>
            <span><i className="range-dot caution" />CAUTION</span>
            <span><i className="range-dot safe" />SAFE</span>
          </div>
          <div className="radar-subject-legend">
            {SUBJECTS.map((subject) => (
              <span key={subject} className={subjectClass(subject)}><i />{subject}</span>
            ))}
          </div>
          <div className="radar-kind-legend">
            <span><i className="legend-shape circle" />宿題</span>
            <span><i className="legend-shape square" />提出</span>
            <span><i className="legend-star">★</i>小テスト</span>
            <span><i className="legend-dot" />ルーティン</span>
            <span><i className="legend-cluster">+3</i>密集</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompletedToggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle-row"><span>終わった課題も見る</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function TimetableView({ timetable, onSave, onQuickAdd, onExportBackup, onRestoreBackup, lastBackupAt }: {
  timetable: TimetableConfig;
  onSave: (value: TimetableConfig) => Promise<void>;
  onQuickAdd: (courseId: string) => void;
  onExportBackup: () => void;
  onRestoreBackup: (file: File) => Promise<void>;
  lastBackupAt: string | null;
}) {
  const [editing, setEditing] = useState(!timetableHasSlots(timetable));
  if (editing) {
    return <TimetableEditor timetable={timetable} onSave={async (value) => { await onSave(value); setEditing(false); }} onCancel={() => setEditing(false)} />;
  }
  const courseMap = new Map(timetable.courses.map((course) => [course.id, course]));
  const template = `42px repeat(5, minmax(0, 1fr))`;
  return (
    <section className="screen">
      <ScreenTitle
        title="時間割"
        subtitle="授業をタップすると、その授業の課題を追加できます"
        action={<button type="button" className="header-action" onClick={() => setEditing(true)}>編集</button>}
      />
      <div className="timetable-card">
        <div className="timetable-grid timetable-head" style={{ gridTemplateColumns: template }}>
          <div />
          {WEEKDAYS.map((day) => <div key={day.value}>{day.label}</div>)}
        </div>
        {Array.from({ length: timetable.periods }, (_, index) => index + 1).map((period) => (
          <div key={period} className="timetable-grid timetable-row" style={{ gridTemplateColumns: template }}>
            <div className="period-label">{period}</div>
            {WEEKDAYS.map((day) => {
              const course = courseMap.get(timetable.slots[slotKey(day.value, period)]);
              return (
                <button
                  type="button"
                  key={day.value}
                  className={`timetable-cell ${course ? subjectClass(course.subject) : "empty"}`}
                  disabled={!course}
                  onClick={() => course && onQuickAdd(course.id)}
                  title={course?.name ?? ""}
                >
                  {course ? <><span className="timetable-short">{course.shortName}</span><small>{course.name}</small></> : <span>—</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="timetable-hint">時間割は最初に一度設定すれば、毎日の課題登録で文字入力する必要はありません。</div>
      <section className="backup-card" aria-label="バックアップ">
        <div className="backup-card-head">
          <div>
            <strong>データのバックアップ</strong>
            <p>課題と時間割はこのスマホだけに保存されています。</p>
          </div>
          <span>LOCAL</span>
        </div>
        <div className="backup-actions">
          <button type="button" className="backup-primary" onClick={onExportBackup}>バックアップを保存</button>
          <label className="backup-secondary">
            バックアップから復元
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void onRestoreBackup(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
        <small>前回：{formatBackupTime(lastBackupAt)}</small>
        <p className="backup-note">ブラウザのデータ削除や機種変更に備えて、時々バックアップファイルを保存してください。</p>
      </section>
    </section>
  );
}

function TimetableEditor({ timetable, onSave, onCancel }: {
  timetable: TimetableConfig;
  onSave: (value: TimetableConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<TimetableConfig>(() => JSON.parse(JSON.stringify(timetable)));
  const [newName, setNewName] = useState("");
  const [newSubject, setNewSubject] = useState<Subject>("その他");
  const [busy, setBusy] = useState(false);
  const template = `42px repeat(5, minmax(0, 1fr))`;

  const addCourse = () => {
    const name = newName.trim();
    if (!name || draft.courses.some((course) => course.name === name)) return;
    const course: Course = {
      id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      shortName: autoShortName(name, newSubject),
      subject: newSubject
    };
    setDraft((current) => ({ ...current, courses: [...current.courses, course] }));
    setNewName("");
  };

  const removeCustomCourse = (courseId: string) => {
    setDraft((current) => {
      const slots = Object.fromEntries(Object.entries(current.slots).filter(([, id]) => id !== courseId));
      return { ...current, courses: current.courses.filter((course) => course.id !== courseId), slots };
    });
  };

  const save = async () => {
    setBusy(true);
    try { await onSave(draft); } finally { setBusy(false); }
  };

  return (
    <section className="screen">
      <ScreenTitle title="時間割を設定" subtitle="学校で使っている授業名を、そのまま登録できます" />
      <div className="setup-section">
        <div className="setup-title"><strong>1日の授業数</strong></div>
        <div className="period-buttons">
          {[5, 6, 7].map((value) => <button type="button" key={value} className={draft.periods === value ? "selected" : ""} onClick={() => setDraft((current) => ({ ...current, periods: value }))}>{value}限</button>)}
        </div>
      </div>
      <div className="setup-section">
        <div className="setup-title"><strong>授業名</strong><span>学校独自の名前も追加できます</span></div>
        <div className="course-chip-list">
          {draft.courses.map((course) => (
            <span key={course.id} className={`course-chip ${subjectClass(course.subject)}`}>
              <b>{course.shortName}</b>{course.name}
              {!course.builtIn && <button type="button" onClick={() => removeCustomCourse(course.id)} aria-label={`${course.name}を削除`}>×</button>}
            </span>
          ))}
        </div>
        <div className="add-course-box">
          <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="例：数学A / 英語コミュ" />
          <select value={newSubject} onChange={(event) => setNewSubject(event.target.value as Subject)}>
            {SUBJECTS.map((subject) => <option key={subject}>{subject}</option>)}
          </select>
          <button type="button" onClick={addCourse} disabled={!newName.trim()}>追加</button>
        </div>
      </div>
      <div className="setup-section">
        <div className="setup-title"><strong>時間割</strong><span>各マスから授業名を選択</span></div>
        <div className="timetable-card editor-table">
          <div className="timetable-grid timetable-head" style={{ gridTemplateColumns: template }}><div />{WEEKDAYS.map((day) => <div key={day.value}>{day.label}</div>)}</div>
          {Array.from({ length: draft.periods }, (_, index) => index + 1).map((period) => (
            <div key={period} className="timetable-grid timetable-row" style={{ gridTemplateColumns: template }}>
              <div className="period-label">{period}</div>
              {WEEKDAYS.map((day) => (
                <select
                  key={day.value}
                  className="timetable-select"
                  value={draft.slots[slotKey(day.value, period)] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, slots: { ...current.slots, [slotKey(day.value, period)]: event.target.value } }))}
                  aria-label={`${day.label}曜日 ${period}限`}
                >
                  <option value="">—</option>
                  {draft.courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                </select>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="editor-actions">
        <button type="button" className="quiet-button" onClick={onCancel}>キャンセル</button>
        <button type="button" className="save-button" onClick={save} disabled={busy}>{busy ? "保存中…" : "時間割を保存"}</button>
      </div>
    </section>
  );
}

function AddView({ timetable, initialCourseId, onAdd, onOpenTimetable }: {
  timetable: TimetableConfig;
  initialCourseId: string | null;
  onAdd: (drafts: TaskDraft[]) => Promise<void>;
  onOpenTimetable: () => void;
}) {
  const courses = useMemo(() => usedCourses(timetable), [timetable]);
  const [courseId, setCourseId] = useState(initialCourseId ?? "");
  const [taskType, setTaskType] = useState<TaskType>("homework");
  const [dueMode, setDueMode] = useState<DueMode>("next");
  const [manualDate, setManualDate] = useState("");
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>("weekly");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => { setCourseId(initialCourseId ?? ""); }, [initialCourseId]);
  const course = courses.find((item) => item.id === courseId) ?? timetable.courses.find((item) => item.id === courseId);
  const nextLesson = course ? nextLessonForCourse(course.id, timetable) : null;
  const tomorrow = toDateKey(addDays(parseDateKey(todayKey()), 1));
  const dueDate = dueMode === "next" ? nextLesson?.dateKey ?? "" : dueMode === "tomorrow" ? tomorrow : manualDate;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!course || !dueDate) return;
    setBusy(true);
    setSubmitError("");
    try {
      const drafts = buildRecurringDrafts({
        subject: course.subject,
        title: TASK_TYPE_LABELS[taskType],
        taskType,
        dueDate,
        repeatFrequency: repeatEnabled ? repeatFrequency : undefined,
        seriesId: createTaskId(),
        lessonId: course.id,
        lessonName: course.name,
        lessonShortName: course.shortName
      });
      await onAdd(drafts);
    } catch (error) {
      console.error(error);
      setSubmitError("登録できませんでした。もう一度試してください。");
    } finally { setBusy(false); }
  };

  if (!timetableHasSlots(timetable)) {
    return (
      <section className="screen">
        <ScreenTitle title="課題を追加" subtitle="まず時間割を設定すると、文字入力なしで登録できます" />
        <div className="empty-card setup-empty"><strong>時間割がまだありません</strong><p>授業名と曜日・時間を一度登録してください。</p><button type="button" className="save-button" onClick={onOpenTimetable}>時間割を設定する</button></div>
      </section>
    );
  }

  return (
    <section className="screen">
      <ScreenTitle title="課題を追加" subtitle="授業・種類・期限を選ぶだけ" />
      <form className="quick-add-form" onSubmit={submit}>
        <label className="quick-field">
          <span>授業</span>
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
            <option value="">授業を選ぶ</option>
            {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>

        <fieldset className="quick-field">
          <legend>何がある？</legend>
          <div className="type-buttons">
            {(["homework", "submission", "test"] as TaskType[]).map((type) => (
              <button type="button" key={type} className={taskType === type ? "selected" : ""} onClick={() => setTaskType(type)}>{type === "test" ? "★ " : ""}{TASK_TYPE_LABELS[type]}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="quick-field">
          <legend>いつ？</legend>
          <div className="due-choice-stack">
            <button type="button" className={dueMode === "next" ? "selected" : ""} disabled={!nextLesson} onClick={() => setDueMode("next")}>
              <strong>次の授業</strong>
              <small>{nextLesson ? `${formatMD(nextLesson.dateKey)}（${formatWeekday(nextLesson.dateKey)}）${nextLesson.period}限` : "時間割にありません"}</small>
            </button>
            <button type="button" className={dueMode === "tomorrow" ? "selected" : ""} onClick={() => setDueMode("tomorrow")}><strong>明日</strong><small>{formatMD(tomorrow)}</small></button>
            <button type="button" className={dueMode === "date" ? "selected" : ""} onClick={() => setDueMode("date")}><strong>日付を選ぶ</strong><small>{manualDate ? formatMD(manualDate) : "カレンダー"}</small></button>
          </div>
          {dueMode === "date" && <input className="date-input" type="date" value={manualDate} min={todayKey()} onChange={(event) => setManualDate(event.target.value)} />}
        </fieldset>

        <div className="repeat-box">
          <label className="repeat-toggle">
            <span><strong>↻ 繰り返す</strong><small>毎週の提出・小テストなど</small></span>
            <input type="checkbox" checked={repeatEnabled} onChange={(event) => setRepeatEnabled(event.target.checked)} />
          </label>
          {repeatEnabled && (
            <div className="repeat-options">
              {([ ["weekly", "毎週"], ["biweekly", "隔週"], ["monthly", "毎月"] ] as [RepeatFrequency, string][]).map(([value, label]) => (
                <button type="button" key={value} className={repeatFrequency === value ? "selected" : ""} onClick={() => setRepeatFrequency(value)}>{label}</button>
              ))}
              <p>初回日を基準に約6か月先まで自動登録します。</p>
            </div>
          )}
        </div>
        {course && dueDate && <div className="register-preview"><span>{course.name}</span><strong>{TASK_TYPE_LABELS[taskType]}</strong><b>{formatMD(dueDate)}{taskType === "test" ? "" : "まで"}</b></div>}
        {submitError && <div className="form-error">{submitError}</div>}
        <button type="submit" className="save-button" disabled={busy || !course || !dueDate}>{busy ? "登録中…" : repeatEnabled ? `${repeatLabel(repeatFrequency)}で登録` : "登録する"}</button>
      </form>
      <button type="button" className="text-link-button" onClick={onOpenTimetable}>時間割を確認・編集</button>
    </section>
  );
}

function NavButton({ active, symbol, label, onClick }: { active: boolean; symbol: string; label: string; onClick: () => void }) {
  return <button type="button" className={`nav-button ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}><span>{symbol}</span><small>{label}</small></button>;
}

function EditTaskModal({ task, timetable, onSave, onDelete, onDeleteSeries, onClose }: {
  task: Task;
  timetable: TimetableConfig;
  onSave: (task: Task, values: Partial<Omit<Task, "id" | "createdAt" | "completed" | "source">>, applyToSeries: boolean) => Promise<void>;
  onDelete: (task: Task) => Promise<void>;
  onDeleteSeries: (task: Task) => Promise<void>;
  onClose: () => void;
}) {
  const courses = timetable.courses;
  const initialCourse = task.lessonId && timetable.courses.some((course) => course.id === task.lessonId)
    ? task.lessonId
    : timetable.courses.find((course) => course.name === task.lessonName || course.name === task.subject)?.id ?? "";
  const [courseId, setCourseId] = useState(initialCourse);
  const [taskType, setTaskType] = useState<TaskType>(task.taskType ?? (taskKind(task) === "test" ? "test" : "homework"));
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [applyToSeries, setApplyToSeries] = useState(Boolean(task.repeatSeriesId));
  const course = courses.find((item) => item.id === courseId) ?? timetable.courses.find((item) => item.id === courseId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!course || !dueDate) return;
    setBusy(true); setError("");
    try {
      await onSave(task, {
        subject: course.subject,
        title: TASK_TYPE_LABELS[taskType],
        kind: taskType === "test" ? "test" : "assignment",
        taskType,
        lessonId: course.id,
        lessonName: course.name,
        lessonShortName: course.shortName,
        dueDate
      }, applyToSeries);
    } catch {
      setError("修正できませんでした。もう一度試してください。");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="edit-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="edit-modal-head"><div><small>{task.repeatFrequency ? `↻ ${repeatLabel(task.repeatFrequency)}の予定` : "登録済み課題"}</small><h2>課題を修正</h2></div><button type="button" onClick={onClose}>×</button></div>
        <form className="quick-add-form" onSubmit={submit}>
          <label className="quick-field"><span>授業</span><select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <fieldset className="quick-field"><legend>種類</legend><div className="type-buttons">{(["homework", "submission", "test"] as TaskType[]).map((type) => <button type="button" key={type} className={taskType === type ? "selected" : ""} onClick={() => setTaskType(type)}>{TASK_TYPE_LABELS[type]}</button>)}</div></fieldset>
          <label className="quick-field"><span>いつ？</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          {task.repeatSeriesId && <label className="series-apply-toggle"><span>今後の繰り返しにも授業・種類を反映</span><input type="checkbox" checked={applyToSeries} onChange={(event) => setApplyToSeries(event.target.checked)} /></label>}
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="save-button" disabled={busy || !course || !dueDate}>{busy ? "修正中…" : "修正を保存"}</button>
          <button type="button" className="delete-button" onClick={() => onDelete(task)}>この予定だけ削除</button>
          {task.repeatSeriesId && <button type="button" className="delete-series-button" onClick={() => onDeleteSeries(task)}>この繰り返しを全部削除</button>}
        </form>
      </section>
    </div>
  );
}

export default App;
