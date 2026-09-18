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

const store = require(path.join(ROOT, 'utils/store.js'));
const fallback = require(path.join(ROOT, 'utils/fallback-analysis.js'));

function makeWx() {
  const api = {
    _storage: {},
    _nav: null,
    _toast: null,
    _clipboard: null,
    setStorageSync(k, v) { this._storage[k] = v; },
    getStorageSync(k) { return this._storage[k]; },
    navigateTo(o) { this._nav = o; },
    navigateBack() { this._nav = { back: true }; },
    redirectTo(o) { this._nav = o; this._redirected = true; },
    showToast(o) { this._toast = o; },
    setClipboardData(o) {
      api._clipboard = o.data;
      if (o.success) o.success({});
      return Promise.resolve({});
    }
  };
  return api;
}

function loadIdealPage(wxMock) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = c => { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, 'pages/ideal/index.js'))];
  require(path.join(ROOT, 'pages/ideal/index.js'));
  const page = { data: JSON.parse(JSON.stringify(cfg.data)) };
  page.setData = function (patch) { Object.assign(this.data, patch); };
  Object.keys(cfg).forEach(function (key) {
    if (typeof cfg[key] === 'function') page[key] = cfg[key];
  });
  return { cfg, page };
}

function seed(wxMock, options) {
  const opts = options || {};
  wxMock._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons', 'liftArm'], updatedAt: Date.now() };
  if (opts.withAnalysis !== false) {
    wxMock._storage[store.ANALYSIS_KEY] =
      opts.analysis || fallback.build({ who: '妈妈', difficulties: ['buttons', 'liftArm'] });
  }
  return wxMock;
}

function main() {
  console.log('\n[1] 页面守卫');
  let wx1 = makeWx();
  let { cfg, page } = loadIdealPage(wx1);
  cfg.onLoad.call(page);
  ok(wx1._redirected === true && wx1._nav.url === '/pages/profile/index', '无画像时回到 profile');

  wx1 = makeWx();
  seed(wx1, { withAnalysis: false });
  ({ cfg, page } = loadIdealPage(wx1));
  cfg.onLoad.call(page);
  ok(wx1._redirected === true && wx1._nav.url === '/pages/add/index', '无分析结果时回到添加衣服页');

  console.log('\n[2] 双栏渲染');
  wx1 = makeWx();
  seed(wx1);
  const analysis = wx1._storage[store.ANALYSIS_KEY];
  ({ cfg, page } = loadIdealPage(wx1));
  cfg.onLoad.call(page);
  ok(page.data.who === '妈妈', '读取画像对象名');
  ok(page.data.loaded === true, '标记数据就绪');
  ok(page.data.garmentName === analysis.garment.name, '左栏显示当前件名称');
  ok(page.data.score === analysis.score, '左栏显示当前件分数');
  ok(page.data.currentFacts.length > 0 && page.data.currentFacts.length <= 3, '左栏列出当前件要点（最多 3 条）');
  ok(page.data.idealFeatures.length === analysis.idealFeatures.length, '右栏列出理想款特征');
  ok(page.data.idealFeatures[0].index === '1', '理想款特征从 1 起编号');
  ok(page.data.idealFeatures[0].title === analysis.idealFeatures[0].title, '特征标题来自分析结果');
  ok(page.data.idealGap === analysis.idealGap, '显示差距说明');
  ok(page.data.idealScript === analysis.idealScript, '理想款询问话术来自分析结果');
  ok(page.data.imageCurrent.indexOf('garment-current') > 0, '左栏使用当前件款式图');
  ok(page.data.imageIdeal.indexOf('garment-ideal') > 0, '右栏使用理想款款式图');

  console.log('\n[3] 编号兜底');
  wx1 = makeWx();
  const messy = fallback.build({ who: '妈妈', difficulties: ['buttons'] });
  messy.idealFeatures = [{ title: 'A', detail: '' }, { title: 'B', detail: '' }];
  seed(wx1, { analysis: messy });
  ({ cfg, page } = loadIdealPage(wx1));
  cfg.onLoad.call(page);
  ok(page.data.idealFeatures.map(f => f.index).join(',') === '1,2', '模型未给编号时按顺序补 1、2');

  console.log('\n[4] 复制话术');
  page.onCopyScript();
  ok(wx1._clipboard === messy.idealScript, '复制的是理想款询问话术');
  ok(wx1._toast && wx1._toast.title.indexOf('复制') >= 0, '复制后给出反馈');

  console.log('\n[5] 页面跳转');
  wx1._nav = null;
  page.onConfirm();
  ok(wx1._nav && wx1._nav.url === '/pages/confirm/index', '下一步进入购买确认');
  wx1._nav = null;
  page.onBack();
  ok(wx1._nav && (wx1._nav.back === true || wx1._nav.url.indexOf('result') > 0), '可返回分析结果');

  console.log('\n[6] 空数据保护');
  wx1 = makeWx();
  seed(wx1, { withAnalysis: false });
  ({ cfg, page } = loadIdealPage(wx1));
  page.onCopyScript.call(page);
  ok(wx1._toast && wx1._toast.icon === 'none', '未加载时复制不报错');

  console.log('\n[7] WXML 结构');
  const wxml = read('pages/ideal/index.wxml');
  ok(wxml.includes('imageCurrent') && wxml.includes('imageIdeal'), '渲染两张款式图');
  ok(wxml.includes('currentFacts'), '渲染当前件要点');
  ok(wxml.includes('wx:for="{{idealFeatures}}"'), '理想款特征用 wx:for 渲染');
  ok(wxml.includes('idealFeatures'), '引用理想款特征数据');
  ok(wxml.includes('idealGap'), '渲染差距说明');
  ok(wxml.includes('bindtap="onCopyScript"'), '绑定复制话术');
  ok(wxml.includes('bindtap="onConfirm"'), '绑定进入购买确认');
  ok(wxml.includes('dots'), '含进度圆点');

  console.log('\n[8] 文案合规与资源回归');
  const banned = ['残障', '残疾', '病人', '疾病'];
  ['pages/ideal/index.wxml', 'pages/ideal/index.js'].forEach(f => {
    const hit = banned.filter(w => read(f).includes(w));
    ok(hit.length === 0, f + ' 无禁用词' + (hit.length ? '（命中: ' + hit.join(',') + '）' : ''));
  });
  ok(fs.existsSync(path.join(ROOT, 'assets/garment-ideal.png')), '理想款款式图资源存在');
  const { execSync } = require('child_process');
  const r = execSync('node ' + path.join(ROOT, 'tests/check-skeleton.js')).toString();
  ok(r.includes('0 失败'), '骨架测试保持全绿');

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed > 0 ? 1 : 0);
}

main();
