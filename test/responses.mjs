import assert from 'node:assert/strict';
import { passthroughResponsesSSE } from '../src/index.js';

const enc = new TextEncoder();
const sourceText = [
  'event: response.created\ndata: {"type":"response.created"}\n\n',
  'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":4,"total_tokens":7}}}\n\n',
].join('');
let cancelled = false;
const upstream = new ReadableStream({
  async start(controller) {
    const bytes = enc.encode(sourceText);
    controller.enqueue(bytes.slice(0, 31));
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.enqueue(bytes.slice(31));
    controller.close();
  },
  cancel() { cancelled = true; },
});
let result;
const out = passthroughResponsesSSE(
  upstream,
  (usage, finish, meta) => { result = { usage, finish, meta }; },
  { stream_idle_timeout_ms: 1000, stream_keepalive_ms: 0, stream_first_byte_ms: 1000 }
);
const text = await new Response(out).text();
assert.equal(text, sourceText, 'Responses SSE 必须原样透传');
assert.deepEqual(result.usage, { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 });
assert.equal(result.finish, 'complete');
assert.equal(cancelled, false);
console.log('ok 1) Responses SSE 原样透传并提取 usage');
