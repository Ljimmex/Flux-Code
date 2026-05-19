import { memo } from 'react';
import { Terminal, FileText, Edit3, Wrench, Check, XCircle, Loader2 } from './icons';
import type { ActivityItem, ActivityKind, ActivityStatus } from '../types/activity';

interface Props {
  activity: ActivityItem;
  isLatest?: boolean;
}

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  const baseClass = 'activity-icon';
  switch (kind) {
    case 'shell':
      return <Terminal size={14} className={baseClass} />;
    case 'fileRead':
      return <FileText size={14} className={baseClass} />;
    case 'fileWrite':
      return <Edit3 size={14} className={baseClass} />;
    case 'thinking':
      return <Loader2 size={14} className={`${baseClass} animate-spin`} />;
    case 'plan':
      return <Wrench size={14} className={baseClass} />;
    default:
      return <Wrench size={14} className={baseClass} />;
  }
}

function StatusIcon({ status }: { status: ActivityStatus }) {
  if (status === 'completed') {
    return <Check size={12} className="activity-status-icon status-completed" />;
  }
  if (status === 'error') {
    return <XCircle size={12} className="activity-status-icon status-error" />;
  }
  return <span className="activity-running-dot" />;
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export const ActivityRow = memo(function ActivityRow({ activity, isLatest }: Props) {
  const duration =
    activity.ended_at && activity.started_at
      ? formatDurationMs(
          new Date(activity.ended_at).getTime() - new Date(activity.started_at).getTime()
        )
      : null;

  return (
    <div className={`activity-row activity-row--${activity.status} ${isLatest ? 'activity-row--latest' : ''}`}>
      <ActivityIcon kind={activity.kind} />
      <span className="activity-label">{activity.label}</span>
      {duration && <span className="activity-duration">{duration}</span>}
      <StatusIcon status={activity.status} />
    </div>
  );
});
