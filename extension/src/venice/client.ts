import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

function getConfig() {
  const config = vscode.workspace.getConfiguration('creativeWriter');
  return {
    model: config.get<string>('model', 'olafangensan-glm-4.7-flash-heretic'),
    imageModel: config.get<string>('imageModel', 'nano-banana-pro'),
    endpoint: config.get<string>('apiEndpoint', 'https://api.venice.ai/api/v1'),
  };
}

export class VeniceClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: StreamChunk) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const { model, endpoint } = getConfig();
    const url = new URL(`${endpoint}/chat/completions`);

    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model,
        messages,
        stream: true,
        venice_parameters: { disable_safety: true },
      });

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
      };

      const req = https.request(options, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          let errorBody = '';
          res.on('data', (chunk) => { errorBody += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(errorBody);
              reject(new Error(parsed.error?.message || `API error ${res.statusCode}`));
            } catch {
              reject(new Error(`API error ${res.statusCode}: ${errorBody.slice(0, 200)}`));
            }
          });
          return;
        }

        let fullContent = '';
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) { continue; }
            const data = trimmed.slice(6);
            if (data === '[DONE]') {
              onChunk({ content: '', done: true });
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                onChunk({ content: delta, done: false });
              }
            } catch {
              // Skip unparseable chunks
            }
          }
        });

        res.on('end', () => resolve(fullContent));
        res.on('error', reject);
      });

      req.on('error', reject);

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy();
          reject(new Error('Request aborted'));
        });
      }

      req.write(body);
      req.end();
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const { model, endpoint } = getConfig();

    return new Promise((resolve, reject) => {
      const url = new URL(`${endpoint}/chat/completions`);
      const body = JSON.stringify({
        model,
        messages,
        stream: false,
        venice_parameters: { disable_safety: true },
      });

      const options: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              reject(new Error(parsed.error.message || 'API error'));
              return;
            }
            resolve(parsed.choices?.[0]?.message?.content || '');
          } catch {
            reject(new Error('Failed to parse API response'));
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async generateImage(
    prompt: string,
    outputDir: string,
    options?: { width?: number; height?: number }
  ): Promise<string> {
    const { imageModel, endpoint } = getConfig();

    return new Promise((resolve, reject) => {
      const url = new URL(`${endpoint}/image/generate`);
      const body = JSON.stringify({
        model: imageModel,
        prompt,
        width: options?.width || 1024,
        height: options?.height || 1024,
        safe_mode: false,
      });

      const reqOptions: https.RequestOptions = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(reqOptions, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          try {
            const parsed = JSON.parse(data.toString());

            if (parsed.error) {
              reject(new Error(parsed.error.message || 'Image generation failed'));
              return;
            }

            const imageData = parsed.data?.[0]?.b64_json || parsed.images?.[0];
            if (!imageData) {
              reject(new Error('No image data in response'));
              return;
            }

            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }

            const timestamp = Date.now();
            const slug = prompt.slice(0, 40).replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
            const filename = `${slug}-${timestamp}.png`;
            const filepath = path.join(outputDir, filename);

            const buffer = Buffer.from(imageData, 'base64');
            fs.writeFileSync(filepath, buffer);
            resolve(filepath);
          } catch {
            reject(new Error('Failed to parse image response'));
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}
