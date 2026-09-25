const KEY = 'yishi_profile';
const ANALYSIS_KEY = 'yishi_last_analysis';
const SETTINGS_KEY = 'yishi_settings';
const DIFFICULTIES = ['buttons', 'liftArm', 'bend'];
const DEFAULT_WHO = '妈妈';

/**
 * 示例专用资料。它**不写进 storage** —— 看示例不该改动用户自己的资料。
 * 首屏那条「先看个示例」走的就是它，所以点一下就能看到结果，不用先填表单。
 */
const SAMPLE_PROFILE = { who: '妈妈', difficulties: ['buttons'] };

function defaultProfile() {
  return { who: DEFAULT_WHO, difficulties: [] };
}

function isValidProfile(p) {
  return !!(
    p &&
    typeof p === 'object' &&
    Array.isArray(p.difficulties) &&
    p.difficulties.length > 0 &&
    p.difficulties.every(d => DIFFICULTIES.indexOf(d) >= 0)
  );
}

function normalizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const list = Array.isArray(raw.difficulties) ? raw.difficulties : [];
  const difficulties = list.filter((d, i) => DIFFICULTIES.indexOf(d) >= 0 && list.indexOf(d) === i);
  const who = typeof raw.who === 'string' && raw.who.trim() ? raw.who.trim() : DEFAULT_WHO;
  return { who, difficulties };
}

function loadProfile(wxApi) {
  try {
    return normalizeProfile(wxApi.getStorageSync(KEY));
  } catch (err) {
    return null;
  }
}

function saveProfile(wxApi, profile) {
  const normalized = normalizeProfile(profile);
  if (!isValidProfile(normalized)) return null;
  const record = {
    who: normalized.who,
    difficulties: normalized.difficulties,
    updatedAt: Date.now()
  };
  wxApi.setStorageSync(KEY, record);
  return record;
}

// —— 分析记录（T01）——
//
// 以前只把 analysis 本身塞进 storage，于是两件事会出错：
//   1. 结果页知道来源是「真实/示例」，翻到确认页、对比页就丢了；
//   2. 换了照片或换了一个人，下游页面仍拿上一份结果渲染（混合结果）。
// 所以记录自带「谁、什么时候、哪张照片、什么方式得出的、第几版」，
// 下游页面用 isCompatibleRecord 一眼判断还能不能用。

/** 改记录结构就 +1。老记录没有这个字段，会被判为不相容并引导重新分析 */
const RECORD_VERSION = 1;

function buildRecord(input) {
  const data = input || {};
  const profile = normalizeProfile(data.profile) || { who: DEFAULT_WHO, difficulties: [] };
  return {
    analysisVersion: RECORD_VERSION,
    fileID: String(data.fileID || ''),
    profile: { who: profile.who, difficulties: profile.difficulties.slice() },
    source: String(data.source || 'model'),
    createdAt: Date.now(),
    analysis: data.analysis || null
  };
}

function sameDifficulties(a, b) {
  const x = ((a && a.difficulties) || []).slice().sort().join('-');
  const y = ((b && b.difficulties) || []).slice().sort().join('-');
  return x === y;
}

/**
 * 这份记录还能不能给「现在的照片 + 现在的资料」用。
 * 换照片、换人、换动作难点、版本对不上 —— 都不能用，得重新分析。
 */
function isCompatibleRecord(record, expected) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  if (record.analysisVersion !== RECORD_VERSION) return false;
  if (!record.analysis || !Array.isArray(record.analysis.dims)) return false;
  const want = expected || {};
  if (String(record.fileID || '') !== String(want.fileID || '')) return false;
  if (!record.profile || !want.profile) return false;
  if (record.profile.who !== want.profile.who) return false;
  if (!sameDifficulties(record.profile, want.profile)) return false;
  return true;
}

function saveRecord(wxApi, input) {
  const record = (input && input.analysisVersion !== undefined) ? input : buildRecord(input);
  try {
    // 失败时 analysis 为 null：不写记录，免得下游页面拿到一份空结果还以为有
    if (!record || !record.analysis || !Array.isArray(record.analysis.dims)) return false;
    if (record.analysisVersion !== RECORD_VERSION) return false;
    wxApi.setStorageSync(ANALYSIS_KEY, record);
    return true;
  } catch (err) {
    return false;
  }
}

function loadRecord(wxApi) {
  try {
    const value = wxApi.getStorageSync(ANALYSIS_KEY);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (value.analysisVersion !== RECORD_VERSION) return null;
    if (!value.analysis || !Array.isArray(value.analysis.dims)) return null;
    return value;
  } catch (err) {
    return null;
  }
}

/** 兼容老调用：只要 analysis 的部分（新代码请用 loadRecord） */
function loadAnalysis(wxApi) {
  const record = loadRecord(wxApi);
  return record ? record.analysis : null;
}

// —— 全局设置（护眼模式等）——
function defaultSettings() {
  return { eyeCare: false };
}

function loadSettings(wxApi) {
  try {
    const raw = wxApi.getStorageSync(SETTINGS_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultSettings();
    return { eyeCare: raw.eyeCare === true };
  } catch (err) {
    return defaultSettings();
  }
}

function saveSettings(wxApi, settings) {
  const current = loadSettings(wxApi);
  const record = Object.assign({}, current, settings || {}, { updatedAt: Date.now() });
  try {
    wxApi.setStorageSync(SETTINGS_KEY, record);
    return record;
  } catch (err) {
    return null;
  }
}

module.exports = {
  KEY,
  ANALYSIS_KEY,
  SETTINGS_KEY,
  DIFFICULTIES,
  DEFAULT_WHO,
  SAMPLE_PROFILE,
  defaultProfile,
  isValidProfile,
  normalizeProfile,
  loadProfile,
  saveProfile,
  RECORD_VERSION,
  buildRecord,
  isCompatibleRecord,
  saveRecord,
  loadRecord,
  loadAnalysis,
  defaultSettings,
  loadSettings,
  saveSettings
};
