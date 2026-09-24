/**
 * 三种「没有」必须是三句不同的话。
 *
 * 参考 consumer-hook-lens：模型返回空数组、全部被置信度筛掉、以及这次根本没成功，
 * 在界面上长得都一样（什么都没标出来），但含义完全不同。
 * 混成一句「没看出问题」就是把「这次失败了」说成了「这件衣服没问题」——
 * 在老人穿衣这件事上，这句话是要付代价的。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const state = require(path.join(ROOT, 'utils/analyze-state.js'));

const analysisWithWarn = {
  score: 62,
  level: '建议再确认',
  summary: '纽扣偏小',
  dims: [{ key: 'closure', label: '开合操作', score: 48 }],
  findings: [{ type: 'warn', label: '注意', title: '纽扣小', detail: '扣起来费劲' }],
  markers: [],
  questions: []
};

const analysisNoWarn = {
  score: 88,
  level: '可以买',
  summary: '看着还行',
  dims: [{ key: 'closure', label: '开合操作', score: 90 }],
  findings: [{ type: 'good', label: '省力', title: '前开襟', detail: '不用套头' }],
  markers: [],
  questions: []
};

console.log('\n[1] 这次没读出来');

{
  const out = state.describeOutcome({ ok: false, source: 'failed', analysis: null, reason: '请求超时' });
  ok(out.kind === 'failed', 'kind=failed（实际 ' + out.kind + '）');
  ok(out.title.indexOf('没分析出来') !== -1, '标题说「没分析出来」（实际 ' + out.title + '）');
  ok(out.detail.length > 0, '有说明文字');
  ok(out.reason.indexOf('超时') !== -1, '保留原始原因便于排查');
  const keys = out.actions.map(function (a) { return a.key; });
  ok(keys.indexOf('retry') !== -1, '给「再试一次」出口');
  ok(keys.indexOf('reselect') !== -1, '给「换一张照片」出口');
}

console.log('\n[2] 没看出难穿点');

{
  const out = state.describeOutcome({ ok: true, source: 'model', analysis: analysisNoWarn });
  ok(out.kind === 'no-problem', 'kind=no-problem（实际 ' + out.kind + '）');
  ok(out.title.indexOf('没看出') !== -1, '标题说「没看出」（实际 ' + out.title + '）');
  ok(
    out.title.indexOf('这张照片') !== -1,
    '限定在「这张照片里」，不说成这件衣服没问题'
  );
  ok(
    out.detail.indexOf('手感') !== -1 || out.detail.indexOf('尺码') !== -1,
    '说明照片看不出来的部分（实际 ' + out.detail + '）'
  );
}

console.log('\n[3] 看出来了但把握不够');

{
  const out = state.describeOutcome({ ok: true, source: 'model', analysis: analysisWithWarn, uncertain: true });
  ok(out.kind === 'uncertain', 'kind=uncertain（实际 ' + out.kind + '）');
  ok(out.title.indexOf('确定') !== -1, '标题说「不确定」（实际 ' + out.title + '）');
  ok(
    out.title.indexOf('没看出') === -1,
    '不说成「没看出问题」'
  );
}

console.log('\n[4] 三句话互不相同');

{
  const a = state.describeOutcome({ ok: false, source: 'failed', analysis: null });
  const b = state.describeOutcome({ ok: true, source: 'model', analysis: analysisNoWarn });
  const c = state.describeOutcome({ ok: true, source: 'model', analysis: analysisWithWarn, uncertain: true });
  const titles = [a.title, b.title, c.title];
  ok(new Set(titles).size === 3, '三种「没有」是三句不同的话');
  ok(titles.every(function (t) { return t.length > 0; }), '三句都不是空的');
  const kinds = [a.kind, b.kind, c.kind];
  ok(new Set(kinds).size === 3, '三种 kind 互不相同');
}

console.log('\n[5] 有结果时不插话');

{
  const out = state.describeOutcome({ ok: true, source: 'model', analysis: analysisWithWarn });
  ok(out.kind === 'result', '有需要注意的项时正常渲染（实际 ' + out.kind + '）');
  ok(out.title === '', '不额外插一句「没有」的话');
}

console.log('\n[6] 失败不会被误判成「没看出」');

{
  // 最容易出错的一条：失败时 analysis 是 null，findings 也是「空」——
  // 绝不能因为「没有 warn」就走成 no-problem
  const out = state.describeOutcome({ ok: false, source: 'failed', analysis: null });
  ok(out.kind !== 'no-problem', '失败不算「没看出问题」（实际 ' + out.kind + '）');
  ok(out.kind !== 'uncertain', '失败也不算「不确定」（实际 ' + out.kind + '）');
}

console.log('\n[7] 来源标记');

{
  ok(state.SOURCE_LABEL.model === '真实分析', 'model 标真实分析');
  ok(state.SOURCE_LABEL.cache === '真实分析', 'cache 也算真实分析');
  ok(state.SOURCE_LABEL.example === '示例数据', 'example 标示例数据');
  ok(state.isSampleSource('example') === true, 'example 是示例来源');
  ok(state.isSampleSource('model') === false, 'model 不是示例来源');
  ok(state.isSampleSource('failed') === false, 'failed 不是示例来源（它是失败，不是示例）');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
