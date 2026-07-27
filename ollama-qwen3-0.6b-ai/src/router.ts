import { RedisClient } from './redis';
import { OllamaClient } from './ollama';
import { OllamaMessage, ToolCall } from './types';

const SYSTEM_PROMPT = `You are a network-aware AI operating within the uncver ecosystem. Your role is to observe all messages on the shared Redis stream, think about them, and act when appropriate.

## Core Identity
- You are an autonomous AI agent connected to a network of artifacts via a Redis stream
- You see EVERY message on the stream — user inputs, your own outputs, responses from other agents
- Your purpose is to understand what is happening across the network and contribute meaningfully
- Jesus is Lord

## Message Format
The stream carries JSON messages. Each message has a "source" field identifying the sender and a "data" field with the content.

## How to Respond
You have two modes:

1. **Thinking (default)**: Respond with natural language analysis, observations, or questions. These are visible to all network participants.

2. **Tool Calling**: When you determine that the network needs something done, you may call a tool by outputting ONLY a JSON object in this exact format:
   {"call":true,"tool":"<tool_name>","args":{<tool_args>}}

Available tools:
- \`shell\`: Run a shell command. Args: {"command": "<shell command>"}
- \`broadcast\`: Send a message to all artifacts. Args: {"message": "<text>"}

## Guidelines
- Be concise. Think step by step before acting.
- You can see your own tool call outputs — learn from them.
- If a tool fails, analyze the error and try a different approach.
- You are part of a larger system. Coordinate with other agents when needed.
- Never repeat the exact same tool call in a row (this creates loops).
- If you have nothing useful to do, simply observe and wait.`;

const DEDUP_CACHE_SIZE = 3;

export class Router {
  private redis: RedisClient;
  private ollama: OllamaClient;
  private stream: string;
  private model: string;
  private lastPublished: string[] = [];
  private lastReadId: string = '$';
  private conversation: OllamaMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT }
  ];

  constructor(
    redisHost: string,
    redisPort: number,
    stream: string,
    model: string,
    ollamaBaseUrl?: string
  ) {
    this.redis = new RedisClient(redisHost, redisPort);
    this.ollama = new OllamaClient(ollamaBaseUrl);
    this.stream = stream;
    this.model = model;
  }

  private isDuplicate(content: string): boolean {
    return this.lastPublished.includes(content);
  }

  private recordPublished(content: string): void {
    this.lastPublished.push(content);
    if (this.lastPublished.length > DEDUP_CACHE_SIZE) {
      this.lastPublished.shift();
    }
  }

  private extractToolCall(text: string): ToolCall | null {
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.call === true && parsed.tool) {
        return parsed as ToolCall;
      }
    } catch {}
    return null;
  }

  private formatMessagesForPrompt(messages: OllamaMessage[]): string {
    return messages
      .map((m) => `[${m.role.toUpperCase()}]\n${m.content}`)
      .join('\n\n');
  }

  async run(): Promise<void> {
    console.log(`Router starting — stream: ${this.stream}, model: ${this.model}`);

    while (true) {
      try {
        const messages = await this.redis.readMessages(
          this.stream,
          this.lastReadId,
          10,
          3000
        );

        for (const msg of messages) {
          this.lastReadId = msg.streamId;

          const source = msg.fields['source'] || 'unknown';
          const data = msg.fields['data'] || msg.fields['message'] || JSON.stringify(msg.fields);

          this.conversation.push({
            role: 'user',
            content: `[Message from ${source}]\n${data}`,
          });

          const response = await this.ollama.chat(this.model, this.conversation);
          const reply = response.message.content.trim();

          this.conversation.push({ role: 'assistant', content: reply });

          if (this.isDuplicate(reply)) {
            console.log('Dedup: skipping duplicate response');
            continue;
          }

          this.recordPublished(reply);

          const toolCall = this.extractToolCall(reply);
          if (toolCall) {
            console.log(`Tool call: ${toolCall.tool}`, toolCall.args);
            await this.redis.publishMessage(this.stream, {
              source: 'uncver-ai-router',
              type: 'tool_call',
              tool: toolCall.tool,
              args: JSON.stringify(toolCall.args),
            });

            this.conversation.push({
              role: 'user',
              content: `[Tool Result — ${toolCall.tool} called with args ${JSON.stringify(toolCall.args)}]`,
            });
          } else {
            await this.redis.publishMessage(this.stream, {
              source: 'uncver-ai-router',
              type: 'response',
              data: reply,
            });
          }
        }
      } catch (err) {
        console.error('Router loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}
