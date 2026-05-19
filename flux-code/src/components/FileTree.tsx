import { memo, useEffect, useMemo, useState } from 'react';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';

interface FileTreeProps {
  paths: string[];
  descriptions?: Record<string, string>;
  title?: string;
}

export const FileTree = memo(function FileTree({ paths, descriptions = {}, title }: FileTreeProps) {
  const itemHeight = 30;
  const headerHeight = 36;
  const calculatedHeight = paths.length * itemHeight + headerHeight;
  const treeHeight = Math.min(Math.max(calculatedHeight, 120), 480);
  const visibleRows = Math.min(paths.length, Math.ceil(480 / itemHeight));

  const folderIconSvg = `%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='black'%3E%3Cpath d='M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z'/%3E%3C/svg%3E`;

  const { model } = useFileTree({
    initialExpansion: 'open',
    paths,
    search: false,
    initialVisibleRowCount: visibleRows,
    icons: { set: 'standard', colored: true },
    renderRowDecoration: (context) => {
      const desc = descriptions[context.item.path];
      if (!desc) return null;
      return { text: desc };
    },
    unsafeCSS: `
      @layer unsafe {
        [data-item-type="folder"] [data-item-section="icon"] {
          width: auto;
          gap: 2px;
        }
        [data-item-type="folder"] [data-item-section="icon"]::before {
          content: '';
          display: inline-block;
          width: 16px;
          height: 16px;
          background-color: #d29922;
          -webkit-mask-image: url("data:image/svg+xml,${folderIconSvg}");
          mask-image: url("data:image/svg+xml,${folderIconSvg}");
          -webkit-mask-size: contain;
          mask-size: contain;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
        }
      }
    `,
  });

  useEffect(() => {
    model.resetPaths(paths);
  }, [model, paths]);

  const [allExpanded, setAllExpanded] = useState(true);

  const handleToggleAll = () => {
    const folders = paths.filter((p) => p.endsWith('/'));
    if (allExpanded) {
      folders.forEach((p) => {
        const item = model.getItem(p);
        if (item && item.isDirectory()) {
          (item as import('@pierre/trees').FileTreeDirectoryHandle).collapse();
        }
      });
    } else {
      folders.forEach((p) => {
        const item = model.getItem(p);
        if (item && item.isDirectory()) {
          (item as import('@pierre/trees').FileTreeDirectoryHandle).expand();
        }
      });
    }
    setAllExpanded(!allExpanded);
  };

  const hostStyle = useMemo(
    () =>
      ({
        '--trees-bg-override': '#161b22',
        '--trees-fg-override': '#e6edf3',
        '--trees-fg-muted-override': '#8b949e',
        '--trees-border-color-override': '#30363d',
        '--trees-selected-bg-override': 'rgba(88, 166, 255, 0.12)',
        '--trees-selected-fg-override': '#e6edf3',
        '--trees-focus-ring-color-override': '#58a6ff',
        '--trees-focus-ring-width-override': '1px',
        '--trees-file-icon-color': '#8b949e',
        height: `${treeHeight}px`,
        maxHeight: '480px',
        minHeight: '120px',
        borderRadius: '8px',
        border: '1px solid #30363d',
        overflow: 'hidden',
        margin: '8px 0',
        background: '#161b22',
      } as React.CSSProperties),
    [],
  );

  if (paths.length === 0) return null;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {title || 'Structure'}
      </span>
      <button
        onClick={handleToggleAll}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 4,
          border: '1px solid #30363d',
          background: '#21262d',
          color: '#8b949e',
          cursor: 'pointer',
        }}
        type="button"
      >
        {allExpanded ? 'Collapse all' : 'Expand all'}
      </button>
    </div>
  );

  return (
    <PierreFileTree
      model={model}
      header={header}
      style={hostStyle}
    />
  );
});
