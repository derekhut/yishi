const prompt = require('./prompt.js');
const schema = require('./schema.js');
const sample = require('./sample.js');
const model = require('./model.js');

const MAX_ATTEMPTS = 2;

function fallbackResult(profile, reason, sampleFor) {
  const build = sampleFor || sample.sampleFor;
  return {
    ok: true,
    source: 'fallback',
    reason: reason || '模型不可用，已使用内置示例',
    analysis: build(profile)
  };
}

async function runAnalysis(options) {
  const profile = options.profile || null;
  const imageBase64 = options.imageBase64 || '';
  const deps = options.deps || {};
  const callModel = deps.callModel;
  const sampleFor = deps.sampleFor || sample.sampleFor;

  if (deps.forceFallback) {
    return fallbackResult(profile, '已开启强制示例模式', sampleFor);
  }

  if (typeof callModel !== 'function') {
    return fallbackResult(profile, '未注入模型调用函数', sampleFor);
  }

  const messages = prompt.buildMessages(profile, !!imageBase64);
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callModel(messages, { attempt: attempt, imageBase64: imageBase64 });
      const parsed = model.parseModelOutput(raw);
      const checked = schema.validateAnalysis(parsed);

      if (checked.ok) {
        return { ok: true, source: 'model', reason: '', analysis: checked.value, attempts: attempt };
      }
      lastError = '结果不符合结构要求：' + checked.error;
    } catch (err) {
      lastError = (err && err.message) ? err.message : String(err);
    }
  }

  return fallbackResult(profile, lastError, sampleFor);
}

module.exports = {
  MAX_ATTEMPTS,
  runAnalysis
};
