import { useState, useEffect, useCallback } from 'react';
import { PatchDiff } from '@pierre/diffs/react';
import { XIcon } from './icons';

interface Props {
  projectPath: string;
  files: string[];
  onClose: () => void;
}

export function DiffPanel({ projectPath, files, onClose }: Props) {
  const [selectedFile, setSelectedFile] = useState<string>(files[0] ?? '');
  const [patch, setPatch] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPatch = useCallback(async (file: string) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const res = await window.electronAPI.diff.gitDiff(projectPath, file);
    setLoading(false);
    if (res.success) {
      setPatch(res.patch || '');
    } else {
      setError(res.error || 'Failed to load diff');
      setPatch('');
    }
  }, [projectPath]);

  useEffect(() => {
    loadPatch(selectedFile);
  }, [selectedFile, loadPatch]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (files.length === 0) return null;

  return (
    <div className="diff-panel-overlay" onClick={onClose}>
      <div className="diff-panel" onClick={(e) => e.stopPropagation()}>
        <div className="diff-panel-header">
          <span className="diff-panel-title">Changed files</span>
          <button className="diff-panel-close" onClick={onClose}>
            <XIcon size={16} />
          </button>
        </div>

        <div className="diff-panel-body">
          <div className="diff-panel-sidebar">
            {files.map((file) => (
              <button
                key={file}
                className={`diff-panel-file ${file === selectedFile ? 'active' : ''}`}
                onClick={() => setSelectedFile(file)}
                title={file}
              >
                {file}
              </button>
            ))}
          </div>

          <div className="diff-panel-content">
            {loading && <div className="diff-panel-loading">Loading diff…</div>}
            {error && <div className="diff-panel-error">{error}</div>}
            {!loading && !error && patch && (
              <PatchDiff
                patch={patch}
                disableWorkerPool
                options={{ themeType: 'dark' }}
              />
            )}
            {!loading && !error && !patch && (
              <div className="diff-panel-empty">No diff available for this file.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
