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

// 原生 checkbox-group 触发 change 时，事件里带的是「当前所有选中项的 value 数组」。
// 用这个 helper 模拟真实事件，而不是直接改 data —— 那样测不到同步逻辑。
function pick() {
  return { detail: { value: Array.prototype.slice.call(arguments) } };
}

const store = require(path.join(ROOT, 'utils/store.js'));
const format = require(path.join(ROOT, 'utils/format.js'));
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

function loadConfirmPage(wxMock) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = c => { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, 'pages/confirm/index.js'))];
  require(path.join(ROOT, 'pages/confirm/index.js'));
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
    const analysis = opts.analysis || fallback.build({ who: '妈妈', difficulties: ['buttons', 'liftArm'] });
    wxMock._storage[store.ANALYSIS_KEY] = analysis;
  }
  return wxMock;
}

function main() {
  console.log('\n[1] 编号格式化');
  ok(format.indexLabel(0) === '01', '第 1 项编号 01');
  ok(format.indexLabel(9) === '10', '第 10 项编号 10');

  console.log('\n[2] 页面守卫');
  let wx1 = makeWx();
  let { cfg, page } = loadConfirmPage(wx1);
  cfg.onLoad.call(page);
  ok(wx1._redirected === true && wx1._nav.url === '/pages/profile/index', '无画像时回到 profile');

  wx1 = makeWx();
  seed(wx1, { withAnalysis: false });
  ({ cfg, page } = loadConfirmPage(wx1));
  cfg.onLoad.call(page);
  ok(wx1._redirected === true && wx1._nav.url === '/pages/add/index', '无分析结果时回到添加衣服页');

  console.log('\n[3] 渲染分析结果');
  wx1 = makeWx();
  seed(wx1);
  ({ cfg, page } = loadConfirmPage(wx1));
  cfg.onLoad.call(page);
  ok(page.data.who === '妈妈', '读取画像对象名');
  ok(page.data.loaded === true, '标记数据已就绪');
  const analysis = wx1._storage[store.ANALYSIS_KEY];
  ok(page.data.questions.length === analysis.questions.length, '渲染全部待确认问题');
  ok(page.data.questions[0].index === '01', '问题按 01 起编号');
  ok(page.data.questions[0].title === analysis.questions[0].title, '问题标题来自分析结果');
  ok(page.data.script === analysis.script, '话术默认生成好（无需点击）');
  ok(page.data.tryOn.length === analysis.tryOn.length, '试穿清单条数正确');
  ok(page.data.tryOn[0].checked === false, '试穿项初始未勾选');
  ok(page.data.steps.length === 4 && page.data.currentStep === 3, '进度为第 4 步');

  console.log('\n[4] 一键复制话术');
  page.onCopyScript();
  ok(wx1._clipboard === analysis.script, '复制的内容是完整话术');
  ok(wx1._toast && wx1._toast.title.indexOf('复制') >= 0, '复制后给出反馈');

  console.log('\n[5] 试穿清单勾选（由原生 checkbox-group 驱动）');
  page.onTryChange(pick('0'));
  ok(page.data.tryOn[0].checked === true, '勾选后状态同步');
  page.onTryChange(pick());
  ok(page.data.tryOn[0].checked === false, '取消勾选后状态同步');
  page.onTryChange(pick('2'));
  ok(page.data.tryOn[2].checked === true && page.data.tryOn[0].checked === false, '可独立勾选任意一项');
  page.onTryChange(pick('0', '2'));
  ok(page.data.tryOn[0].checked && page.data.tryOn[2].checked, '支持同时勾选多项');
  page.onTryChange({});
  ok(page.data.tryOn.every(t => !t.checked), '事件对象异常时不报错');

  console.log('\n[6] 页面跳转');
  wx1._nav = null;
  page.onAgain();
  ok(wx1._nav && wx1._nav.url === '/pages/add/index', '再分析一件回到添加衣服页');
  wx1._nav = null;
  page.onIdeal();
  ok(wx1._nav && wx1._nav.url === '/pages/ideal/index', '可跳转理想款对比');
  wx1._nav = null;
  page.onCopyIdealScript && page.onCopyIdealScript();
  ok(wx1._clipboard === analysis.idealScript, '可复制理想款询问话术');

  console.log('\n[7] 空数据保护');
  wx1 = makeWx();
  seed(wx1, { withAnalysis: false });
  ({ cfg, page } = loadConfirmPage(wx1));
  page.onCopyScript.call(page);
  ok(wx1._toast && wx1._toast.icon === 'none', '无内容时复制给出提示而不报错');

  console.log('\n[8] WXML 结构（复用原生组件）');
  const wxml = read('pages/confirm/index.wxml');
  ok(wxml.includes('wx:for="{{questions}}"'), '问题列表用 wx:for 渲染');
  ok(wxml.includes('item.index'), '渲染问题编号');
  ok(wxml.includes('bindtap="onCopyScript"'), '绑定复制话术');
  ok(wxml.includes('script'), '渲染话术内容');
  ok(wxml.includes('wx:for="{{tryOn}}"'), '试穿清单用 wx:for 渲染');
  ok(wxml.includes('<checkbox-group'), '勾选清单用原生 checkbox-group');
  ok(wxml.includes('<checkbox ') && wxml.includes('value="{{index}}"'), '用原生 checkbox，value 绑下标');
  ok(wxml.includes('bindchange="onTryChange"'), '监听原生 change 事件');
  ok(wxml.includes('<label'), 'label 包裹，整行可点');
  ok(!wxml.includes('try-box'), '不再自画勾选框');
  ok(!wxml.includes('onToggleTry'), '不再手写切换逻辑');
  ok(wxml.includes('bindtap="onAgain"'), '含再分析一件入口');
  ok(wxml.includes('dots'), '含进度圆点');

  console.log('\n[9] 文案合规与回归');
  const banned = ['残障', '残疾', '病人', '疾病'];
  ['pages/confirm/index.wxml', 'pages/confirm/index.js'].forEach(f => {
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
