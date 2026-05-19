import { memo } from 'react';

interface FileListProps {
  paths: string[];
  descriptions?: Record<string, string>;
}

export const FileList = memo(function FileList({ paths, descriptions = {} }: FileListProps) {
  if (paths.length === 0) return null;

  return (
    <span className="file-list">
      {paths.map((path) => {
        const desc = descriptions[path];
        return (
          <span key={path} className="file-list-row">
            <span className="file-list-path">{path}</span>
            {desc && <span className="file-list-desc"> : {desc}</span>}
          </span>
        );
      })}
    </span>
  );
});
