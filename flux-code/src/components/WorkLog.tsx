import { useState, memo } from 'react';
import { ActivityRow } from './ActivityRow';
import type { ActivityItem } from '../types/activity';

interface Props {
  activities: ActivityItem[];
  isRunning: boolean;
}

export const WorkLog = memo(function WorkLog({ activities, isRunning }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0) return null;

  const visibleActivities = isRunning
    ? [activities[activities.length - 1]]
    : expanded
      ? activities
      : activities.slice(0, 1);

  return (
    <div className="work-log">
      <button
        className="work-log-toggle"
        onClick={() => !isRunning && setExpanded((e) => !e)}
        disabled={isRunning}
      >
        {isRunning && <span className="activity-running-dot" />}
        <span className="work-log-toggle-text">
          {isRunning
            ? 'Working...'
            : `${activities.length} step${activities.length !== 1 ? 's' : ''}`}
        </span>
        {!isRunning && (
          <span className="work-log-toggle-chevron">{expanded ? '▲' : '▼'}</span>
        )}
      </button>

      <div className="work-log-list">
        {visibleActivities.map((activity) => (
          <ActivityRow key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
});
