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

function markersView(markers) {
  const list = Array.isArray(markers) ? markers : [];
  let warnIndex = 0;
  return list.map(function (item) {
    const style = markerStyle(item);
    let label = '';
    if (style.cls === 'warn') {
      warnIndex++;
      label = String(warnIndex);
    }
    return {
      left: style.left,
      top: style.top,
      cls: style.cls,
      label: label
    };
  });
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
  markersView,
  findingsView,
  indexLabel
};
