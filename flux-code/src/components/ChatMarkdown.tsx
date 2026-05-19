import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getSingletonHighlighter, type Highlighter } from 'shiki';
import { Copy, Check } from './icons';
import { FileTree } from './FileTree';
import { FileList } from './FileList';
import { isFileTree, parseFileTree, flattenFileTreeNodes } from '../utils/parseFileTree';
import { LRUCache } from '../utils/lruCache';

/* ------------------------------------------------------------------ */
/*  Shiki singleton                                                   */
/* ------------------------------------------------------------------ */

let highlighterPromise: Promise<Highlighter> | null = null;

function getShikiHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = getSingletonHighlighter({
      themes: ['github-dark'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'json',
        'html',
        'css',
        'python',
        'bash',
        'shell',
        'markdown',
        'yaml',
        'toml',
        'rust',
        'go',
        'java',
        'cpp',
        'c',
        'sql',
        'xml',
        'dockerfile',
        'regex',
        'diff',
      ],
    });
  }
  return highlighterPromise;
}

/* ------------------------------------------------------------------ */
/*  LRU cache for highlighted HTML                                    */
/* ------------------------------------------------------------------ */

const highlightCache = new LRUCache<string, string>(100);

async function highlightCode(code: string, lang: string): Promise<string> {
  const key = `${lang}::${code}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;

  const highlighter = await getShikiHighlighter();
  const grammarLang = highlighter.getLoadedLanguages().includes(lang as any)
    ? lang
    : 'text';

  const html = highlighter.codeToHtml(code, {
    lang: grammarLang,
    theme: 'github-dark',
  });

  highlightCache.set(key, html);
  return html;
}

/* ------------------------------------------------------------------ */
/*  Code block component                                               */
/* ------------------------------------------------------------------ */

function CodeBlock({
  className,
  children,
  inline,
}: {
  className?: string;
  children?: ReactNode;
  inline?: boolean;
}) {
  if (inline) {
    return <InlineCode>{children}</InlineCode>;
  }

  const codeRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [, setHighlighted] = useState(false);

  const code = String(children).replace(/\n$/, '');

  // Table detection: if every non-empty line starts with |, render as table
  const tableLines = code.split('\n').filter((l) => l.trim());
  const isTable = tableLines.length >= 2 && tableLines.every((l) => l.trim().startsWith('|'));
  if (isTable) {
    return (
      <div className="table-wrapper">
        <ReactMarkdown remarkPlugins={remarkGfm ? [remarkGfm] : []}>
          {code}
        </ReactMarkdown>
      </div>
    );
  }

  // File tree detection
  if (isFileTree(code)) {
    const treeData = parseFileTree(code);
    if (treeData && treeData.nodes.length > 0) {
      const { paths, descriptions } = flattenFileTreeNodes(treeData.nodes, treeData.descriptions);
      if (paths.length > 0) {
        const hasNesting = treeData.nodes.some((n) => n.children && n.children.length > 0);
        if (!hasNesting) {
          return <FileList paths={paths} descriptions={descriptions} />;
        }
        return <FileTree paths={paths} descriptions={descriptions} />;
      }
    }
  }

  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : 'text';

  // Shiki highlighting — inject HTML directly so React doesn't remount children
  useEffect(() => {
    let cancelled = false;
    if (!codeRef.current) return;

    highlightCode(code, lang).then((html) => {
      if (cancelled || !codeRef.current) return;
      codeRef.current.innerHTML = html;
      setHighlighted(true);
    });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {lang && lang !== 'text' && <span className="code-lang">{lang}</span>}
        <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className={`code-pre ${className || ''}`} ref={codeRef}>
        {code}
      </div>
    </div>
  );
}

function InlineCode({ children }: { children?: ReactNode }) {
  return <code className="inline-code">{children}</code>;
}

/* ------------------------------------------------------------------ */
/*  Markdown pre-processing                                            */
/* ------------------------------------------------------------------ */

const BOX_CHARS = /[├┤┌┐└┘┬┴┼─│╭╮╯╰]/;

function isTreeLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (BOX_CHARS.test(trimmed)) return true;
  if (/^[^\s│├└┌┐┬┴┼─╭╮╯╰]/.test(trimmed) && trimmed.includes('/')) return true;
  return false;
}

function normalizeFileTrees(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeFence = false;
  let fenceChar = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const fenceMatch = line.match(/^(```+|~~~+)/);
    if (fenceMatch) {
      if (!inCodeFence) {
        inCodeFence = true;
        fenceChar = fenceMatch[1];
      } else if (line.startsWith(fenceChar)) {
        inCodeFence = false;
        fenceChar = '';
      }
      out.push(line);
      i++;
      continue;
    }

    if (inCodeFence) {
      out.push(line);
      i++;
      continue;
    }

    if (isTreeLine(line)) {
      const treeStart = i;
      while (i < lines.length && (isTreeLine(lines[i]) || lines[i].trim() === '')) {
        i++;
      }
      const treeLines = lines.slice(treeStart, i).filter((l) => l.trim() !== '');
      if (treeLines.length >= 3) {
        if (out.length > 0 && out[out.length - 1].trim() !== '') out.push('');
        out.push('```tree');
        out.push(...treeLines);
        out.push('```');
        if (i < lines.length && lines[i].trim() !== '') out.push('');
        continue;
      }
      for (let j = treeStart; j < i; j++) out.push(lines[j]);
      continue;
    }

    out.push(line);
    i++;
  }

  return out.join('\n');
}

function normalizeMarkdownTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|[-\s:|]+\|\s*$/.test(line)) {
      let headerIdx = i - 1;
      while (headerIdx >= 0 && !lines[headerIdx].trim().startsWith('|')) headerIdx--;
      if (headerIdx >= 0) {
        const headerCols = lines[headerIdx].split('|').filter((s) => s.trim() !== '').length;
        const sepParts = line.split('|').filter((s) => s.trim() !== '');
        if (sepParts.length !== headerCols) {
          const newSep = '| ' + Array(headerCols).fill('---').join(' | ') + ' |';
          out.push(newSep);
          continue;
        }
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ */
/*  ChatMarkdown component                                            */
/* ------------------------------------------------------------------ */

interface ChatMarkdownProps {
  content: string;
}

export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const normalized = useMemo(
    () => normalizeFileTrees(normalizeMarkdownTables(content)),
    [content]
  );

  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkGfm ? [remarkGfm] : []}
        components={{
          code(props) {
            const { children, className, node, ...rest } = props;
            const isInline = !!(props as any).inline;
            if (!isInline) {
              return (
                <CodeBlock className={className} inline={false} {...rest}>
                  {children}
                </CodeBlock>
              );
            }
            return <InlineCode>{children}</InlineCode>;
          },
          a({ children, href }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            return <img src={src} alt={alt} className="markdown-img" />;
          },
          table({ children }) {
            return (
              <div className="table-wrapper">
                <table className="markdown-table">{children}</table>
              </div>
            );
          },
        }}
      >
        {normalized}
      </ReactMarkdown>
    </div>
  );
}
