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

  const visibleActivities = expanded ? activities : activities.slice(-3);
  const hiddenCount = activities.length - visibleActivities.length;

  return (
    <div className="work-log">
      <button
        className="work-log-toggle"
        onClick={() => setExpanded((e) => !e)}
      >
        {isRunning && <span className="activity-running-dot" />}
        <span className="work-log-toggle-text">
          TOOL CALLS ({activities.length})
        </span>
        <span className="work-log-toggle-chevron">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      <div className="work-log-list">
        {visibleActivities.map((activity, idx) => (
          <ActivityRow
            key={activity.id}
            activity={activity}
            isLatest={isRunning && idx === visibleActivities.length - 1}
          />
        ))}
      </div>

      {hiddenCount > 0 && !expanded && (
        <button
          className="work-log-show-more"
          onClick={() => setExpanded(true)}
        >
          show {hiddenCount} more
        </button>
      )}
    </div>
  );
});
