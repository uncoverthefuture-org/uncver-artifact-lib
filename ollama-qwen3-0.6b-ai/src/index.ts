import { Router } from './router';

const STREAM = process.env['SHARED_STREAM'] || 'uncver:ai:router';
const REDIS_HOST = process.env['REDIS_HOST'] || 'localhost';
const REDIS_PORT = parseInt(process.env['REDIS_PORT'] || '6379', 10);
const MODEL = process.env['OLLAMA_MODEL'] || 'qwen3:0.6b';

async function main(): Promise<void> {
  console.log(`Starting ollama-qwen3-0.6b-ai router`);
  console.log(`  Redis: ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`  Stream: ${STREAM}`);
  console.log(`  Model: ${MODEL}`);

  const router = new Router(REDIS_HOST, REDIS_PORT, STREAM, MODEL);
  await router.run();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
