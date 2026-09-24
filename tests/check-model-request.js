/**
 * 模型请求体的构造。
 *
 * 背景（2026-09-24 实测，见 docs/model-recon-20260924.md）：
 * qwen3.8-max 默认开思考，非流式请求要等思考全部生成完才返回 ——
 * 完整提示词下 60 秒 0 字节；显式传 `reasoning_effort: "none"` 后 14 秒返回。
 * 生产封装一直没传这个参数，所以**真实链路从未成功过**（T00 那批 15–17 秒
 * 的成绩是诊断脚本带 none 跑出来的，掩盖了这个 bug）。
 *
 * 本项目要的是结构化 JSON 和响应速度，不需要思考；但这个参数不是所有
 * 兼容接口都认，所以做成可配置：默认关思考，换模型时可在配置里覆盖。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const LIB = path.join(ROOT, 'cloudfunctions/analyze/lib');
const model = require(path.join(LIB, 'model.js'));

console.log('\n[1] 请求体构造');

{
  const body = model.buildRequestBody({
    model: 'qwen3.8-max',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2,
    max_tokens: 1600,
    reasoningEffort: 'none'
  });
  ok(body.reasoning_effort === 'none', '传了 reasoningEffort 就输出 reasoning_effort 字段');
  ok(body.model === 'qwen3.8-max' && body.max_tokens === 1600, '其余字段原样保留');
}

{
  const body = model.buildRequestBody({
    model: 'm', messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2, max_tokens: 100
  });
  ok(
    !Object.prototype.hasOwnProperty.call(body, 'reasoning_effort'),
    '不传 reasoningEffort 就不带这个字段（不给不支持它的接口添乱）'
  );
}

{
  const body = model.buildRequestBody({
    model: 'm',
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0.2,
    max_tokens: 100,
    imageBase64: 'QUJD'
  });
  const text = JSON.stringify(body);
  ok(text.indexOf('image_url') !== -1, '带图时 messages 里有 image_url');
}

console.log('\n[2] 封装把配置透传给请求');

{
  let captured = null;
  const fakePost = function (url, headers, body) {
    captured = body;
    return Promise.resolve({ statusCode: 200, body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) });
  };
  const call = model.createCallModel({
    baseUrl: 'https://example.com/v1',
    apiKey: 'k',
    model: 'qwen3.8-max',
    timeoutMs: 5000,
    reasoningEffort: 'none',
    httpPost: fakePost
  });
  call([{ role: 'user', content: 'hi' }], {}).then(function () {
    ok(!!captured, 'httpPost 被调用');
    ok(
      captured && captured.reasoning_effort === 'none',
      '配置里的 reasoningEffort 进了请求体'
    );
    console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
    process.exit(failed > 0 ? 1 : 0);
  }).catch(function (err) {
    ok(false, '调用不应抛错（' + err.message + '）');
    console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
    process.exit(1);
  });
}
