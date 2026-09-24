/**
 * 云函数 analyze 的四层防御。
 *
 * 这个套件只看一件事：**失败的时候，它有没有假装成功**。
 *
 * 以前的写法是「两次都失败 → 返回一份内置示例数据，ok:true」。
 * 那是网页版留下的习惯，在老人穿衣这个场景里比直接失败更糟：
 * 家属看到的是一份看起来完整的分析结果，以为是模型看了自家那件衣服得出的，
 * 而它其实和那张照片一点关系都没有 ——「没读出来」还能重试，
 * 「看错了」只会让人不再信任整个产品。
 *
 * 参照 derekhut/consumer-hook-lens 的取舍：第 3 层必须是诚实失败。
 *
 * 例外只有一条：**用户主动要看示例**（示例模式）是合法路径，
 * 那时给示例、标 `source=example`，界面上明写「示例数据」。
 * 「主动要看」和「真实分析失败」必须走两条不同的路。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const analyze = require(path.join(ROOT, 'cloudfunctions/analyze/lib/analyze.js'));
const sample = require(path.join(ROOT, 'cloudfunctions/analyze/lib/sample.js'));

const PROFILE = { who: '妈妈', difficulties: ['buttons'] };

/** 造一个可控的模型调用替身 */
function stub(impl) {
  const rec = { calls: 0 };
  rec.fn = function () {
    rec.calls++;
    return impl(rec.calls);
  };
  return rec;
}

function collectLogs() {
  const lines = [];
  const log = { error: function () { lines.push(Array.prototype.join.call(arguments, ' ')); },
    warn: function () {} };
  return { lines: lines, log: log };
}

function run(opts) {
  return analyze.runAnalysis(opts);
}

(async function () {
  console.log('\n[1] 真实分析失败时不给示例');

  {
    const rec = stub(function () { return JSON.stringify({ nonsense: true }); });
    const res = await run({ profile: PROFILE, imageBase64: 'AAA', deps: { callModel: rec.fn } });
    ok(res.ok === false, '结构不合法 → ok:false（实际 ' + res.ok + '）');
    ok(res.source === 'failed', 'source=failed（实际 ' + res.source + '）');
    ok(res.analysis === null, 'analysis 为 null，不是示例数据');
    ok(!!res.reason, '带明确的失败原因（实际 ' + JSON.stringify(res.reason) + '）');
    ok(rec.calls === analyze.MAX_ATTEMPTS, '确实重试到了上限（' + rec.calls + ' 次）');
    const sampleText = JSON.stringify(sample.sampleFor(PROFILE));
    ok(
      JSON.stringify(res).indexOf(sampleText) === -1,
      '返回里不含任何示例内容'
    );
  }

  {
    const rec = stub(function () { throw new Error('连接被重置'); });
    const res = await run({ profile: PROFILE, imageBase64: 'AAA', deps: { callModel: rec.fn } });
    ok(res.ok === false && res.source === 'failed', '模型调用抛错 → 诚实失败');
    ok(res.reason.indexOf('连接被重置') !== -1, '原因里保留原始错误（实际 ' + res.reason + '）');
  }

  console.log('\n[2] 重试确实发生');

  {
    const good = JSON.stringify({
      garment: '开衫', score: 70, level: '一般', summary: '还行',
      dims: [
        { key: 'dress', label: '穿脱省力', score: 74 },
        { key: 'closure', label: '开合操作', score: 48 },
        { key: 'cuff', label: '袖口宽松', score: 85 },
        { key: 'size', label: '尺码友好', score: 65 }
      ],
      findings: [{ type: 'warn', label: '注意', title: '纽扣较小', detail: '扣起来费劲' }],
      markers: [],
      questions: [{ title: '扣子是多大的？', detail: '想确认一下' }],
      script: '跟商家可以这样说',
      tryOn: ['试试能不能不解扣子直接套头'],
      idealFeatures: [], idealGap: '', idealScript: '逛店话术'
    });
    const rec = stub(function (n) {
      if (n === 1) throw new Error('第一次挂了');
      return good;
    });
    const res = await run({ profile: PROFILE, imageBase64: 'AAA', deps: { callModel: rec.fn } });
    ok(res.ok === true && res.source === 'model', '第一次失败第二次成功 → 真实结果');
    ok(res.attempts === 2, '记录尝试次数为 2（实际 ' + res.attempts + '）');
  }

  console.log('\n[3] 缺图必须阻断，不能交给模型去猜');

  {
    const rec = stub(function () { return JSON.stringify({}); });
    const res = await run({ profile: PROFILE, imageBase64: '', deps: { callModel: rec.fn } });
    // T00 侦察结论：不发送图片时模型照样返回一份合格的虚构分析（见 docs/model-recon-20260918.md）。
    // 所以缺图必须由程序拦下 —— 不能指望模型自觉拒答。
    ok(res.ok === false, '没有图片时不返回真实结果');
    ok(rec.calls === 0, '压根没有调用模型（调用 ' + rec.calls + ' 次）');
    ok(res.reason.indexOf('图') !== -1, '原因说明是缺图（实际 ' + res.reason + '）');
  }

  console.log('\n[4] 示例模式是另一条路');

  {
    const res = await run({ profile: PROFILE, imageBase64: '', deps: { forceFallback: true } });
    ok(res.ok === true, '主动看示例 → ok:true');
    ok(res.source === 'example', 'source=example（不是 failed，实际 ' + res.source + '）');
    ok(res.analysis && typeof res.analysis.score === 'number', '给的是完整示例数据');
  }

  console.log('\n[5] 没有模型也不能冒充');

  {
    const res = await run({ profile: PROFILE, imageBase64: 'AAA', deps: {} });
    ok(res.ok === false, '没注入模型调用函数 → 诚实失败，不给示例');
    ok(res.source === 'failed', 'source=failed');
  }

  console.log('\n[6] 原始错误进日志，不许吞');

  {
    const bag = collectLogs();
    await run({
      profile: PROFILE, imageBase64: 'AAA',
      deps: { callModel: stub(function () { throw new Error('深层错误'); }).fn, log: bag.log }
    });
    ok(bag.lines.length > 0, '失败时有日志输出（' + bag.lines.length + ' 条）');
    ok(
      bag.lines.join('\n').indexOf('深层错误') !== -1,
      '日志里能找到原始错误信息'
    );
  }

  console.log('\n[7] 返回结构稳定');

  {
    const res = await run({ profile: PROFILE, imageBase64: 'AAA', deps: {} });
    ['ok', 'source', 'reason', 'analysis', 'attempts'].forEach(function (key) {
      ok(Object.prototype.hasOwnProperty.call(res, key), '返回带 ' + key + ' 字段');
    });
    ok(typeof res.ok === 'boolean', 'ok 是布尔值');
    ok(['model', 'example', 'failed'].indexOf(res.source) !== -1, 'source 在约定范围内');
  }

  console.log('\n[8] 入口层的契约');

  {
    // 云函数入口看得见、测不着（本地跑不起来），所以只能扫源码守约定：
    // 失败分支不许再把示例数据塞进 analysis
    const { execFileSync } = require('child_process');
    const fs = require('fs');
    const entry = path.join(ROOT, 'cloudfunctions/analyze/index.js');
    const src = fs.readFileSync(entry, 'utf8');

    ok(
      src.indexOf('analysis: sample.sampleFor') === -1,
      'index.js 不再把示例数据填进 analysis'
    );
    ok(
      src.indexOf("source: 'fallback'") === -1,
      'index.js 不再自造 fallback 这个来源（统一用 failed）'
    );

    let syntaxOk = true;
    try {
      execFileSync(process.execPath, ['--check', entry], { stdio: 'ignore' });
    } catch (err) {
      syntaxOk = false;
    }
    ok(syntaxOk, 'index.js 语法可被 Node 解析');
  }

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed > 0 ? 1 : 0);
})();
