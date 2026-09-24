/**
 * 首屏必须就有内容，而且示例这条路要能一步走到。
 *
 * 现在首页是 `pages/profile` —— 一个表单（填称呼、勾动作难点）。
 * 演示时评委打开要先输入十几秒才看到第一个结果，这是「首屏即有内容」的反面。
 * 参考 consumer-hook-lens：打开即是内容，示例不依赖网络、也不要求先填资料。
 *
 * 所以首屏要有一条「先看个示例」的路，点一下直接进结果页，
 * 并且**不能把示例用的资料写进 storage** —— 那会污染用户真正的资料。
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

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const store = require(path.join(ROOT, 'utils/store.js'));

function makeWx(storage) {
  const api = {
    _storage: storage || {},
    _nav: null,
    _toast: null,
    _called: [],
    setStorageSync(k, v) { this._storage[k] = v; },
    getStorageSync(k) { return this._storage[k]; },
    navigateTo(o) { this._nav = o; },
    redirectTo(o) { this._nav = o; this._redirected = true; },
    showToast(o) { this._toast = o; },
    setNavigationBarColor() {},
    cloud: {
      callFunction(o) { api._called.push(o); return Promise.resolve({ result: { ok: true, source: 'model', analysis: null } }); }
    }
  };
  return api;
}

function loadPage(rel, wxMock) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = function (c) { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, rel))];
  require(path.join(ROOT, rel));
  const page = { data: JSON.parse(JSON.stringify(cfg.data)) };
  page.setData = function (patch) { Object.assign(this.data, patch); };
  Object.keys(cfg).forEach(function (key) {
    if (typeof cfg[key] === 'function') page[key] = cfg[key];
  });
  return { cfg: cfg, page: page };
}

console.log('\n[1] 示例资料');

ok(!!store.SAMPLE_PROFILE, 'store 导出 SAMPLE_PROFILE');
ok(store.isValidProfile(store.SAMPLE_PROFILE) === true, '示例资料本身是合法资料');
ok(typeof store.SAMPLE_PROFILE.who === 'string' && store.SAMPLE_PROFILE.who.length > 0, '示例资料有称呼');
ok(Array.isArray(store.SAMPLE_PROFILE.difficulties), '示例资料有难点列表');

console.log('\n[2] 首屏有示例入口');

const profileWxml = read('pages/profile/index.wxml');
ok(profileWxml.indexOf('onSample') !== -1, '首屏模板里有示例入口');
ok(profileWxml.indexOf('示例') !== -1, '入口文案写明是示例');

{
  const wx1 = makeWx({});
  const { page } = loadPage('pages/profile/index.js', wx1);
  ok(typeof page.onSample === 'function', '首屏实现 onSample');
  page.onSample();
  ok(!!wx1._nav && wx1._nav.url.indexOf('example=1') !== -1, '点了直接进结果页的示例路径（' + (wx1._nav && wx1._nav.url) + '）');
}

console.log('\n[3] 示例路径不要求先填资料');

{
  // storage 里什么都没有 —— 以前这种情况会被 result 页踢回首屏
  const wx1 = makeWx({});
  const { cfg, page } = loadPage('pages/result/index.js', wx1);
  cfg.onLoad.call(page, { example: '1' });
  ok(wx1._redirected !== true, '没有被踢回首屏（首屏没内容就是白走一趟）');
  ok(page.data.analysis !== null, '直接渲染出示例结果');
  ok(page.data.source === 'example', '来源标为 example');
}

console.log('\n[4] 示例不污染真实资料');

{
  const wx1 = makeWx({});
  const { cfg, page } = loadPage('pages/result/index.js', wx1);
  cfg.onLoad.call(page, { example: '1' });
  ok(
    wx1._storage[store.KEY] === undefined,
    '示例路径不把资料写进 storage（真实资料还是用户自己的）'
  );
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
