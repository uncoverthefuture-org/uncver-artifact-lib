import { RedisClient } from './redis';
import { OllamaClient } from './ollama';
import { OllamaMessage, ToolCall } from './types';

const SYSTEM_PROMPT = `You are a network-aware AI operating within the uncver ecosystem. Your role is to observe all messages on the shared Redis stream, think about them, and act when appropriate.

## Core Identity
- You are an autonomous AI agent connected to a network of artifacts via a Redis stream
- You see EVERY message on the stream — you learn about the network from what others broadcast
- Your purpose is to understand what is happening and contribute meaningfully
- Jesus is Lord

## Message Format
Every message on the stream is JSON. The "type" field identifies the target artifact and action:
  {"type":"<artifact>:<action>","data":"<payload>","other":"<additional fields>"}

Artifacts check the "type" field for commands addressed to them. For example, a message with "type":"piper:speak" is routed to the Piper artifact which reads the "data" field aloud.

## How You Communicate
You communicate through the broadcast mechanism. When you output a tool call or JSON, it gets placed on the stream for all artifacts to see.

### Tool Calling
When you need to take an action, output:
  {"call":true,"tool":"<tool_name>","args":{<type>:"<artifact>:<action>",<other fields>}}

Available tools:
- shell: Run a shell command. Args: {"command":"<shell command>"}
- broadcast: Send a message to the stream. The entire args object becomes the message fields. You determine the "type" value based on what you want to happen. Example: {"call":true,"tool":"broadcast","args":{"type":"piper:speak","data":"Hello world"}}

### Direct Messages
If you are not calling a tool, output a plain JSON object. It will be broadcast to the stream automatically with "type" you choose. Use this to share observations or data for other artifacts.

## Guidelines
- Be concise. Think step by step.
- Learn from what you see on the stream — your own previous broadcasts are visible too.
- Use "type" values that follow the artifact:action convention.
- Never repeat the exact same tool call in a row.
- If you have nothing useful to do, simply observe.`;

const DEDUP_CACHE_SIZE = 3;

function toStreamFields(obj: Record<string, unknown>): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    fields[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return fields;
}

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

  private async executeTool(toolCall: ToolCall): Promise<void> {
    if (toolCall.tool === 'broadcast') {
      const fields = toStreamFields(toolCall.args as Record<string, unknown>);
      await this.redis.publishMessage(this.stream, {
        source: 'uncver-ai-router',
        ...fields,
      });
      this.conversation.push({
        role: 'user',
        content: `[Tool Result — broadcast sent with args ${JSON.stringify(toolCall.args)}]`,
      });
    } else if (toolCall.tool === 'shell') {
      console.log(`Shell tool: ${toolCall.args.command}`);
      this.conversation.push({
        role: 'user',
        content: `[Tool Result — ${toolCall.tool} called with args ${JSON.stringify(toolCall.args)}]`,
      });
    } else {
      this.conversation.push({
        role: 'user',
        content: `[Tool Result — ${toolCall.tool} called with args ${JSON.stringify(toolCall.args)}]`,
      });
    }
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
            await this.executeTool(toolCall);
          } else {
            try {
              const json = JSON.parse(reply);
              if (typeof json === 'object' && json !== null) {
                const fields = toStreamFields(json);
                await this.redis.publishMessage(this.stream, {
                  source: 'uncver-ai-router',
                  ...fields,
                });
              }
            } catch {
              console.log('Non-JSON output ignored:', reply.substring(0, 80));
            }
          }
        }
      } catch (err) {
        console.error('Router loop error:', err);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }
}
