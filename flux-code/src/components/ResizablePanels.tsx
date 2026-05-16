import { useRef, useState, useEffect, useCallback } from 'react';

interface Props {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  sidebarVisible: boolean;
}

const STORAGE_KEY = 'flux-code:panel-percent';
const DEFAULT_SIDEBAR = 30;
const MIN_SIDEBAR = 20;
const MAX_SIDEBAR = 40;

function loadPercent(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const val = JSON.parse(raw);
      if (typeof val === 'number' && val >= MIN_SIDEBAR && val <= MAX_SIDEBAR) return val;
    }
  } catch {}
  return DEFAULT_SIDEBAR;
}

function savePercent(percent: number) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(percent));
}

export default function ResizablePanels({ sidebar, main, sidebarVisible }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sidebarPercent, setSidebarPercent] = useState(loadPercent);
  const dragging = useRef<{ startX: number; startPercent: number; containerWidth: number } | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    e.preventDefault();
    dragging.current = { startX: e.clientX, startPercent: sidebarPercent, containerWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarPercent]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const { startX, startPercent, containerWidth } = dragging.current;
      const deltaPx = e.clientX - startX;
      const deltaPercent = (deltaPx / containerWidth) * 100;
      const newPercent = Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, startPercent + deltaPercent));
      setSidebarPercent(newPercent);
    };

    const handleMouseUp = () => {
      if (dragging.current) {
        savePercent(sidebarPercent);
        dragging.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [sidebarPercent]);

  const mainPercent = sidebarVisible ? 100 - sidebarPercent : 100;

  return (
    <div ref={containerRef} className="resizable-container" style={{ display: 'flex', flexDirection: 'row', width: '100%', height: '100%' }}>
      {sidebarVisible && (
        <div className="resizable-panel sidebar-panel" style={{ width: `${sidebarPercent}%`, flexShrink: 0 }}>
          {sidebar}
        </div>
      )}
      {sidebarVisible && (
        <div className="resizable-divider" onMouseDown={handleMouseDown} />
      )}
      <div className="resizable-panel main-panel" style={{ width: `${mainPercent}%`, flexShrink: 0 }}>
        {main}
      </div>
    </div>
  );
}
