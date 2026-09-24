const cloud = require('wx-server-sdk');
const analyze = require('./lib/analyze.js');
const model = require('./lib/model.js');
const schema = require('./lib/schema.js');
const sample = require('./lib/sample.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'analyses';
// 单次模型请求预算。依据 T00 实测：六次带图请求耗时 15.264–17.303 秒
// （见 docs/model-recon-20260918.md），原来的 15000 低于实际耗时，等于每次都卡着上限跑。
// 云函数整体 timeout 在 config.json（60 秒），要装得下「两次尝试 + 下载/解析/缓存余量」。
const MODEL_TIMEOUT_MS = 22000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildCacheId(fileID, profile) {
  const difficulties = ((profile && profile.difficulties) || []).slice().sort().join('-');
  const raw = String(fileID || 'example') + '|' + difficulties;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 2147483647;
  }
  return 'a' + hash;
}

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

    const result = await analyze.runAnalysis({
      profile: profile,
      imageBase64: imageBase64,
      deps: {
        callModel: callModel,
        sampleFor: sample.sampleFor,
        forceFallback: !cfg.baseUrl || !cfg.apiKey || !cfg.model
      }
    });

    const checked = schema.validateAnalysis(result.analysis);
    const analysis = checked.ok ? checked.value : sample.sampleFor(profile);

    if (result.source !== 'fallback') {
      await writeCache(cacheId, fileID, analysis, result.source);
    }

    return {
      ok: true,
      source: result.source,
      reason: result.reason || '',
      analysis: analysis,
      elapsed: Date.now() - started
    };
  } catch (err) {
    console.error('[analyze] 未捕获异常：', err && err.message);
    return {
      ok: true,
      source: 'fallback',
      reason: (err && err.message) || '未知异常',
      analysis: sample.sampleFor(profile),
      elapsed: Date.now() - started
    };
  }
};
