import assert from 'node:assert/strict';
import { passthroughResponsesSSE, channelProtocol, responseProbeBody } from '../src/index.js';

assert.equal(channelProtocol({ type: 'openai', protocol: 'responses' }), 'responses');
assert.equal(channelProtocol({ type: 'openai' }), 'chat');
assert.equal(channelProtocol({ type: 'anthropic', protocol: 'responses' }), 'chat');
assert.deepEqual(responseProbeBody('gpt-5.4', 'ping', 'responses'), {
  model: 'gpt-5.4', input: 'ping', max_output_tokens: 16, store: false,
});
assert.deepEqual(responseProbeBody('gpt-4o', 'ping', 'chat'), {
  model: 'gpt-4o', messages: [{ role: 'user', content: 'ping' }], max_tokens: 16,
});
console.log('ok 1) 渠道协议探测选择正确');

const enc = new TextEncoder();
const sourceText = [
  'event: response.created\ndata: {"type":"response.created"}\n\n',
  'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":4,"total_tokens":7}}}\n\n',
].join('');
const upstream = new ReadableStream({
  async start(controller) {
    const bytes = enc.encode(sourceText);
    controller.enqueue(bytes.slice(0, 31));
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.enqueue(bytes.slice(31));
    controller.close();
  },
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
console.log('ok 2) Responses SSE 原样透传并提取 usage');
