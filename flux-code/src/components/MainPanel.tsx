import ChatPanel from './ChatPanel';
import type { Thread, Project } from '../App';

interface Props {
  activeThread: Thread | null;
  activeProject: Project | null;
  onAddThread: (title: string, mode?: string) => void;
}

export default function MainPanel({ activeThread, activeProject, onAddThread }: Props) {
  return (
    <main className="main-panel">
      <ChatPanel activeThread={activeThread} activeProject={activeProject} onAddThread={onAddThread} />
    </main>
  );
}
