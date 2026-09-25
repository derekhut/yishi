const REQUIRED_DIM_KEYS = ['dress', 'closure', 'cuff', 'size'];
const MAX_FINDINGS = 6;
const MAX_QUESTIONS = 3;
const MAX_MARKERS = 4;
const MAX_TRY_ON = 3;
const MAX_IDEAL_FEATURES = 3;

function parseScore(value) {
  const n = Number(value);
  if (!isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return maxLen && trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

function normalizeFinding(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const type = raw.type === 'warn' ? 'warn' : (raw.type === 'good' ? 'good' : null);
  if (!type) return null;
  const title = cleanText(raw.title, 40);
  if (!title) return null;
  const detail = cleanText(raw.detail, 80);
  const label = cleanText(raw.label, 6) || (type === 'good' ? '省力' : '注意');
  return { type: type, label: label, title: title, detail: detail };
}

function normalizeMarker(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!isFinite(x) || !isFinite(y)) return null;
  const type = raw.type === 'warn' ? 'warn' : 'good';
  return {
    x: Math.max(0, Math.min(100, Math.round(x))),
    y: Math.max(0, Math.min(100, Math.round(y))),
    type: type,
    // 部位名（「门襟纽扣」「左袖口」）。模型没给就留空，前端改用数字编号。
    label: cleanText(raw.label, 6)
  };
}

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.title, 50);
  if (!title) return null;
  return { title: title, detail: cleanText(raw.detail, 80) };
}

function normalizeIdealFeature(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanText(raw.title, 30);
  if (!title) return null;
  const idx = Number(raw.index);
  return {
    index: isFinite(idx) && idx > 0 ? Math.round(idx) : index,
    title: title,
    detail: cleanText(raw.detail, 60)
  };
}

function validateAnalysis(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '结果不是 JSON 对象' };
  }

  const score = parseScore(raw.score);
  if (score === null) return { ok: false, error: 'score 缺失或非数字' };

  const dimsRaw = Array.isArray(raw.dims) ? raw.dims : [];
  const dims = [];
  REQUIRED_DIM_KEYS.forEach(function (key) {
    const found = dimsRaw.find(function (d) { return d && d.key === key; });
    if (!found) return;
    const value = parseScore(found.score);
    if (value === null) return;
    dims.push({
      key: key,
      label: cleanText(found.label, 8) || key,
      score: value
    });
  });
  if (dims.length !== REQUIRED_DIM_KEYS.length) {
    return { ok: false, error: 'dims 必须包含 4 个分项且分数合法' };
  }

  const findings = (Array.isArray(raw.findings) ? raw.findings : [])
    .map(normalizeFinding)
    .filter(Boolean)
    .slice(0, MAX_FINDINGS);
  if (findings.length === 0) return { ok: false, error: 'findings 至少 1 条' };

  const markers = (Array.isArray(raw.markers) ? raw.markers : [])
    .map(normalizeMarker)
    .filter(Boolean)
    .slice(0, MAX_MARKERS);

  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map(normalizeQuestion)
    .filter(Boolean);
  if (questions.length === 0) return { ok: false, error: 'questions 至少 1 条' };
  if (questions.length > MAX_QUESTIONS) {
    return { ok: false, error: 'questions 最多 ' + MAX_QUESTIONS + ' 条' };
  }

  const script = cleanText(raw.script, 400);
  if (!script) return { ok: false, error: 'script 缺失' };

  const tryOn = (Array.isArray(raw.tryOn) ? raw.tryOn : [])
    .map(function (t) { return cleanText(t, 40); })
    .filter(Boolean)
    .slice(0, MAX_TRY_ON);

  const idealFeatures = (Array.isArray(raw.idealFeatures) ? raw.idealFeatures : [])
    .map(function (f, i) { return normalizeIdealFeature(f, i + 1); })
    .filter(Boolean)
    .slice(0, MAX_IDEAL_FEATURES);

  const garmentRaw = (raw.garment && typeof raw.garment === 'object') ? raw.garment : {};
  const category = ['top', 'bottom', 'outer', 'dress'].indexOf(garmentRaw.category) >= 0
    ? garmentRaw.category
    : 'top';

  return {
    ok: true,
    error: null,
    value: {
      garment: {
        name: cleanText(garmentRaw.name, 30) || '这件衣服',
        category: category
      },
      score: score,
      level: cleanText(raw.level, 20) || '建议再确认',
      summary: cleanText(raw.summary, 120),
      dims: dims,
      findings: findings,
      markers: markers,
      questions: questions,
      script: script,
      tryOn: tryOn.length ? tryOn : ['能否按平时的方式穿上、脱下'],
      idealFeatures: idealFeatures,
      idealGap: cleanText(raw.idealGap, 60),
      idealScript: cleanText(raw.idealScript, 400)
    }
  };
}

module.exports = {
  REQUIRED_DIM_KEYS,
  MAX_QUESTIONS,
  parseScore,
  cleanText,
  validateAnalysis
};
