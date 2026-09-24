const prompt = require('./prompt.js');
const schema = require('./schema.js');
const sample = require('./sample.js');
const model = require('./model.js');

const MAX_ATTEMPTS = 2;

/**
 * 三条路的返回值形状一致，但含义完全不同，界面靠 source 区分：
 *   model   —— 真实模型结果（analysis 有内容）
 *   example —— 用户主动要看示例（analysis 是示例，界面必须写明「示例数据」）
 *   failed  —— 真实分析失败（analysis 为 null，界面给「重试 / 换一张」）
 *
 * ⚠️ **failed 时不许塞示例数据。** 以前这里是「失败 → 返回一份内置示例」，
 * 那等于假装成功：家属会以为模型看了自家那件衣服，而那份结果和照片毫无关系。
 * 「没读出来」还能重试；「看错了」只会让人不再信任整个产品。
 */

function failResult(reason, attempts, log) {
  if (log && typeof log.error === 'function') {
    log.error('[analyze] 真实分析失败，不返回示例：', reason);
  }
  return {
    ok: false,
    source: 'failed',
    reason: reason,
    analysis: null,
    attempts: attempts || 0
  };
}

function exampleResult(profile, reason, sampleFor) {
  const build = sampleFor || sample.sampleFor;
  return {
    ok: true,
    source: 'example',
    reason: reason || '示例模式',
    analysis: build(profile),
    attempts: 0
  };
}

async function runAnalysis(options) {
  const profile = options.profile || null;
  const imageBase64 = options.imageBase64 || '';
  const deps = options.deps || {};
  const callModel = deps.callModel;
  const sampleFor = deps.sampleFor || sample.sampleFor;
  const log = deps.log || console;

  // 示例模式是用户自己选的路，不是失败
  if (deps.forceFallback) {
    return exampleResult(profile, '已开启强制示例模式', sampleFor);
  }

  if (typeof callModel !== 'function') {
    return failResult('未注入模型调用函数，无法做真实分析', 0, log);
  }

  // 缺图必须在这里拦住，不能指望模型自觉拒答：
  // T00 侦察里，不发送图片时模型照样返回一份合格的虚构分析
  // （圆领套头上衣、62 分、带坐标），现有的结构校验也放行了它。
  if (!imageBase64) {
    return failResult('没有拿到衣服照片，不做真实分析（模型在无图时会编造结果）', 0, log);
  }

  const messages = prompt.buildMessages(profile, !!imageBase64);
  let lastError = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await callModel(messages, { attempt: attempt, imageBase64: imageBase64 });
      const parsed = model.parseModelOutput(raw);
      const checked = schema.validateAnalysis(parsed);

      if (checked.ok) {
        return {
          ok: true,
          source: 'model',
          reason: '',
          analysis: checked.value,
          attempts: attempt
        };
      }
      lastError = '结果不符合结构要求：' + checked.error;
    } catch (err) {
      lastError = (err && err.message) ? err.message : String(err);
    }
    if (log && typeof log.error === 'function') {
      log.error('[analyze] 第 ' + attempt + ' 次尝试失败：', lastError);
    }
  }

  return failResult(lastError, MAX_ATTEMPTS, log);
}

module.exports = {
  MAX_ATTEMPTS,
  runAnalysis
};
