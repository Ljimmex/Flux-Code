import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export function initDiffIPC(): void {
  ipcMain.handle('diff:readFile', async (_, filePath: string) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return { success: true, content };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diff:gitDiff', async (_, projectPath: string, filePath?: string) => {
    try {
      const cwd = projectPath;
      const args = filePath ? ['--', filePath] : [];
      const output = execSync(`git diff ${args.join(' ')}`, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      return { success: true, patch: output };
    } catch (err: any) {
      // git diff returns exit code 1 when there are no changes
      if (err.status === 1 && err.stdout === '') {
        return { success: true, patch: '' };
      }
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('diff:gitShow', async (_, projectPath: string, filePath: string, ref = 'HEAD') => {
    try {
      const output = execSync(`git show ${ref}:"${filePath}"`, {
        cwd: projectPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      });
      return { success: true, content: output };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });
}
