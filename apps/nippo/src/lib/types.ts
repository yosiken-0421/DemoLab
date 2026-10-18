export type PunchType = 'in' | 'out' | 'break_start' | 'break_end';

export const PUNCH_LABEL: Record<PunchType, string> = {
  in: '出勤',
  out: '退勤',
  break_start: '休憩開始',
  break_end: '休憩終了',
};

export interface Punch {
  id: string;
  work_date: string; // 勤務日（出勤した日）
  type: PunchType;
  at: string; // 'YYYY-MM-DDTHH:mm:ss'（日をまたぐ退勤は翌日の日付になる）
  canceled: number; // 1 = 取り消し
  created_at: string;
}

export interface PunchHistory {
  id: number;
  punch_id: string;
  action: 'create' | 'add' | 'edit' | 'cancel' | 'restore'; // create=ボタン打刻, add=後から追加
  old_at: string | null;
  new_at: string | null;
  reason: string;
  changed_at: string;
}

export interface TaskRow {
  content: string;
  minutes: string;
}
export interface MetricRow {
  name: string;
  unit: string;
  target: string;
  actual: string;
}
export interface PlanRow {
  who: string;
  what: string;
  due: string;
}

export interface ReportData {
  workType: string;
  condition: string;
  weather: string;
  tasks: TaskRow[];
  metrics: MetricRow[];
  progress: string;
  issues: string;
  reflectionGood: string;
  reflectionImprove: string;
  reflectionNext: string;
  nextPlans: PlanRow[];
  notes: string;
}

export type SectionKey = 'tasks' | 'metrics' | 'progress' | 'issues' | 'reflection' | 'nextPlans' | 'notes';

export const SECTION_LABEL: Record<SectionKey, string> = {
  tasks: '当日の業務実績・作業内容',
  metrics: '数値記録',
  progress: '目標に対する進捗',
  issues: '課題・気づき・申し送り事項',
  reflection: '振り返り',
  nextPlans: '翌日の予定・引き継ぎ',
  notes: '特記事項（顧客の声・市場の変化など）',
};

export interface Settings {
  name: string;
  workTypes: string[];
  showCondition: boolean;
  showWeather: boolean;
  sections: { key: SectionKey; enabled: boolean }[];
  metricTemplates: { name: string; unit: string; target: string }[];
}

export const CONDITIONS = ['良好', '普通', '不調'] as const;
export const WEATHERS = ['晴れ', '曇り', '雨', '雪'] as const;

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  workTypes: ['通常勤務', '在宅勤務', '外勤', '出張', '休日出勤', '半休'],
  showCondition: true,
  showWeather: true,
  sections: (['tasks', 'metrics', 'progress', 'issues', 'reflection', 'nextPlans', 'notes'] as SectionKey[]).map((key) => ({ key, enabled: true })),
  metricTemplates: [],
};

export function emptyReport(): ReportData {
  return {
    workType: '',
    condition: '',
    weather: '',
    tasks: [],
    metrics: [],
    progress: '',
    issues: '',
    reflectionGood: '',
    reflectionImprove: '',
    reflectionNext: '',
    nextPlans: [],
    notes: '',
  };
}
