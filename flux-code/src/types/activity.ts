export type ActivityStatus = 'running' | 'completed' | 'error';

export type ActivityKind =
  | 'shell'
  | 'fileRead'
  | 'fileWrite'
  | 'thinking'
  | 'tool'
  | 'plan';

export interface ActivityItem {
  id: number;
  thread_id: number;
  turn_id: string;
  item_id?: string;
  kind: ActivityKind;
  label: string;
  status: ActivityStatus;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  exit_code?: number;
  started_at: string;
  ended_at?: string;
}
