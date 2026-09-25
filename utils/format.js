function toNumber(value) {
  const n = Number(value);
  return isFinite(n) ? n : null;
}

function dimTone(score) {
  const n = toNumber(score);
  if (n === null) return 'muted';
  if (n < 60) return 'warn';
  if (n >= 75) return 'ink';
  return 'muted';
}

function dimWidth(score) {
  const n = toNumber(score);
  if (n === null) return '0%';
  return Math.max(0, Math.min(100, Math.round(n))) + '%';
}

function markerStyle(marker) {
  const m = marker || {};
  const x = toNumber(m.x);
  const y = toNumber(m.y);
  return {
    left: Math.max(0, Math.min(100, x === null ? 0 : Math.round(x))) + '%',
    top: Math.max(0, Math.min(100, y === null ? 0 : Math.round(y))) + '%',
    cls: m.type === 'warn' ? 'warn' : 'ok'
  };
}

function scoreTone(score) {
  const n = toNumber(score);
  if (n === null) return 'warn';
  if (n >= 80) return 'good';
  if (n >= 60) return 'warn';
  return 'risk';
}

function stepDots(current, total) {
  const dots = [];
  for (let i = 0; i < total; i++) dots.push(i <= current);
  return dots;
}

function dimsView(dims) {
  const list = Array.isArray(dims) ? dims : [];
  return list.map(function (item) {
    return {
      key: item.key,
      label: item.label,
      score: item.score,
      width: dimWidth(item.score),
      tone: dimTone(item.score)
    };
  });
}

function markerLabel(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * 图上标注。两条规矩：
 *   · 坐标不是数字的，这个点直接不打 —— 宁可少标，也不标一个不知道在哪的点
 *   · 有部位名就写部位名（「门襟扣子」比一个「2」好认），没给名字才退回编号
 */
function markersView(markers) {
  const list = Array.isArray(markers) ? markers : [];
  let warnIndex = 0;
  const out = [];
  list.forEach(function (item) {
    if (!item || typeof item !== 'object') return;
    const x = toNumber(item.x);
    const y = toNumber(item.y);
    if (x === null || y === null) return;
    const type = item.type === 'warn' ? 'warn' : 'good';
    const style = markerStyle({ x: x, y: y, type: type });
    let label = markerLabel(item.label);
    if (!label && type === 'warn') {
      warnIndex++;
      label = String(warnIndex);
    }
    out.push({
      left: style.left,
      top: style.top,
      cls: type === 'warn' ? 'warn' : 'ok',
      label: label
    });
  });
  return out;
}

/**
 * 图下的那句说明。有没有照片、有没有定位，是两种不同的「没有」，
 * 不能共用一句「橙色数字对应下面」—— 那会让人以为图上真的标了什么。
 */
function markerCaption(markers, hasPhoto) {
  const list = Array.isArray(markers) ? markers : [];
  if (!hasPhoto) return '照片没能显示出来，下面的说明按看到的结构写的';
  if (list.length === 0) return '这张照片里没能指出具体位置，下面按看到的部位说明';
  const named = list.every(function (m) {
    return m && m.label && !/^\d+$/.test(String(m.label));
  });
  return named ? '图上标出的是下面提到的部位' : '橙色数字对应下面需要留意的地方';
}

function findingsView(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let warnIndex = 0;
  return list.map(function (item) {
    const isWarn = item.type === 'warn';
    let index = '';
    if (isWarn) {
      warnIndex++;
      index = String(warnIndex);
    }
    return {
      type: isWarn ? 'warn' : 'good',
      label: item.label,
      title: item.title,
      detail: item.detail,
      index: index
    };
  });
}

function indexLabel(index) {
  const n = toNumber(index);
  const value = n === null ? 0 : Math.max(0, Math.round(n)) + 1;
  return value < 10 ? '0' + value : String(value);
}

module.exports = {
  toNumber,
  dimTone,
  dimWidth,
  markerStyle,
  scoreTone,
  stepDots,
  dimsView,
  markerLabel,
  markersView,
  markerCaption,
  findingsView,
  indexLabel
};
