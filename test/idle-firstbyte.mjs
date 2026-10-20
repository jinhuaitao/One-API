/**
 * 流式回归：静默超时 / 首字节超时 / CRLF 跨分片 / 上游中途报错。
 * 运行：node test/idle-firstbyte.mjs（或 npm run test:stream）
 * 只依赖 Node 内置能力与 src/index.js 的导出函数，无第三方依赖。
 */
import assert from 'node:assert/strict';
import { rewriteOpenAISSE } from '../src/index.js';

const enc = new TextEncoder();

/** 按 [延迟ms, 文本|Error] 序列驱动一个上游流；Error 表示在该点报错断开 */
function upstreamFrom(events) {
  return new ReadableStream({
    async start(controller) {
      for (const [delay, item] of events) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (item instanceof Error) {
          controller.error(item);
          return;
        }
        if (item) controller.enqueue(enc.encode(item));
      }
      controller.close();
    },
  });
}

async function collect(stream, timeoutMs = 5000) {
  const text = await Promise.race([
    new Response(stream).text(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('collect timeout')), timeoutMs)),
  ]);
  return text;
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

// 1) 首字节前一直静默：应在首字节超时后被守卫收尾，而不是无限挂起
{
  const t = tracker();
  const silent = new ReadableStream({ start() {} }); // 永不发数据、永不关闭
  const out2 = rewriteOpenAISSE(silent, 'gw', t.cb, 50, 0, 90);
  const text = await collect(out2);
  const fin = await t.promise;
  assert.equal(fin.finish, 'timeout');
  assert.equal(fin.meta.first_byte, false);
  assert.ok(text.includes('gateway_stream_error'), '应补 error 事件收尾');
  assert.ok(text.includes('[DONE]'), '应补 [DONE]');
  console.log('ok 1) 首字节静默 → timeout 收尾，first_byte=false');
}

// 2) 出了首块后静默：回落到静默超时（idleMs），first_byte 应为 true
{
  const t = tracker();
  const src = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(block('A')));
    },
  });
  const out = rewriteOpenAISSE(src, 'gw', t.cb, 70, 0, 5000);
  const text = await collect(out);
  const fin = await t.promise;
  assert.equal(fin.finish, 'timeout');
  assert.equal(fin.meta.first_byte, true);
  assert.ok(text.includes('"content":"A"'));
  assert.ok(text.includes('gateway_stream_error'));
  console.log('ok 2) 首块后静默 → idle 超时收尾，first_byte=true');
}

// 3) 正常完成 + CRLF 行尾 + \r 与 \n 被分片切断：内容应完整、model 应改写
{
  const t = tracker();
  const a =
    'data: {"id":"1","model":"real","choices":[{"delta":{"content":"A"}}]}\r\n\r\n';
  const b =
    'data: {"id":"1","model":"real","choices":[{"delta":{"content":"B"}}]}\r\n\r\n' +
    'data: [DONE]\r\n\r\n';
  const src = new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(a.slice(0, a.length - 1))); // 末尾 \r 单独留在本片尾
      c.enqueue(enc.encode(a.slice(a.length - 1) + b));
      c.close();
    },
  });
  const out = rewriteOpenAISSE(src, 'gw', t.cb, 2000, 0, 2000);
  const text = await collect(out);
  const fin = await t.promise;
  assert.equal(fin.finish, 'complete');
  assert.ok(text.includes('"content":"A"') && text.includes('"content":"B"'));
  assert.ok(text.includes('"model":"gw"') && !text.includes('"model":"real"'));
  assert.ok(text.trimEnd().endsWith('[DONE]'));
  console.log('ok 3) CRLF 跨分片正常完成，model 已改写');
}

// 4) 上游中途报错：守卫补尾收尾，且 meta.error 应带上上游错误原文（第二批新增）
{
  const t = tracker();
  const src = upstreamFrom([
    [0, block('A')],
    [20, new Error('upstream boom: relay closed')],
  ]);
  const out = rewriteOpenAISSE(src, 'gw', t.cb, 2000, 0, 2000);
  const text = await collect(out);
  const fin = await t.promise;
  assert.equal(fin.finish, 'upstream_error');
  assert.ok(fin.meta.error && fin.meta.error.includes('upstream boom'), 'meta.error 应透传上游原文');
  assert.ok(text.includes('gateway_stream_error') && text.includes('[DONE]'));
  console.log('ok 4) 上游中途报错 → upstream_error 收尾，错误原文已透传');
}

console.log('idle-firstbyte: all passed');
