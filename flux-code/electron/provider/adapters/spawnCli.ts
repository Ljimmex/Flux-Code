/**
 * Windows-safe CLI spawning utility.
 *
 * Problem: On Windows, npm-installed CLIs exist as `.cmd` batch files.
 *  - `shell: false` → spawn can't execute `.cmd` files → ENOENT
 *  - `shell: true`  → cmd.exe splits multi-word args by spaces → broken prompts
 *
 * Solution: Resolve the binary via `where`, prefer `.exe` (works with shell:false),
 * fall back to `.cmd` (needs shell:true + manually-quoted args).
 */
import { spawn, execSync, type ChildProcess, type SpawnOptions } from 'child_process';

export interface ResolvedBinary {
  /** Full path to the executable */
  path: string;
  /** Whether shell: true is required (e.g. for .cmd files) */
  needsShell: boolean;
}

/**
 * Resolve a CLI binary name to a full path on the current platform.
 * On Windows, prefers .exe > .cmd > bare name.
 */
export function resolveBinary(name: string): ResolvedBinary {
  if (process.platform !== 'win32') {
    return { path: name, needsShell: false };
  }

  try {
    const whereOutput = execSync(`where ${name}`, {
      timeout: 5_000,
      encoding: 'utf-8' as BufferEncoding,
      shell: 'cmd.exe',
      stdio: ['pipe', 'pipe', 'ignore'],
    } as any).toString().trim();

    const lines = whereOutput.split(/\r?\n/).filter((l) => l.trim());

    // Prefer .exe (works with shell: false, no arg quoting issues)
    const exePath = lines.find((l) => l.toLowerCase().endsWith('.exe'));
    if (exePath) {
      return { path: exePath, needsShell: false };
    }

    // Fall back to .cmd (requires shell: true)
    const cmdPath = lines.find((l) => l.toLowerCase().endsWith('.cmd'));
    if (cmdPath) {
      return { path: cmdPath, needsShell: true };
    }

    // Last resort: first result (may be unix shim — try with shell)
    if (lines[0]) {
      return { path: lines[0], needsShell: true };
    }
  } catch {
    // `where` failed — binary not on PATH
  }

  // Fallback: use the name as-is with shell (let cmd.exe resolve it)
  return { path: name, needsShell: true };
}

/**
 * Quote a single argument for safe passage through cmd.exe.
 * Only quotes if the arg contains characters that would be interpreted by the shell.
 */
function quoteCmdArg(arg: string): string {
  // If no special characters, pass through as-is
  if (!/[\s"&|<>^%!]/.test(arg)) return arg;
  // Wrap in double quotes, escaping inner double quotes by doubling them
  return `"${arg.replace(/"/g, '""')}"`;
}

/**
 * Spawn a CLI process with proper Windows handling.
 *
 * When the binary is a .cmd file, this uses shell: true and
 * manually quotes arguments to prevent multi-word arg splitting.
 * When the binary is a .exe, this uses shell: false (ideal).
 */
export function spawnCli(
  binaryName: string,
  args: string[],
  options: SpawnOptions & { env?: NodeJS.ProcessEnv },
): ChildProcess {
  const resolved = resolveBinary(binaryName);

  console.log(
    `[spawnCli] binary: ${binaryName} → resolved: ${resolved.path} (shell: ${resolved.needsShell})`,
  );

  if (resolved.needsShell) {
    // For .cmd / shell-required binaries: manually quote args that contain spaces
    const quotedArgs = args.map(quoteCmdArg);
    return spawn(resolved.path, quotedArgs, {
      ...options,
      shell: true,
      windowsHide: true,
    });
  }

  // For .exe binaries: shell: false preserves args perfectly
  return spawn(resolved.path, args, {
    ...options,
    shell: false,
    windowsHide: true,
  });
}

/**
 * Check if a CLI binary is installed by trying to run `<binary> --version`.
 * Returns the resolved binary path if found, null otherwise.
 */
export function probeBinary(binaryName: string): string | null {
  const resolved = resolveBinary(binaryName);

  try {
    if (resolved.needsShell) {
      execSync(`"${resolved.path}" --version`, {
        timeout: 5_000,
        stdio: 'ignore',
        shell: 'cmd.exe',
      } as any);
    } else {
      execSync(`"${resolved.path}" --version`, {
        timeout: 5_000,
        stdio: 'ignore',
      });
    }
    return resolved.path;
  } catch {
    return null;
  }
}
