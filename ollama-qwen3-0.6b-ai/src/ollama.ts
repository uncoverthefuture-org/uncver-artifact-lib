import { OllamaMessage, OllamaChatResponse } from './types';

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async chat(
    model: string,
    messages: OllamaMessage[],
    options?: { stream?: boolean }
  ): Promise<OllamaChatResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: options?.stream ?? false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} ${text}`);
    }

    return response.json() as Promise<OllamaChatResponse>;
  }

  async isReady(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
