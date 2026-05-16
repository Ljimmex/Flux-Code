import { GitCompare } from './icons';

export default function DiffPanel() {
  return (
    <div className="panel-empty">
      <GitCompare size={48} />
      <h3>Diff Viewer</h3>
      <p>Select a thread with changes to review the diff.</p>
    </div>
  );
}
