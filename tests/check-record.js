/**
 * 分析记录的统一形状（T01：R3、R6）。
 *
 * 以前 storage 里只塞了 analysis 本身，于是：
 *   - 结果页知道这份结果是模型给的还是示例，翻到下一页就丢了来源；
 *   - 换了照片或换了一个人，下一页仍然拿上一份结果来渲染（混合结果）。
 *
 * 记录必须自带「这份结果是谁、在什么时候、对哪张照片、用什么方式得出的」，
 * 并且能被下游页面一眼判断**还能不能用**。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const store = require(path.join(ROOT, 'utils/store.js'));

const PROFILE_A = { who: '妈妈', difficulties: ['buttons'] };
const PROFILE_B_WHO = { who: '爸爸', difficulties: ['buttons'] };
const PROFILE_B_DIFF = { who: '妈妈', difficulties: ['buttons', 'liftArm'] };
const ANALYSIS = {
  garment: { name: '开衫', category: 'top' },
  score: 62, level: '建议再确认', summary: '纽扣偏小',
  dims: [{ key: 'closure', label: '开合操作', score: 48 }],
  findings: [], markers: [], questions: [], script: '话术',
  tryOn: [], idealFeatures: [], idealGap: '', idealScript: ''
};

function makeWx() {
  const s = {};
  return {
    _storage: s,
    setStorageSync(k, v) { s[k] = v; },
    getStorageSync(k) { return s[k]; }
  };
}

console.log('\n[1] 记录该带的东西');

{
  const rec = store.buildRecord({
    analysis: ANALYSIS, source: 'model', fileID: 'cloud://a/b.jpg', profile: PROFILE_A
  });
  ['analysisVersion', 'fileID', 'profile', 'source', 'createdAt', 'analysis'].forEach(function (key) {
    ok(Object.prototype.hasOwnProperty.call(rec, key), '记录带 ' + key);
  });
  ok(rec.source === 'model', '来源写进记录（下游页面才不会丢）');
  ok(rec.fileID === 'cloud://a/b.jpg', '照片标识写进记录');
  ok(rec.profile.who === '妈妈', '资料快照写进记录');
  ok(typeof rec.createdAt === 'number' && rec.createdAt > 0, '时间写进记录');
  ok(typeof rec.analysisVersion === 'number', '分析版本是数字');
}

console.log('\n[2] 同一条路读出来还能用');

{
  const rec = store.buildRecord({
    analysis: ANALYSIS, source: 'model', fileID: 'cloud://a/b.jpg', profile: PROFILE_A
  });
  ok(store.isCompatibleRecord(rec, { fileID: 'cloud://a/b.jpg', profile: PROFILE_A }) === true, '自相容');
  ok(
    store.isCompatibleRecord(rec, { fileID: 'cloud://a/b.jpg', profile: { who: '妈妈', difficulties: ['buttons'] } }) === true,
    '等价资料（顺序无关）也算相容'
  );
}

console.log('\n[3] 换了照片或换了人就不能再用');

{
  const rec = store.buildRecord({
    analysis: ANALYSIS, source: 'model', fileID: 'cloud://a/b.jpg', profile: PROFILE_A
  });
  ok(
    store.isCompatibleRecord(rec, { fileID: 'cloud://a/c.jpg', profile: PROFILE_A }) === false,
    '换照片 → 不相容（不能拿旧结果给新照片）'
  );
  ok(
    store.isCompatibleRecord(rec, { fileID: 'cloud://a/b.jpg', profile: PROFILE_B_WHO }) === false,
    '换人 → 不相容（话术里的称呼会错）'
  );
  ok(
    store.isCompatibleRecord(rec, { fileID: 'cloud://a/b.jpg', profile: PROFILE_B_DIFF }) === false,
    '换动作难点 → 不相容'
  );
}

console.log('\n[4] 旧记录与坏记录');

{
  ok(store.isCompatibleRecord(null, { fileID: '', profile: PROFILE_A }) === false, 'null 不相容');
  // 升级前存进去的老格式：只有 analysis，没有 version
  const legacy = { score: 62, dims: ANALYSIS.dims };
  ok(store.isCompatibleRecord(legacy, { fileID: '', profile: PROFILE_A }) === false, '老格式（无版本）不相容 → 引导重新分析');
  const future = store.buildRecord({ analysis: ANALYSIS, source: 'model', fileID: '', profile: PROFILE_A });
  future.analysisVersion = future.analysisVersion + 1;
  ok(store.isCompatibleRecord(future, { fileID: '', profile: PROFILE_A }) === false, '版本不一致不相容');
}

console.log('\n[5] 失败不该留下结果');

{
  const wx1 = makeWx();
  ok(
    store.saveRecord(wx1, { analysis: null, source: 'failed', fileID: '', profile: PROFILE_A }) === false,
    '失败时拒绝写入记录（不留空结果骗下游页面）'
  );
  ok(wx1._storage[store.ANALYSIS_KEY] === undefined, 'storage 里没有留下记录');
}

console.log('\n[6] 存了再读，来源不丢');

{
  const wx1 = makeWx();
  store.saveRecord(wx1, {
    analysis: ANALYSIS, source: 'example', fileID: '', profile: PROFILE_A
  });
  const back = store.loadRecord(wx1);
  ok(!!back, '读回一条记录');
  ok(back.source === 'example', '来源跨页保住了（示例不会被当成真实分析）');
  ok(back.fileID === '', '照片标识保住了');
  ok(back.profile.who === '妈妈', '资料快照保住了');
  ok(
    store.isCompatibleRecord(back, { fileID: '', profile: PROFILE_A }) === true,
    '读回来的记录仍然可用'
  );
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
