/**
 * 流式回归：下游保活 / 下游取消回收上游 / model 改写等价性 / Anthropic 翻译。
 * 运行：node test/keepalive.mjs（或 npm run test:stream）
 */
import assert from 'node:assert/strict';
import { rewriteOpenAISSE, anthropicStreamToOpenAI, rewriteSseBlock } from '../src/index.js';

const enc = new TextEncoder();

async function collect(stream, timeoutMs = 5000) {
  return Promise.race([
    new Response(stream).text(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('collect timeout')), timeoutMs)),
  ]);
}

function tracker() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, cb: (usage, finish, meta) => resolve({ usage, finish, meta }) };
}

const block = (content, model = 'real') =>
  `data: {"id":"1","model":"${model}","choices":[{"delta":{"content":"${content}"}}]}\n\n`;

// 1) 下游保活：上游中途停顿 160ms、保活间隔 40ms，下游应收到 `: ka` 注释
{
  const t = tracker();
  const src = new ReadableStream({
    async start(c) {
      c.enqueue(enc.encode(block('A')));
      await new Promise((r) => setTimeout(r, 160));
      c.enqueue(enc.encode(block('B')));
      c.close();
    },
  });
  const out = rewriteOpenAISSE(src, 'gw', t.cb, 3000, 40, 3000);
  const text = await collect(out);
  const fin = await t.promise;
  assert.equal(fin.finish, 'complete');
  assert.ok(text.includes(': ka'), '停顿期间应向下游补 `: ka` 保活注释');
  assert.ok(text.includes('"content":"A"') && text.includes('"content":"B"'));
  console.log('ok 1) 停顿期间保活注释已下发');
}

// 2) 下游取消：应回收上游（上游 cancel 被调用），finish=client_abort
{
  const t = tracker();
  let upstreamCancelled = false;
  const src = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(block('A')));
    },
    cancel() {
      upstreamCancelled = true;
    },
  });
  const out = rewriteOpenAISSE(src, 'gw', t.cb, 0, 0, 0);
  const reader = out.getReader();
  const first = await reader.read();
  assert.equal(first.done, false);
  await reader.cancel('test-client-gone');
  await new Promise((r) => setTimeout(r, 50));
  const fin = await t.promise;
  assert.equal(fin.finish, 'client_abort');
  assert.equal(upstreamCancelled, true, '下游取消后上游应被 cancel 回收');
  console.log('ok 2) 下游取消已回收上游，finish=client_abort');
}

// 3) rewriteSseBlock 改写等价性（轻量路径与完整路径对外语义一致）
{
  const noop = () => {};
  const same = 'data: {"id":"1","model":"gw","choices":[{"delta":{"content":"hi"}}]}';
  assert.equal(rewriteSseBlock(same, 'gw', noop), same, '同名应整块原样');
  const diff = 'data: {"id":"1","model":"real","choices":[{"delta":{"content":"hi"}}]}';
  assert.ok(rewriteSseBlock(diff, 'gw', noop).includes('"model":"gw"'), '异名应改写');
  const inContent =
    'data: {"id":"1","model":"gw","choices":[{"delta":{"content":"a \\"model\\": \\"x\\" b"}}]}';
  assert.equal(rewriteSseBlock(inContent, 'gw', noop), inContent, '正文里的转义 "model" 不应误伤');
  assert.equal(rewriteSseBlock('data: [DONE]', 'gw', noop), 'data: [DONE]');
  const evt = 'event: message\ndata: {"model":"real"}';
  assert.equal(rewriteSseBlock(evt, 'gw', noop), evt, '非纯 data 块应原样');
  let usage = null;
  const usageBlk =
    'data: {"id":"1","model":"real","choices":[],"usage":{"prompt_tokens":3,"completion_tokens":4,"total_tokens":7}}';
  const rewritten = rewriteSseBlock(usageBlk, 'gw', (u) => {
    usage = u;
  });
  assert.ok(rewritten.includes('"model":"gw"'));
  assert.equal(usage && usage.total_tokens, 7, 'usage 块仍应走完整路径并捕获 usage');
  console.log('ok 3) model 改写等价性通过（同名/异名/正文转义/[DONE]/event 块/usage）');
}

// 4) Anthropic 翻译：文本、ping 转发、usage 提取、正常收尾
{
  const t = tracker();
  const sse =
    'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":5,"output_tokens":1}}}\n\n' +
    'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}\n\n' +
    'event: ping\ndata: {"type":"ping"}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":7}}\n\n' +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const src = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(sse));
      c.close();
    },
  });
  const out = anthropicStreamToOpenAI(src, 'gw', t.cb, 2000, 0, 2000);
  const text = await collect(out);
  const fin = await t.promise;
  assert.equal(fin.finish, 'complete');
  assert.ok(text.includes('你好'), '文本增量应翻译转发');
  assert.ok(text.includes(': ping'), 'ping 应转发为注释保活');
  assert.ok(text.includes('[DONE]'));
  assert.deepEqual(fin.usage, { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 });
  console.log('ok 4) Anthropic 翻译 + ping 转发 + usage 提取通过');
}

console.log('keepalive: all passed');
