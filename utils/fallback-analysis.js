// 示例数据的**唯一来源**（前端兜底用）。
// 云函数不可用（未部署 / 网络异常 / 返回异常）时，页面用这份数据继续渲染。
//
// 云函数那份在 cloudfunctions/analyze/lib/sample.js，由 `node tools/build-sample.js`
// 从本文件生成 —— 云函数目录不参与小程序打包、也 require 不到上级目录，
// 所以物理上必须有两份文件，但**口径只有这一份**。
// 改了这里请跑一次生成脚本；忘了跑，`tests/check-sample-sync.js` 会变红。

function has(difficulties, key) {
  return (difficulties || []).indexOf(key) >= 0;
}

function normalizeProfile(profile) {
  const who = (profile && profile.who) || '家人';
  const difficulties = ((profile && profile.difficulties) || []).filter(function (key) {
    return ['buttons', 'liftArm', 'bend'].indexOf(key) >= 0;
  });
  return { who: who, difficulties: difficulties };
}

function buildDims(difficulties) {
  return [
    { key: 'dress', label: '穿脱省力', score: has(difficulties, 'liftArm') ? 92 : 74 },
    { key: 'closure', label: '开合操作', score: has(difficulties, 'buttons') ? 48 : 76 },
    { key: 'cuff', label: '袖口宽松', score: 85 },
    { key: 'size', label: '尺码友好', score: has(difficulties, 'bend') ? 58 : 65 }
  ];
}

function buildFindings(difficulties) {
  const findings = [];
  if (has(difficulties, 'liftArm')) {
    findings.push({
      type: 'good', label: '省力', title: '前开襟 · 不用套头',
      detail: '穿衣不需要把手举过头顶，对肩膀活动不便的人友好。'
    });
  }
  if (has(difficulties, 'buttons')) {
    findings.push({
      type: 'warn', label: '注意', title: '一排纽扣 · 5 颗以上',
      detail: '扣扣子费劲的话，建议先问商家是不是真扣子、能不能换拉链款。'
    });
  }
  if (has(difficulties, 'bend')) {
    findings.push({
      type: 'warn', label: '注意', title: '下摆长度需要确认',
      detail: '较长的下摆坐下时容易起皱，弯腰整理会费些力气。'
    });
  }
  if (findings.length === 0) {
    findings.push({
      type: 'good', label: '省力', title: '整体结构常规',
      detail: '没有发现明显的穿衣障碍，按平时的尺码选择即可。'
    });
  }
  findings.push({
    type: 'good', label: '省力', title: '袖口不紧绷',
    detail: '手腕活动受限也能轻松穿过袖子。'
  });
  return findings;
}

// 坐标口径必须与 cloudfunctions/analyze/lib/sample.js 完全一致：
// 相对 assets/garment-current.png（viewBox="52 34 196 196"）的百分比位置。
function buildMarkers(difficulties) {
  const markers = [];
  if (has(difficulties, 'liftArm')) markers.push({ x: 41, y: 16, type: 'good' });
  markers.push({ x: 50, y: 62, type: has(difficulties, 'buttons') ? 'warn' : 'good' });
  markers.push({ x: 18, y: 61, type: 'good' });
  return markers;
}

function buildQuestions(difficulties) {
  const questions = [];
  if (has(difficulties, 'buttons')) {
    questions.push({ title: '前面的纽扣需要逐颗扣吗？', detail: '请确认是真纽扣，还是装饰扣、隐藏扣。' });
  }
  questions.push({ title: '袖口能撑开多大？', detail: '请提供袖口尺寸，以及拉伸或穿脱视频。' });
  questions.push({ title: '能提供尺码表和面料标签吗？', detail: '图片看起来宽松，不代表实际尺寸合适。' });
  return questions.slice(0, 3);
}

function buildIdealFeatures(difficulties) {
  const features = [];
  if (has(difficulties, 'buttons')) {
    features.push({ index: 1, title: '大拉环暗拉链', detail: '不用扣扣子，一拉到底' });
  }
  if (has(difficulties, 'liftArm')) {
    features.push({ index: features.length + 1, title: '宽松领口', detail: '头部轻松穿过' });
  }
  features.push({ index: features.length + 1, title: '喇叭袖口', detail: '手腕不受限' });
  if (features.length < 2) {
    features.push({ index: features.length + 1, title: '松紧腰头', detail: '不需要精细操作' });
  }
  return features;
}

function build(profile) {
  const normalized = normalizeProfile(profile);
  const who = normalized.who;
  const difficulties = normalized.difficulties;
  const dims = buildDims(difficulties);
  const score = Math.round(dims.reduce(function (sum, d) { return sum + d.score; }, 0) / dims.length);

  return {
    garment: { name: '针织开衫', category: 'top' },
    score: score,
    level: score >= 80 ? '可以买' : (score >= 60 ? '可以买，先确认几件事' : '换一种结构更合适'),
    summary: '前开襟不用抬胳膊套头，这点对' + who + '很友好；但纽扣和尺寸还需要向商家确认。',
    dims: dims,
    findings: buildFindings(difficulties),
    markers: buildMarkers(difficulties),
    questions: buildQuestions(difficulties),
    script: '您好，这件开衫我想给' + who + '买。请问：① 前襟的扣子是真扣子还是装饰扣，里面有拉链吗？'
      + '② 袖口和下摆宽松吗？③ 有详细尺码表吗？麻烦发我一份，谢谢～',
    tryOn: ['能否按平时的方式穿上、脱下', '扣件是否容易操作', '活动舒服，自己看着也喜欢'],
    idealFeatures: buildIdealFeatures(difficulties),
    idealGap: '主要差在开合方式上，其他方面这件已经不错。',
    idealScript: '您好，我想找类似这种开衫：前开襟 + 大拉环暗拉链、领口宽松、袖口不紧。'
      + '您家有没有这种款？给' + who + '穿。'
  };
}

module.exports = { build, normalizeProfile };
