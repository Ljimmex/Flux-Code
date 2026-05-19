import { memo } from 'react';
import { GitCompare } from './icons';

interface Props {
  fileWriteActivities: { label: string; path?: string }[];
  onClick?: () => void;
}

export const ChangedFilesBadge = memo(function ChangedFilesBadge({
  fileWriteActivities,
  onClick,
}: Props) {
  if (fileWriteActivities.length === 0) return null;

  // Extract unique file paths from labels like "Edit filename.ts"
  const files = fileWriteActivities
    .map((a) => {
      const match = a.label.match(/Edit\s+(.+)$/);
      return match ? match[1] : a.label;
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <button
      className="changed-files-badge"
      onClick={onClick}
      title={files.join('\n')}
    >
      <GitCompare size={12} />
      <span>Changed files ({files.length})</span>
    </button>
  );
});
