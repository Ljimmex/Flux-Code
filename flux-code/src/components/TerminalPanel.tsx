import { Terminal } from './icons';
import type { Project } from '../App';

interface Props {
  activeProject: Project | null;
}

export default function TerminalPanel({ activeProject }: Props) {
  return (
    <div className="panel-empty">
      <Terminal size={48} />
      <h3>Integrated Terminal</h3>
      <p>{activeProject ? `Working directory: ${activeProject.path}` : 'Select a project to open terminal.'}</p>
    </div>
  );
}
