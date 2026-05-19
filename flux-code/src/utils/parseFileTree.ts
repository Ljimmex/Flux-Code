const BOX_CHARS = /[├┤┌┐└┘┬┴┼─│╭╮╯╰]/;
const COMMENT_SPLIT = /\s+#\s+/;

function detectTreeFormat(lines: string[]): 'box' | 'indent' | null {
  let boxCount = 0;
  let indentCount = 0;
  for (const line of lines) {
    if (BOX_CHARS.test(line)) boxCount++;
    else if (/^\s+\S/.test(line)) indentCount++;
  }
  if (boxCount >= 2) return 'box';
  if (indentCount >= 2) return 'indent';
  return null;
}

export interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

export interface ParsedTree {
  nodes: FileTreeNode[];
  descriptions: Record<string, string>;
}

function splitNameAndComment(rawName: string): { name: string; comment?: string } {
  const match = rawName.match(COMMENT_SPLIT);
  if (!match || match.index == null) {
    return { name: rawName.trim() };
  }
  const name = rawName.slice(0, match.index).trim();
  const comment = rawName.slice(match.index + match[0].length).trim();
  return { name, comment };
}

function parseBoxTree(lines: string[]): ParsedTree {
  const roots: FileTreeNode[] = [];
  const stack: { node: FileTreeNode; depth: number; path: string }[] = [];
  const descriptions: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;

    const nameWithComment = line.replace(/^[\s│├└┌┐┬┴┼─╭╮╯╰]+/, '');
    if (!nameWithComment) continue;

    const prefixLength = line.length - nameWithComment.length;
    const depth = Math.floor(prefixLength / 4);
    const trimmedName = nameWithComment.trimStart();

    // Standalone comment line -> description for the nearest parent folder
    if (trimmedName.startsWith('#')) {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        const desc = trimmedName.replace(/^#\s*/, '').trim();
        if (desc) {
          descriptions[parent.path] = desc;
        }
      }
      continue;
    }

    const { name, comment } = splitNameAndComment(nameWithComment);
    if (!name) continue;

    const isFolder = name.endsWith('/');
    const node: FileTreeNode = {
      name: isFolder ? name : name,
      type: isFolder ? 'folder' : 'file',
      children: isFolder ? [] : undefined,
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    let path: string;
    if (stack.length === 0) {
      roots.push(node);
      path = name;
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.node.children) parent.node.children = [];
      parent.node.children.push(node);
      path = parent.path + name;
    }

    if (comment) {
      descriptions[path] = comment;
    }

    if (isFolder) {
      stack.push({ node, depth, path });
    }
  }

  return { nodes: roots, descriptions };
}

function parseIndentTree(lines: string[]): ParsedTree {
  const roots: FileTreeNode[] = [];
  const stack: { node: FileTreeNode; indent: number; path: string }[] = [];
  const descriptions: Record<string, string> = {};

  for (const line of lines) {
    if (!line.trim()) continue;
    const trimmed = line.replace(/\s+$/, '');
    const indent = trimmed.length - trimmed.trimStart().length;
    const rawName = trimmed.trimStart();
    if (!rawName) continue;

    // Standalone comment line -> description for parent folder
    if (rawName.startsWith('#')) {
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        const desc = rawName.replace(/^#\s*/, '').trim();
        if (desc) {
          descriptions[parent.path] = desc;
        }
      }
      continue;
    }

    const { name, comment } = splitNameAndComment(rawName);
    if (!name) continue;

    const isFolder = name.endsWith('/');
    const node: FileTreeNode = {
      name: isFolder ? name : name,
      type: isFolder ? 'folder' : 'file',
      children: isFolder ? [] : undefined,
    };

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    let path: string;
    if (stack.length === 0) {
      roots.push(node);
      path = name;
    } else {
      const parent = stack[stack.length - 1];
      if (!parent.node.children) parent.node.children = [];
      parent.node.children.push(node);
      path = parent.path + name;
    }

    if (comment) {
      descriptions[path] = comment;
    }

    if (isFolder) {
      stack.push({ node, indent, path });
    }
  }

  return { nodes: roots, descriptions };
}

/** Parse a block of text that looks like a file tree into structured nodes + descriptions. */
export function parseFileTree(text: string): ParsedTree | null {
  const lines = text.split('\n');
  const format = detectTreeFormat(lines);

  if (format === 'box') {
    return parseBoxTree(lines);
  }
  if (format === 'indent') {
    return parseIndentTree(lines);
  }

  // Fallback: flat list of paths (no indentation, no box chars)
  const pathLines = lines.filter((l) => l.trim());
  if (pathLines.length >= 1) {
    const descriptions: Record<string, string> = {};
    const nodes: FileTreeNode[] = [];
    for (const line of pathLines) {
      const { name, comment } = splitNameAndComment(line.trim());
      if (!name) continue;
      const isFolder = name.endsWith('/');
      const node: FileTreeNode = {
        name: isFolder ? name : name,
        type: isFolder ? 'folder' : 'file',
      };
      nodes.push(node);
      if (comment) {
        descriptions[name] = comment;
      }
    }
    if (nodes.length > 0) {
      return { nodes, descriptions };
    }
  }

  return null;
}

/** Convert nested FileTreeNode[] into a flat list of paths for @pierre/trees. */
export function flattenFileTreeNodes(
  nodes: FileTreeNode[],
  descriptions: Record<string, string>,
  prefix = ''
): { paths: string[]; descriptions: Record<string, string> } {
  const paths: string[] = [];
  const resultDescriptions: Record<string, string> = {};

  for (const node of nodes) {
    const path = prefix ? `${prefix}${node.name}` : node.name;
    paths.push(path);
    if (descriptions[path]) {
      resultDescriptions[path] = descriptions[path];
    }
    if (node.children && node.children.length > 0) {
      const childPrefix = node.type === 'folder' ? path : prefix;
      const child = flattenFileTreeNodes(node.children, descriptions, childPrefix);
      paths.push(...child.paths);
      Object.assign(resultDescriptions, child.descriptions);
    }
  }

  return { paths: [...new Set(paths)], descriptions: resultDescriptions };
}

/** Check if a code block looks like a file tree or a list of paths. */
export function isFileTree(code: string): boolean {
  const lines = code.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return false;

  // Check for box-drawing characters
  const boxLines = lines.filter((l) => BOX_CHARS.test(l));
  if (boxLines.length >= 2) return true;

  // Check for indent-based tree (consistent indentation, no code syntax)
  const indentLines = lines.filter((l) => /^\s+\S/.test(l));
  if (indentLines.length >= 2) {
    const codePatterns = /^(\s*)(const |let |var |function |class |import |export |if |for |while |return |#|\/\/|\/\*|\* |\|)/;
    const looksLikeCode = lines.some((l) => codePatterns.test(l));
    if (!looksLikeCode) return true;
  }

  // Check for flat list of paths or single path (e.g. "apps/api/", "bun.lock", "src/app.ts : desc")
  const pathLikeLines = lines.filter((l) => {
    const trimmed = l.trim();
    // Contains a slash or ends with a file extension, and doesn't look like code
    const isPathLike = trimmed.includes('/') || /^[^\s#]+\.\w+/.test(trimmed);
    const isCode = /^(const |let |var |function |class |import |export |if |for |while |return |#|\/\/|\/\*|\* |\|)/.test(trimmed);
    return isPathLike && !isCode;
  });
  if (pathLikeLines.length > 0 && pathLikeLines.length === lines.length) {
    return true;
  }

  return false;
}
