import { useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js';
import { Copy, Check } from './icons';

function CodeBlock({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}) {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [children]);

  const match = /language-(\w+)/.exec(className || '');
  const lang = match ? match[1] : '';
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        {lang && <span className="code-lang">{lang}</span>}
        <button className="code-copy-btn" onClick={handleCopy} title="Copy code">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className={`code-pre ${className || ''}`}>
        <code ref={codeRef} className={className || ''} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

function InlineCode({ children }: { children?: ReactNode }) {
  return <code className="inline-code">{children}</code>;
}

interface MarkdownRendererProps {
  content: string;
}

/** Normalize malformed markdown tables from LLM output.
 *  Fixes separators with wrong column count (e.g. header has 2 cols, separator has 3).
 */
function normalizeMarkdownTables(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect table separator line: starts with |, contains only |, -, :, spaces
    if (/^\s*\|[-\s:|]+\|\s*$/.test(line)) {
      // Find the preceding table header (non-empty line starting with |)
      let headerIdx = i - 1;
      while (headerIdx >= 0 && !lines[headerIdx].trim().startsWith('|')) {
        headerIdx--;
      }
      if (headerIdx >= 0) {
        const headerCols = lines[headerIdx].split('|').filter((s) => s.trim() !== '').length;
        const sepParts = line.split('|').filter((s) => s.trim() !== '');
        if (sepParts.length !== headerCols) {
          // Rebuild separator to match header column count
          const sepCell = '---';
          const newSep = '| ' + Array(headerCols).fill(sepCell).join(' | ') + ' |';
          out.push(newSep);
          continue;
        }
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const normalized = normalizeMarkdownTables(content);
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={remarkGfm ? [remarkGfm] : []}
        components={{
          code(props) {
            const { children, className, node, ...rest } = props;
            const isBlock = (className || '').includes('language-');
            if (isBlock) {
              return (
                <CodeBlock className={className} {...rest}>
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
