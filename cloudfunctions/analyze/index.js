const cloud = require('wx-server-sdk');
const analyze = require('./lib/analyze.js');
const model = require('./lib/model.js');
const cacheKey = require('./lib/cache-key.js');
// 结构校验只有一份实现，在 lib/analyze.js 里（云函数不重复校验，
// 两份规则必漂）。入口层只负责「临时链接 → 分析 → 返回」。
const sample = require('./lib/sample.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'analyses';
// 单次模型请求预算。依据 T00 实测：六次带图请求耗时 15.264–17.303 秒
// （见 docs/model-recon-20260918.md），原来的 15000 低于实际耗时，等于每次都卡着上限跑。
// 云函数整体 timeout 在 config.json（60 秒），要装得下「两次尝试 + 下载/解析/缓存余量」。
const MODEL_TIMEOUT_MS = 22000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// 缓存键包含称呼在内的影响输出的资料，见 lib/cache-key.js
const buildCacheId = cacheKey.buildCacheId;

async function readCache(cacheId) {
  try {
    const res = await db.collection(COLLECTION).doc(cacheId).get();
    const doc = res && res.data;
    if (doc && doc.updatedAt && (Date.now() - doc.updatedAt) < CACHE_TTL_MS && doc.analysis) {
      return doc.analysis;
    }
    return null;
  } catch (err) {
    return null;
  }
}

async function writeCache(cacheId, fileID, analysis, source) {
  try {
    await db.collection(COLLECTION).doc(cacheId).set({
      data: {
        fileID: fileID || '',
        analysis: analysis,
        source: source,
        updatedAt: Date.now()
      }
    });
  } catch (err) {
    console.warn('[analyze] 缓存写入失败（不影响返回）：', err && err.message);
  }
}

async function loadImageBase64(fileID) {
  if (!fileID) return '';
  try {
    const res = await cloud.downloadFile({ fileID: fileID });
    const buffer = res && res.fileContent;
    if (!buffer) return '';
    return Buffer.from(buffer).toString('base64');
  } catch (err) {
    console.warn('[analyze] 图片下载失败，改为纯文字判断：', err && err.message);
    return '';
  }
}

function readModelConfig() {
  return {
    baseUrl: process.env.MODEL_BASE_URL || '',
    apiKey: process.env.MODEL_API_KEY || '',
    model: process.env.MODEL_NAME || '',
    timeoutMs: MODEL_TIMEOUT_MS
  };
}

exports.main = async (event) => {
  const started = Date.now();
  const fileID = (event && event.fileID) || '';
  const profile = (event && event.profile) || null;
  const skipCache = !!(event && event.skipCache);
  const cacheId = buildCacheId(fileID, profile);

  try {
    if (!skipCache) {
      const cached = await readCache(cacheId);
      if (cached) {
        return { ok: true, source: 'cache', analysis: cached, elapsed: Date.now() - started };
      }
    }

    const imageBase64 = await loadImageBase64(fileID);
    const cfg = readModelConfig();
    const callModel = model.createCallModel(cfg);

    // 三项模型配置不全时，真实分析无从谈起 —— 走示例模式（用户主动看示例的那条路），
    // 界面会写明「示例数据」。它不是兜底：兜底是「这次没读出来」，示例是「给你看个样子」。
    const result = await analyze.runAnalysis({
      profile: profile,
      imageBase64: imageBase64,
      deps: {
        callModel: callModel,
        sampleFor: sample.sampleFor,
        forceFallback: !cfg.baseUrl || !cfg.apiKey || !cfg.model
      }
    });

    if (result.ok && result.source === 'model') {
      await writeCache(cacheId, fileID, result.analysis, result.source);
    }

    return {
      ok: result.ok,
      source: result.source,
      reason: result.reason || '',
      analysis: result.analysis,
      attempts: result.attempts || 0,
      elapsed: Date.now() - started
    };
  } catch (err) {
    // 第 4 层：连这条路都炸了，仍然返回结构合法的结果 —— 但 ok:false，
    // 不把示例数据塞进来充当分析结果（界面靠 ok/source 区分，见 lib/analyze.js）
    console.error('[analyze] 未捕获异常：', err && err.message);
    return {
      ok: false,
      source: 'failed',
      reason: (err && err.message) || '未知异常',
      analysis: null,
      attempts: 0,
      elapsed: Date.now() - started
    };
  }
};
