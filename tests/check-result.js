const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const format = require(path.join(ROOT, 'utils/format.js'));
const store = require(path.join(ROOT, 'utils/store.js'));
const fallbackAnalysis = require(path.join(ROOT, 'utils/fallback-analysis.js'));

function makeWx(options) {
  const opts = options || {};
  const api = {
    _storage: {},
    _nav: null,
    _toast: null,
    _called: [],
    _callResult: opts.callResult || null,
    _callError: opts.callError || null,
    setStorageSync(k, v) { this._storage[k] = v; },
    getStorageSync(k) { return this._storage[k]; },
    navigateTo(o) { this._nav = o; },
    redirectTo(o) { this._nav = o; this._redirected = true; },
    showToast(o) { this._toast = o; },
    cloud: {
      callFunction(o) {
        api._called.push(o);
        if (api._callError) return Promise.reject(api._callError);
        return Promise.resolve({ result: api._callResult });
      },
      getTempFileURL(o) {
        api._tempCalls = (api._tempCalls || 0) + 1;
        const fileID = (o && o.fileList && o.fileList[0]) || '';
        return Promise.resolve({ fileList: [{ fileID: fileID, tempFileURL: 'https://tmp.example/y.jpg' }] });
      }
    }
  };
  return api;
}

function loadResultPage(wxMock) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = c => { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, 'pages/result/index.js'))];
  require(path.join(ROOT, 'pages/result/index.js'));
  const page = { data: JSON.parse(JSON.stringify(cfg.data)) };
  page.setData = function (patch) { Object.assign(this.data, patch); };
  Object.keys(cfg).forEach(function (key) {
    if (typeof cfg[key] === 'function') page[key] = cfg[key];
  });
  return { cfg, page };
}

const CLOUD_OK = {
  ok: true,
  source: 'model',
  analysis: fallbackAnalysis.build({ who: '妈妈', difficulties: ['buttons', 'liftArm'] })
};

/** 取图是 Promise 链，等它跑完再看界面上的最终状态 */
function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

async function main() {
  console.log('\n[1] utils/format.js 纯逻辑');
  ok(format.dimTone(92) === 'ink', '高分用主色');
  ok(format.dimTone(85) === 'ink', '75 分以上用主色');
  ok(format.dimTone(65) === 'muted', '中等分用弱色');
  ok(format.dimTone(48) === 'warn', '60 分以下用警示色');
  ok(format.dimTone('bad') === 'muted', '非法分数降级为弱色');

  ok(format.dimWidth(92) === '92%', '分数转百分比宽度');
  ok(format.dimWidth(-5) === '0%', '负数夹到 0%');
  ok(format.dimWidth(180) === '100%', '超过 100 夹到 100%');

  const style = format.markerStyle({ x: 44, y: 14, type: 'good' });
  ok(style.left === '44%' && style.top === '14%', '标注定位转换');
  ok(style.cls === 'ok', 'good 标注用 ok 样式');
  ok(format.markerStyle({ x: 46, y: 52, type: 'warn' }).cls === 'warn', 'warn 标注用 warn 样式');
  ok(format.markerStyle({ x: 999, y: -3 }).left === '100%', '越界坐标被夹紧');

  ok(format.scoreTone(80) === 'good', '80 分以上结论为正向');
  ok(format.scoreTone(73) === 'warn', '60-79 分结论需确认');
  ok(format.scoreTone(40) === 'risk', '60 分以下结论需替换');

  const dots = format.stepDots(2, 4);
  ok(dots.length === 4 && dots[2] === true && dots[3] === false, '进度圆点：当前步及之前点亮');

  console.log('\n[2] 本地兜底数据');
  ok(typeof fallbackAnalysis.build === 'function', '提供 build 方法');
  const fb = fallbackAnalysis.build({ who: '爸爸', difficulties: ['buttons'] });
  ok(fb.score > 0 && fb.dims.length === 4, '本地兜底数据完整');
  ok(fb.script.indexOf('爸爸') >= 0, '本地兜底使用画像对象名');

  console.log('\n[3] 分析结果的存取（页面间传递）');
  const wxStore = makeWx();
  const saved = store.saveRecord(wxStore, {
    analysis: CLOUD_OK.analysis,
    source: 'model',
    fileID: 'cloud://x/y.jpg',
    profile: { who: '妈妈', difficulties: ['buttons'] }
  });
  ok(saved === true, '完整记录可写入');
  const loaded = store.loadAnalysis(wxStore);
  ok(loaded && loaded.score === CLOUD_OK.analysis.score, '分析结果可存取');
  ok(store.loadAnalysis(makeWx()) === null, '存储为空时返回 null');
  wxStore._storage[store.ANALYSIS_KEY] = 'not-json-object';
  ok(store.loadAnalysis(wxStore) === null, '脏数据返回 null');
  // 升级前存进去的老格式只有 analysis —— 必须被判为不可用并引导重新分析
  wxStore._storage[store.ANALYSIS_KEY] = CLOUD_OK.analysis;
  ok(store.loadRecord(wxStore) === null, '老格式（无版本）读不出来 → 引导重新分析');

  console.log('\n[4] 页面守卫');
  let wx1 = makeWx({ callResult: CLOUD_OK });
  let { cfg, page } = loadResultPage(wx1);
  cfg.onLoad.call(page, {});
  ok(wx1._redirected === true && wx1._nav.url === '/pages/profile/index', '无画像时重定向回 profile');

  console.log('\n[5] 正常分析路径');
  wx1 = makeWx({ callResult: CLOUD_OK });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons', 'liftArm'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  ok(page.data.loading === true, '发起请求时处于加载态');
  await page.loadAnalysis('cloud://x/y.jpg', false);
  ok(wx1._called.length >= 1, '调用了云函数');
  ok(wx1._called[0].name === 'analyze', '调用的是 analyze 云函数');
  ok(wx1._called[0].data.fileID === 'cloud://x/y.jpg', '透传 fileID');
  ok(wx1._called[0].data.profile.who === '妈妈', '透传画像');
  ok(page.data.loading === false, '返回后结束加载态');
  ok(page.data.analysis.score === CLOUD_OK.analysis.score, '渲染模型返回的分数');
  ok(page.data.source === 'model', '记录来源');
  ok(page.data.sampleNote === false, '真实结果不显示示例提示');
  // 原图取回来之后标注才画上去：照片没显示时不能先把点画在占位块上
  await flush();
  ok(page.data.photoSrc === 'https://tmp.example/y.jpg', '结果页显示这次拍的那张照片');

  console.log('\n[6] 视图数据加工');
  ok(page.data.dimsView.length === 4, '四个分项渲染数据');
  const closure = page.data.dimsView.find(d => d.key === 'closure');
  ok(closure.width === '48%' && closure.tone === 'warn', '低分项宽度与配色正确');
  ok(page.data.markersView.length === 3, '三个图上标注');
  ok(page.data.markersView[1].cls === 'warn', '第二个标注为警示样式');
  ok(page.data.scoreTone === 'warn', '73 分结论样式为 warn');

  console.log('\n[6b] 标注编号与落点');
  // 契约变了：图上写的是部位名（「门襟纽扣」比一个橙色「2」好认），
  // 只有模型没给部位名时才退回编号 —— 编号那条路在下面单独喂数据测。
  const warnLabels = page.data.markersView.filter(m => m.cls === 'warn').map(m => m.label);
  ok(warnLabels.length === 1 && warnLabels[0].length > 0 && !/^\d+$/.test(warnLabels[0]),
    '警示标注写的是部位名');
  ok(page.data.markersView.filter(m => m.cls === 'ok').every(m => m.label.length > 0),
    '省力部位同样标出名字');

  const twoWarns = format.markersView([
    { x: 50, y: 40, type: 'warn' },
    { x: 50, y: 60, type: 'warn' },
    { x: 30, y: 50, type: 'good' }
  ]);
  ok(twoWarns.filter(m => m.cls === 'warn').map(m => m.label).join(',') === '1,2', '多个警示标注依次编号 1、2');

  const findings = format.findingsView([
    { type: 'good', label: '省力', title: 'a', detail: '' },
    { type: 'warn', label: '注意', title: 'b', detail: '' },
    { type: 'warn', label: '注意', title: 'c', detail: '' }
  ]);
  ok(findings[0].index === '', '正向结论不带编号');
  ok(findings[1].index === '1' && findings[2].index === '2', '警示结论与图上编号一致');

  // 范围口径与款式图取景保持一致：assets/garment-current.svg 的 viewBox="52 34 196 196"，
  // 衣服本体在图上约占横向 15%-85%、纵向 12%-88%。
  const sampleMarkers = fallbackAnalysis.build({ who: '妈妈', difficulties: ['buttons', 'liftArm'] }).markers;
  const inRange = sampleMarkers.every(m => m.x >= 15 && m.x <= 85 && m.y >= 12 && m.y <= 88);
  ok(inRange, '示例标注坐标落在衣服本体范围内（不会飘到画外）');

  console.log('\n[7] 示例入口（example=1）');
  // 示例是用户主动要看的那条路：本地直接出，不调云函数、更不调模型
  wx1 = makeWx({ callResult: { ok: true, source: 'example', analysis: CLOUD_OK.analysis } });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { example: '1' });
  await page.loadAnalysis('', true);
  ok(wx1._called.length === 0, '示例路径压根不调云函数（不会误触发模型）');
  ok(page.data.sampleNote === true, '示例来源显示示例提示');
  ok(page.data.source === 'example', '来源标记为 example');

  console.log('\n[8] 真实分析失败 → 诚实失败，不用示例顶上');
  wx1 = makeWx({ callError: { errMsg: 'cloud function not found' } });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  ok(page.data.loading === false, '异常后结束加载态');
  // 契约变了：以前这里断言「改用前端兜底数据继续渲染」。
  // 那是假装成功 —— 家属会以为这是模型看了自家衣服得出的结论。
  ok(page.data.analysis === null, '不塞示例数据（analysis 为 null）');
  ok(page.data.outcome.kind === 'failed', '进入失败态');
  ok(page.data.outcome.title.indexOf('没分析出来') !== -1, '说的是「这次没分析出来」');
  ok(
    page.data.outcome.actions.some(a => a.key === 'retry') &&
    page.data.outcome.actions.some(a => a.key === 'reselect'),
    '给「再试一次」和「换一张照片」两个出口'
  );

  wx1 = makeWx({ callResult: { ok: false, source: 'failed', reason: '缺图' } });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  ok(page.data.outcome.kind === 'failed', '云函数说失败时也走失败态');
  ok(page.data.analysis === null, '云函数失败同样不带示例数据');

  console.log('\n[8b] 重试保留原来那张照片');
  wx1 = makeWx({ callResult: CLOUD_OK });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  page.onRetry();
  await Promise.resolve();
  const retryCall = wx1._called[wx1._called.length - 1];
  ok(retryCall.data.fileID === 'cloud://x/y.jpg', '重试用的还是原来那张照片（不传空 fileID）');

  console.log('\n[9] 页面跳转与数据传递');
  wx1 = makeWx({ callResult: CLOUD_OK });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  page.onConfirm();
  ok(wx1._nav.url === '/pages/confirm/index', '跳转购买确认页');
  ok(store.loadAnalysis(wx1) !== null, '分析结果已存入 storage 供下一页使用');
  wx1._nav = null;
  page.onIdeal();
  ok(wx1._nav.url === '/pages/ideal/index', '跳转理想款对比页');

  console.log('\n[10] 加载态兜底');
  wx1 = makeWx({ callResult: CLOUD_OK });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadResultPage(wx1));
  cfg.onRetry.call(page);
  ok(wx1._toast && wx1._toast.icon === 'none', '未加载完成时点重试给出提示');

  console.log('\n[11] WXML 结构');
  const wxml = read('pages/result/index.wxml');
  ok(wxml.includes('01') && wxml.includes('好穿指数'), '含 01 好穿指数段落标签');
  ok(wxml.includes('02') && wxml.includes('结构分析'), '含 02 结构分析段落标签');
  ok(wxml.includes('analysis.score'), '渲染总分');
  ok(wxml.includes('wx:for="{{dimsView}}"'), '分项用 wx:for 渲染');
  ok(wxml.includes('wx:for="{{findings}}"') || wxml.includes('analysis.findings'), 'findings 渲染');
  ok(wxml.includes('wx:for="{{markersView}}"'), '标注用 wx:for 渲染');
  ok(wxml.includes('garment'), '含服装款式图');
  ok(wxml.includes('loading'), '含加载态');
  ok(wxml.includes('sampleNote'), '含示例数据提示');
  ok(wxml.includes('bindtap="onConfirm"'), '绑定购买确认入口');
  ok(wxml.includes('bindtap="onIdeal"'), '绑定理想款入口');

  console.log('\n[12] 款式图资源');
  ok(fs.existsSync(path.join(ROOT, 'assets/garment-current.png')), '当前款款式图 PNG 存在');
  ok(fs.existsSync(path.join(ROOT, 'assets/garment-ideal.png')), '理想款款式图 PNG 存在');

  console.log('\n[13] 文案合规与回归');
  const banned = ['残障', '残疾', '病人', '疾病'];
  ['pages/result/index.wxml', 'pages/result/index.js', 'utils/format.js', 'utils/fallback-analysis.js'].forEach(f => {
    const hit = banned.filter(w => read(f).includes(w));
    ok(hit.length === 0, f + ' 无禁用词' + (hit.length ? '（命中: ' + hit.join(',') + '）' : ''));
  });
  const { execSync } = require('child_process');
  const r = execSync('node ' + path.join(ROOT, 'tests/check-skeleton.js')).toString();
  ok(r.includes('0 失败'), '骨架测试保持全绿');

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed > 0 ? 1 : 0);
}

main();
