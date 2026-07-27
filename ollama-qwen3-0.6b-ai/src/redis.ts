import Redis from 'ioredis';
import { StreamMessage } from './types';

export class RedisClient {
  private client: Redis;

  constructor(host: string, port: number) {
    this.client = new Redis({
      host,
      port,
      retryStrategy: (times: number) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: null,
    });
  }

  async readMessages(
    stream: string,
    lastId: string = '$',
    count: number = 10,
    blockMs: number = 5000
  ): Promise<StreamMessage[]> {
    const results = await this.client.xread(
      'COUNT',
      count,
      'BLOCK',
      blockMs,
      'STREAMS',
      stream,
      lastId
    );
    if (!results) return [];

    const messages: StreamMessage[] = [];
    for (const [, entries] of results) {
      for (const [id, fields] of entries) {
        const fieldsObj: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldsObj[fields[i]] = fields[i + 1];
        }
        messages.push({ streamId: id, fields: fieldsObj });
      }
    }
    return messages;
  }

  async publishMessage(
    stream: string,
    fields: Record<string, string>
  ): Promise<string> {
    const entries: string[] = [];
    for (const [key, value] of Object.entries(fields)) {
      entries.push(key, value);
    }
    const result = await this.client.xadd(stream, '*', ...entries);
    return result ?? '';
  }

  get clientInstance(): Redis {
    return this.client;
  }

  async quit(): Promise<void> {
    await this.client.quit();
  }
}
