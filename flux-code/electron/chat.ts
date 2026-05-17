import { ipcMain } from 'electron';
import OpenAI from 'openai';
import type { DatabaseManager } from './db';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let dbManager: DatabaseManager;
let activeStreams = new Map<number, AbortController>();

const OLLAMA_BASE_URL = 'http://localhost:11434';

function getProviderAndModel(model: string): { provider: string; modelName: string } {
  const parts = model.split(':');
  if (parts.length >= 2) {
    return { provider: parts[0], modelName: parts.slice(1).join(':') };
  }
  return { provider: 'codex', modelName: model };
}

async function streamOpenAI(
  event: Electron.IpcMainInvokeEvent,
  threadId: number,
  messages: ChatMessage[],
  model: string,
  abortController: AbortController
) {
  const { modelName } = getProviderAndModel(model);
  const apiKey = dbManager.getSettings()['openai_api_key'];
  if (!apiKey) {
    event.sender.send('chat:error', { threadId, error: 'OpenAI API key not configured. Add it in Settings > Providers.' });
    dbManager.updateThreadStatus(threadId, 'idle');
    return;
  }

  const openai = new OpenAI({ apiKey });

  const stream = await openai.chat.completions.create(
    {
      model: modelName || 'gpt-4o-mini',
      messages,
      stream: true,
    },
    { signal: abortController.signal }
  );

  let fullContent = '';

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content || '';
    if (token) {
      fullContent += token;
      event.sender.send('chat:token', { threadId, token });
    }

    if (abortController.signal.aborted) {
      break;
    }
  }

  if (fullContent) {
    dbManager.addMessage(threadId, 'assistant', fullContent);
  }

  dbManager.updateThreadStatus(threadId, 'idle');
  event.sender.send('chat:done', { threadId });
}

async function streamOllama(
  event: Electron.IpcMainInvokeEvent,
  threadId: number,
  messages: ChatMessage[],
  model: string,
  abortController: AbortController
) {
  const { modelName: ollamaModel } = getProviderAndModel(model);

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        messages,
        stream: true,
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => 'Unknown error');
      throw new Error(`Ollama error (${response.status}): ${text}`);
    }

    if (!response.body) {
      throw new Error('Ollama returned empty response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    while (true) {
      if (abortController.signal.aborted) {
        reader.cancel();
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          const token = data.message?.content || '';
          if (token) {
            fullContent += token;
            event.sender.send('chat:token', { threadId, token });
          }
          if (data.done) {
            reader.cancel();
            break;
          }
        } catch {
          // Ignore malformed lines
        }
      }
    }

    if (fullContent) {
      dbManager.addMessage(threadId, 'assistant', fullContent);
    }

    dbManager.updateThreadStatus(threadId, 'idle');
    event.sender.send('chat:done', { threadId });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      dbManager.updateThreadStatus(threadId, 'idle');
      event.sender.send('chat:done', { threadId });
      return;
    }
    const msg = err.message || 'Unknown Ollama error';
    if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
      throw new Error('Ollama is not running. Start it with: ollama run ' + ollamaModel);
    }
    throw err;
  }
}

export function initChat(db: DatabaseManager): void {
  dbManager = db;

  ipcMain.handle('chat:getMessages', (_, threadId: number) => {
    return dbManager.getMessages(threadId);
  });

  ipcMain.handle('chat:sendMessage', async (event, threadId: number, userMessage: string, model: string) => {
    dbManager.addMessage(threadId, 'user', userMessage);

    const history = dbManager.getMessages(threadId) as Array<{ role: string; content: string }>;
    const messages: ChatMessage[] = history.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    dbManager.updateThreadStatus(threadId, 'generating');
    dbManager.updateThreadModel(threadId, model);

    const abortController = new AbortController();
    activeStreams.set(threadId, abortController);

    try {
      const { provider } = getProviderAndModel(model);
      if (provider === 'ollama') {
        await streamOllama(event, threadId, messages, model, abortController);
      } else if (provider === 'claude') {
        event.sender.send('chat:error', { threadId, error: 'Claude CLI integration is coming soon. Please use Codex CLI or Ollama for now.' });
        dbManager.updateThreadStatus(threadId, 'idle');
      } else if (provider === 'opencode') {
        event.sender.send('chat:error', { threadId, error: 'OpenCode CLI integration is coming soon. Please use Codex CLI or Ollama for now.' });
        dbManager.updateThreadStatus(threadId, 'idle');
      } else {
        await streamOpenAI(event, threadId, messages, model, abortController);
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Unknown error';
      dbManager.updateThreadStatus(threadId, 'error');
      event.sender.send('chat:error', { threadId, error: errorMessage });
    } finally {
      activeStreams.delete(threadId);
    }
  });

  ipcMain.handle('chat:cancel', (_, threadId: number) => {
    const controller = activeStreams.get(threadId);
    if (controller) {
      controller.abort();
      activeStreams.delete(threadId);
      dbManager.updateThreadStatus(threadId, 'idle');
    }
  });
}

export function cleanupChat(): void {
  for (const controller of activeStreams.values()) {
    controller.abort();
  }
  activeStreams.clear();
}
