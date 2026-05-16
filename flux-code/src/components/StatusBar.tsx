import { Wifi, Cpu, Coins, FileCode } from './icons';
import type { Thread } from '../App';

interface Props {
  activeThread: Thread | null;
}

export default function StatusBar({ activeThread }: Props) {
  const model = activeThread?.model || 'gpt-4';
  const status = activeThread?.status || 'idle';

  return (
    <footer className="statusbar">
      <div className="statusbar-left">
        <Wifi size={12} />
        <span>Online</span>
        <span className="statusbar-sep">|</span>
        <span>v0.1.0</span>
      </div>
      <div className="statusbar-center">
        <Cpu size={12} />
        <span>{model}</span>
        <span className="statusbar-sep">|</span>
        <span className={`status-indicator status-${status}`} />
        <span>{status}</span>
      </div>
      <div className="statusbar-right">
        <FileCode size={12} />
        <span>0 files</span>
        <span className="statusbar-sep">|</span>
        <Coins size={12} />
        <span>$0.00</span>
      </div>
    </footer>
  );
}
