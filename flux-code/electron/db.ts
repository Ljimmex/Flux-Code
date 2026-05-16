import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';

const MIGRATIONS = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    git_branch TEXT,
    git_remote TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    mode TEXT DEFAULT 'chat',
    model TEXT,
    status TEXT DEFAULT 'idle',
    worktree_path TEXT,
    branch_name TEXT,
    reasoning_level INTEGER DEFAULT 3,
    access_level TEXT DEFAULT 'supervised',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS skills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    system_prompt TEXT,
    tools TEXT,
    model TEXT,
    is_builtin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS quick_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    keybinding TEXT,
    auto_run INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS api_keys (
    provider TEXT PRIMARY KEY,
    key_encrypted BLOB NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `
  CREATE TABLE IF NOT EXISTS usage_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0
  );
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id);
  `,
  `
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
  `,
];

const BUILT_IN_SKILLS = [
  { name: 'react-component', description: 'Stwórz komponent React z TypeScript', system_prompt: 'You are a React expert. Create clean, typed React components with TypeScript.', tools: '[]', model: 'gpt-4' },
  { name: 'api-endpoint', description: 'Dodaj endpoint API z walidacją', system_prompt: 'You are a backend API expert. Create RESTful endpoints with proper validation.', tools: '[]', model: 'gpt-4' },
  { name: 'test-writer', description: 'Napisz testy jednostkowe dla tej funkcji', system_prompt: 'You are a testing expert. Write comprehensive unit tests.', tools: '[]', model: 'gpt-4' },
  { name: 'refactor', description: 'Zrefaktoryzuj ten kod', system_prompt: 'You are a code quality expert. Refactor code for clarity and performance.', tools: '[]', model: 'gpt-4' },
  { name: 'docs', description: 'Wygeneruj dokumentację dla tego modułu', system_prompt: 'You are a technical writer. Generate clear documentation.', tools: '[]', model: 'gpt-4' },
  { name: 'security', description: 'Przeskanuj kod pod kątem bezpieczeństwa', system_prompt: 'You are a security expert. Scan code for vulnerabilities.', tools: '[]', model: 'gpt-4' },
  { name: 'optimize', description: 'Zoptymalizuj wydajność tego kodu', system_prompt: 'You are a performance expert. Optimize code for speed and efficiency.', tools: '[]', model: 'gpt-4' },
];

export class DatabaseManager {
  private db: Database.Database | null = null;

  init(): void {
    const dbDir = app.getPath('userData');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const dbPath = path.join(dbDir, 'flux-code.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.runMigrations();
    this.seedBuiltInSkills();
  }

  private runMigrations(): void {
    if (!this.db) return;
    for (const migration of MIGRATIONS) {
      this.db.exec(migration);
    }
    // Add is_read column to threads if not exists (backward compat)
    const cols = this.db.pragma("table_info(threads)") as Array<{ name: string }>;
    const hasIsRead = cols.some(c => c.name === 'is_read');
    if (!hasIsRead) {
      this.db.exec('ALTER TABLE threads ADD COLUMN is_read INTEGER DEFAULT 1');
    }
    this.db.exec("UPDATE threads SET is_read = 1 WHERE is_read IS NULL");
  }

  private seedBuiltInSkills(): void {
    if (!this.db) return;
    const stmt = this.db.prepare('INSERT OR IGNORE INTO skills (name, description, system_prompt, tools, model, is_builtin) VALUES (?, ?, ?, ?, ?, 1)');
    for (const skill of BUILT_IN_SKILLS) {
      stmt.run(skill.name, skill.description, skill.system_prompt, skill.tools, skill.model);
    }
  }

  getProjects(): any[] {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
  }

  addProject(name: string, projectPath: string): any {
    if (!this.db) return null;
    const stmt = this.db.prepare('INSERT INTO projects (name, path) VALUES (?, ?)');
    const result = stmt.run(name, projectPath);
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(result.lastInsertRowid);
  }

  removeProject(id: number): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  getThreads(projectId: number): any[] {
    if (!this.db) return [];
    return this.db.prepare("SELECT * FROM threads WHERE project_id = ? AND status != 'archived' ORDER BY updated_at DESC").all(projectId);
  }

  addThread(projectId: number, title: string, mode: string = 'chat'): any {
    if (!this.db) return null;
    const now = new Date().toISOString();
    const stmt = this.db.prepare('INSERT INTO threads (project_id, title, mode, updated_at) VALUES (?, ?, ?, ?)');
    const result = stmt.run(projectId, title, mode, now);
    return this.db.prepare('SELECT * FROM threads WHERE id = ?').get(result.lastInsertRowid);
  }

  renameThread(id: number, title: string): void {
    if (!this.db) return;
    const now = new Date().toISOString();
    this.db.prepare('UPDATE threads SET title = ?, updated_at = ? WHERE id = ?').run(title, now, id);
  }

  markThreadRead(id: number): void {
    if (!this.db) return;
    this.db.prepare('UPDATE threads SET is_read = 1 WHERE id = ?').run(id);
  }

  markThreadUnread(id: number): void {
    if (!this.db) return;
    this.db.prepare('UPDATE threads SET is_read = 0 WHERE id = ?').run(id);
  }

  archiveThread(id: number): void {
    if (!this.db) return;
    const now = new Date().toISOString();
    this.db.prepare('UPDATE threads SET status = ?, updated_at = ? WHERE id = ?').run('archived', now, id);
  }

  deleteThread(id: number): void {
    if (!this.db) return;
    this.db.prepare('DELETE FROM threads WHERE id = ?').run(id);
  }

  renameProject(id: number, name: string): void {
    if (!this.db) return;
    this.db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name, id);
  }

  getSettings(): Record<string, string> {
    if (!this.db) return {};
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return settings;
  }

  setSetting(key: string, value: string): void {
    if (!this.db) return;
    const stmt = this.db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}
