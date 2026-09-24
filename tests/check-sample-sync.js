/**
 * 示例数据的两份实现必须一致。
 *
 * 前端用 `utils/fallback-analysis.js`（小程序打包时云函数目录不进去），
 * 云函数用 `cloudfunctions/analyze/lib/sample.js`（它 require 不到上级目录）——
 * 所以物理上必须有两份文件。但**口径只能有一份**：
 * 这两份原来各写各的，注释里写着「有意保持一致的判断口径」，
 * 这句话没有任何东西守着，改一个分数忘了改另一边也不会有人知道。
 *
 * 解法沿用提示词的先例：云函数那份**由脚本生成**，不许手改；
 * 再用断言比对两边在各种资料组合下的实际输出。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const SRC = 'utils/fallback-analysis.js';
const GEN = 'cloudfunctions/analyze/lib/sample.js';
const TOOL = '../tools/build-sample.js';

console.log('\n[1] 生成工具与生成物');

ok(fs.existsSync(path.join(ROOT, SRC)), SRC + ' 存在（真身）');
ok(fs.existsSync(path.join(ROOT, GEN)), GEN + ' 存在（副本）');
ok(fs.existsSync(path.join(ROOT, 'tools/build-sample.js')), 'tools/build-sample.js 存在');

let render = null;
try {
  render = require(TOOL).render;
} catch (err) {
  ok(false, 'tools/build-sample.js 可被 require（' + err.message + '）');
}
ok(typeof render === 'function', 'build-sample.js 导出 render()');

console.log('\n[2] 副本没有被人手改过');

if (render) {
  const expected = render();
  const actual = fs.readFileSync(path.join(ROOT, GEN), 'utf8');
  ok(
    actual === expected,
    '云函数副本与生成结果逐字节一致（不一致就是手改过或忘了重新生成）'
  );
  ok(
    actual.indexOf('tools/build-sample.js') !== -1 && actual.indexOf('生成') !== -1,
    '副本头部写明它是生成物'
  );
  ok(
    actual.indexOf('不要手改') !== -1,
    '副本头部写明不要手改'
  );
}

console.log('\n[3] 两边口径一致');

const front = require('../' + SRC);
const cloud = require('../' + GEN);

ok(typeof front.build === 'function', '前端导出 build()');
ok(typeof cloud.sampleFor === 'function', '云函数导出 sampleFor()');

const combos = [
  { who: '妈妈', difficulties: [] },
  { who: '妈妈', difficulties: ['buttons'] },
  { who: '妈妈', difficulties: ['liftArm'] },
  { who: '妈妈', difficulties: ['bend'] },
  { who: '爸爸', difficulties: ['buttons', 'liftArm'] },
  { who: '奶奶', difficulties: ['buttons', 'bend'] },
  { who: '爷爷', difficulties: ['liftArm', 'bend'] },
  { who: '家人', difficulties: ['buttons', 'liftArm', 'bend'] },
  { who: '', difficulties: [] },
  null
];

if (typeof front.build === 'function' && typeof cloud.sampleFor === 'function') {
  // 云函数那侧会额外盖一个 source='fallback'，那是来源标记不是示例内容，比较时剔掉
  function stripSource(obj) {
    const copy = Object.assign({}, obj);
    delete copy.source;
    return JSON.stringify(copy);
  }

  let diffCount = 0;
  combos.forEach(function (profile) {
    if (stripSource(front.build(profile)) !== stripSource(cloud.sampleFor(profile))) {
      diffCount++;
    }
  });
  ok(
    diffCount === 0,
    '各种资料组合下两边示例内容相同（共 ' + combos.length + ' 组，不同 ' + diffCount + ' 组）'
  );

  const marked = cloud.sampleFor({ who: '妈妈', difficulties: ['buttons'] });
  ok(marked.source === 'fallback', '云函数那份带 source=fallback（界面靠它标「示例数据」）');

  // 示例数据本身也得站得住：分数在 0–100，关键字段不为空
  const one = front.build({ who: '妈妈', difficulties: ['buttons'] });
  ok(!!one && typeof one.score === 'number', '示例带总分');
  ok(one.score >= 0 && one.score <= 100, '总分在 0–100（实际 ' + one.score + '）');
  ok(Array.isArray(one.dims) && one.dims.length > 0, '示例带分项');
  ok(!!one.idealScript, '示例带逛店话术');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
