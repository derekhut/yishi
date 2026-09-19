const KEY = 'yishi_profile';
const ANALYSIS_KEY = 'yishi_last_analysis';
const SETTINGS_KEY = 'yishi_settings';
const DIFFICULTIES = ['buttons', 'liftArm', 'bend'];
const DEFAULT_WHO = '妈妈';

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

function saveAnalysis(wxApi, analysis) {
  try {
    if (!analysis || typeof analysis !== 'object' || !Array.isArray(analysis.dims)) return false;
    wxApi.setStorageSync(ANALYSIS_KEY, analysis);
    return true;
  } catch (err) {
    return false;
  }
}

function loadAnalysis(wxApi) {
  try {
    const value = wxApi.getStorageSync(ANALYSIS_KEY);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (typeof value.score !== 'number' || !Array.isArray(value.dims)) return null;
    return value;
  } catch (err) {
    return null;
  }
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
  defaultProfile,
  isValidProfile,
  normalizeProfile,
  loadProfile,
  saveProfile,
  saveAnalysis,
  loadAnalysis,
  defaultSettings,
  loadSettings,
  saveSettings
};
