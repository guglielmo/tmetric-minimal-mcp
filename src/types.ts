export interface TMetricProject {
  id: number;
  name: string;
}

export interface TMetricTimeEntry {
  id: string;
  startTime: string;
  endTime: string | null;
  project?: {
    id: number;
    name: string;
  };
  task?: {
    name: string;
    externalLink?: {
      link: string;
      issueId: string;
    };
    integration?: {
      url: string;
      type: string;
    };
  };
  note?: string;
  tags?: string[];
}

export interface TMetricUser {
  activeAccountId: string;
  email: string;
  name: string;
}

export interface TimerInfo {
  is_running: boolean;
  timer_id?: string;
  task_name?: string;
  task_url?: string;
  project_name?: string;
  project_id?: number;
  started_at?: string;
  elapsed?: string;
}

export interface ApiResponse {
  success: boolean;
  error?: string;
  message?: string;
  [key: string]: any;
}
