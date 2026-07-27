export interface StreamMessage {
  streamId: string;
  fields: Record<string, string>;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
}

export interface ToolCall {
  call: true;
  tool: string;
  args: Record<string, unknown>;
}

export interface RouterConfig {
  redisHost: string;
  redisPort: number;
  stream: string;
  model: string;
}
