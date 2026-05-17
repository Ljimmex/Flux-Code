import { ipcMain, type WebContents } from 'electron';
import OpenAI from 'openai';
import type { DatabaseManager } from './db';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

let dbManager: DatabaseManager;
let activeStreams = new Map<number, AbortController>();

export function initChat(db: DatabaseManager): void {
  dbManager = db;

  ipcMain.handle('chat:getMessages', (_, threadId: number) => {
    return dbManager.getMessages(threadId);
  });

  ipcMain.handle('chat:sendMessage', async (event, threadId: number, userMessage: string, model: string) => {
    // Save user message
    dbManager.addMessage(threadId, 'user', userMessage);

    // Get conversation history
    const history = dbManager.getMessages(threadId) as Array<{ role: string; content: string }>;
    const messages: ChatMessage[] = history.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Update thread status
    dbManager.updateThreadStatus(threadId, 'generating');
    dbManager.updateThreadModel(threadId, model);

    // Start streaming
    const abortController = new AbortController();
    activeStreams.set(threadId, abortController);

    const apiKey = dbManager.getSettings()['openai_api_key'];
    if (!apiKey) {
      event.sender.send('chat:error', { threadId, error: 'OpenAI API key not configured. Add it in Settings > Providers.' });
      dbManager.updateThreadStatus(threadId, 'idle');
      return;
    }

    const openai = new OpenAI({ apiKey });

    try {
      const stream = await openai.chat.completions.create(
        {
          model: model || 'gpt-4o-mini',
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

      // Save assistant response
      if (fullContent) {
        dbManager.addMessage(threadId, 'assistant', fullContent);
      }

      dbManager.updateThreadStatus(threadId, 'idle');
      event.sender.send('chat:done', { threadId });
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
