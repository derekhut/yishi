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

const photo = require(path.join(ROOT, 'utils/photo.js'));
const format = require(path.join(ROOT, 'utils/format.js'));
const store = require(path.join(ROOT, 'utils/store.js'));
const fallback = require(path.join(ROOT, 'utils/fallback-analysis.js'));
const schema = require(path.join(ROOT, 'cloudfunctions/analyze/lib/schema.js'));

const TEMP_URL = 'https://tmp.example.com/y.jpg';

/** 等到所有微任务跑完（取图是 Promise 链） */
function flush() {
  return new Promise(function (resolve) { setImmediate(resolve); });
}

function makeWx(options) {
  const opts = options || {};
  const api = {
    _storage: {},
    _nav: null,
    _toast: null,
    _tempCalls: [],
    _tempUrl: 'tempUrl' in opts ? opts.tempUrl : TEMP_URL,
    _tempError: opts.tempError || null,
    setStorageSync(k, v) { this._storage[k] = v; },
    getStorageSync(k) { return this._storage[k]; },
    navigateTo(o) { this._nav = o; },
    redirectTo(o) { this._nav = o; this._redirected = true; },
    showToast(o) { this._toast = o; },
    cloud: {
      getTempFileURL(o) {
        api._tempCalls.push(o);
        if (api._tempError) return Promise.reject(api._tempError);
        const fileID = (o && o.fileList && o.fileList[0]) || '';
        return Promise.resolve({
          fileList: [{ fileID: fileID, tempFileURL: api._tempUrl }]
        });
      }
    }
  };
  return api;
}

function loadPage(wxMock, file) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = c => { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, file))];
  require(path.join(ROOT, file));
  const page = { data: JSON.parse(JSON.stringify(cfg.data)) };
  page.setData = function (patch) { Object.assign(this.data, patch); };
  Object.keys(cfg).forEach(function (key) {
    if (typeof cfg[key] === 'function') page[key] = cfg[key];
  });
  return { cfg, page };
}

const loadResult = wxMock => loadPage(wxMock, 'pages/result/index.js');
const loadIdeal = wxMock => loadPage(wxMock, 'pages/ideal/index.js');

const CLOUD_OK = {
  ok: true,
  source: 'model',
  analysis: fallback.build({ who: '妈妈', difficulties: ['buttons', 'liftArm'] })
};

async function main() {
  console.log('\n[1] 照片来源判定：示例不许拿真实照片，真实不许拿配套图');
  const real = photo.resolvePhoto({ source: 'model', fileID: 'cloud://x/y.jpg' });
  ok(real.kind === 'file' && real.fileID === 'cloud://x/y.jpg', '真实结果 → 取用户那张照片');
  ok(real.src === '', '取回之前不给任何图（不先拿配套图顶着）');

  // 结论是示例的，图上却挂着用户拍的照片 —— 等于把示例话术说成「看了你的衣服」
  const sampleWithFile = photo.resolvePhoto({ source: 'example', fileID: 'cloud://x/y.jpg' });
  ok(sampleWithFile.kind === 'asset', '示例结果 → 用配套图（即使带了 fileID）');
  ok(sampleWithFile.src.indexOf('garment-current') > 0, '示例用的是配套款式图');
  ok(sampleWithFile.fileID === '', '示例不保留 fileID（避免再去取真实照片）');

  ok(photo.resolvePhoto({ source: 'fallback', fileID: '' }).kind === 'asset', 'local-fallback 也按示例处理');
  ok(photo.resolvePhoto({ source: 'cache', fileID: 'cloud://x/y.jpg' }).kind === 'file', '缓存命中的真实结果仍取原图');
  ok(photo.resolvePhoto({ source: 'model', fileID: '' }).kind === 'none', '真实结果但丢了 fileID → 没有图可显示');

  console.log('\n[2] 取回可显示的链接');
  let wx1 = makeWx();
  ok(await photo.fetchPhotoUrl(wx1, 'cloud://x/y.jpg') === TEMP_URL, '取回临时链接');
  ok(wx1._tempCalls.length === 1 && wx1._tempCalls[0].fileList[0] === 'cloud://x/y.jpg', '按 fileID 取图');

  const callsBefore = wx1._tempCalls.length;
  ok(await photo.fetchPhotoUrl(wx1, '') === null, '空 fileID 不返回链接');
  ok(wx1._tempCalls.length === callsBefore, '空 fileID 压根不发请求');

  ok(await photo.fetchPhotoUrl(makeWx({ tempUrl: null }), 'cloud://x/y.jpg') === null, '返回里没有链接 → 判为失败');
  ok(await photo.fetchPhotoUrl(makeWx({ tempError: { errMsg: 'no permission' } }), 'cloud://x/y.jpg') === null,
    '取图报错 → 返回 null（不把异常抛给页面）');
  ok(await photo.fetchPhotoUrl({}, 'cloud://x/y.jpg') === null, '没有云环境时返回 null');

  console.log('\n[3] 标注：部位名优先，坐标不对就不打点');
  const withLabel = format.markersView([
    { x: 50, y: 40, type: 'warn', label: '门襟扣子' },
    { x: 20, y: 60, type: 'good', label: '左袖口' }
  ]);
  ok(withLabel[0].label === '门襟扣子', '有部位名就在图上写部位名');
  ok(withLabel[1].label === '左袖口' && withLabel[1].cls === 'ok', '省力部位同样标出名字');

  const noLabel = format.markersView([
    { x: 50, y: 40, type: 'warn' },
    { x: 50, y: 60, type: 'warn' },
    { x: 30, y: 50, type: 'good' }
  ]);
  ok(noLabel.filter(m => m.cls === 'warn').map(m => m.label).join(',') === '1,2', '没有部位名时警示点按 1、2 编号');
  ok(noLabel[2].label === '', '正向点无部位名时不显示文字');

  const dirty = format.markersView([
    { x: 'abc', y: 40, type: 'warn', label: '领口' },
    { x: 50, type: 'good' },
    { x: 50, y: 60, type: 'warn', label: '下摆' },
    null
  ]);
  ok(dirty.length === 1 && dirty[0].label === '下摆', '坐标不是数字的点不打（宁可少标，不标错位置）');

  const clamped = format.markersView([{ x: 999, y: -20, type: 'warn', label: '边' }]);
  ok(clamped[0].left === '100%' && clamped[0].top === '0%', '越界坐标夹在图内，不会飘到图外');

  console.log('\n[4] 图注：没图、没定位、有定位，三句话要说清');
  ok(format.markerCaption([], true).indexOf('没能') >= 0, '没有标注时说清「没能指出位置」，不假装定位');
  ok(format.markerCaption([], false).indexOf('照片') >= 0, '照片没显示时说明是照片的事');
  ok(format.markerCaption([{ label: '门襟扣子' }], true).indexOf('部位') >= 0, '标了部位名就说「图上标的是下面提到的部位」');
  ok(format.markerCaption([{ label: '1' }], true).indexOf('数字') >= 0, '标的是数字就说数字与下面对应');

  console.log('\n[5] 结果页：真实结果展示原图');
  wx1 = makeWx();
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons', 'liftArm'], updatedAt: Date.now() };
  wx1._callResult = CLOUD_OK;
  wx1.cloud.callFunction = function () { return Promise.resolve({ result: CLOUD_OK }); };
  let { cfg, page } = loadResult(wx1);
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  ok(page.data.photoSrc === '', '取回之前不显示任何图');
  await flush();
  ok(page.data.photoSrc === TEMP_URL, '取回后显示用户那张照片');
  ok(page.data.markersView.length === 3, '照片显示出来后才画标注');
  ok(page.data.photoFailed === false, '取图成功不显示失败提示');

  console.log('\n[6] 取图失败：不回退成配套图，分析结论照旧');
  wx1 = makeWx({ tempUrl: null });
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons', 'liftArm'], updatedAt: Date.now() };
  wx1.cloud.callFunction = function () { return Promise.resolve({ result: CLOUD_OK }); };
  ({ cfg, page } = loadResult(wx1));
  cfg.onLoad.call(page, { fileID: 'cloud://x/y.jpg' });
  await page.loadAnalysis('cloud://x/y.jpg', false);
  await flush();
  ok(page.data.photoFailed === true, '取不回图就显示失败提示');
  ok(page.data.photoSrc.indexOf('garment-current') < 0, '失败时不拿配套图冒充用户那件衣服');
  ok(page.data.markersView.length === 0, '没有图就不画标注（标注不能飘在占位块上）');
  ok(page.data.analysis && page.data.analysis.score === CLOUD_OK.analysis.score, '图没了，分析结论仍然在');

  console.log('\n[7] 结果页：示例走配套图');
  wx1 = makeWx();
  wx1.cloud.callFunction = function () { throw new Error('示例不该调云函数'); };
  ({ cfg, page } = loadResult(wx1));
  cfg.onLoad.call(page, { example: '1' });
  await page.loadAnalysis('', true);
  await flush();
  ok(page.data.photoSrc.indexOf('garment-current') > 0, '示例显示配套图');
  ok(wx1._tempCalls.length === 0, '示例不去云存储取图');
  ok(page.data.markersView.length > 0 && page.data.markersView.every(m => m.label),
    '示例标注立刻画在配套图上，且写的是部位名');

  console.log('\n[8] 对比页：左栏是这次那件，右栏是示意');
  wx1 = makeWx();
  const profile = { who: '妈妈', difficulties: ['buttons', 'liftArm'] };
  wx1._storage[store.KEY] = Object.assign({ updatedAt: Date.now() }, profile);
  store.saveRecord(wx1, {
    analysis: fallback.build(profile), source: 'model',
    fileID: 'cloud://x/y.jpg', profile: profile
  });
  ({ cfg, page } = loadIdeal(wx1));
  cfg.onLoad.call(page);
  await flush();
  ok(page.data.imageCurrent === TEMP_URL, '对比页左栏显示这次拍的照片');
  ok(page.data.currentPhotoLabel.indexOf('这次') >= 0, '左栏标明这是这次拍的');

  wx1 = makeWx();
  wx1._storage[store.KEY] = Object.assign({ updatedAt: Date.now() }, profile);
  store.saveRecord(wx1, {
    analysis: fallback.build(profile), source: 'example', fileID: '', profile: profile
  });
  ({ cfg, page } = loadIdeal(wx1));
  cfg.onLoad.call(page);
  await flush();
  ok(page.data.imageCurrent.indexOf('garment-current') > 0, '示例记录 → 配套图');
  ok(wx1._tempCalls.length === 0, '示例记录不去取图');
  ok(page.data.currentPhotoLabel.indexOf('示例') >= 0, '左栏标明这是示例图');

  wx1 = makeWx({ tempUrl: null });
  wx1._storage[store.KEY] = Object.assign({ updatedAt: Date.now() }, profile);
  store.saveRecord(wx1, {
    analysis: fallback.build(profile), source: 'model',
    fileID: 'cloud://x/y.jpg', profile: profile
  });
  ({ cfg, page } = loadIdeal(wx1));
  cfg.onLoad.call(page);
  await flush();
  ok(page.data.imageCurrent.indexOf('garment-current') < 0, '对比页取图失败也不拿配套图顶上');
  ok(page.data.imageCurrent === '', '取不到就空着（界面给占位）');

  console.log('\n[9] 结构：百分比标注要落在图上');
  const wxml = read('pages/result/index.wxml');
  ok(/<image[^>]*photoSrc[^>]*mode="widthFix"/.test(wxml) || wxml.indexOf('mode="widthFix"') > 0,
    '原图用 widthFix（高度随图，百分比标注才对得上）');
  ok(wxml.indexOf('photo-missing') > 0, '有取不到图时的占位块');
  ok(wxml.indexOf('markerCaption') > 0, '图注随有没有标注变化');
  const wxss = read('pages/result/index.wxss');
  const wrapRule = /\.garment-wrap\s*\{([^}]*)\}/.exec(wxss);
  ok(wrapRule && !/padding/.test(wrapRule[1]), '图片容器不带内边距（有内边距百分比标注会整体偏移）');
  ok(wrapRule && /position:\s*relative/.test(wrapRule[1]), '图片容器是定位参照');
  ok(wxss.indexOf('.marker') > 0, '有标注样式');
  const idealWxml = read('pages/ideal/index.wxml');
  ok(idealWxml.indexOf('currentPhotoLabel') > 0, '对比页标明左栏图片是什么');
  ok(idealWxml.indexOf('示意图') > 0 || idealWxml.indexOf('示意') > 0, '理想款标为结构示意，不当成实物图');

  console.log('\n[10] 返回结构：标注带部位名');
  const checked = schema.validateAnalysis(Object.assign({}, fallback.build(profile), {
    markers: [{ x: 50, y: 50, type: 'warn', label: '门襟扣子' }]
  }));
  ok(checked.ok && checked.value.markers[0].label === '门襟扣子', '校验保留部位名');
  const noLabel2 = schema.validateAnalysis(Object.assign({}, fallback.build(profile), {
    markers: [{ x: 50, y: 50, type: 'warn' }]
  }));
  ok(noLabel2.ok && noLabel2.value.markers[0].label === '', '模型没给部位名时留空（前端改用编号）');
  const longLabel = schema.validateAnalysis(Object.assign({}, fallback.build(profile), {
    markers: [{ x: 50, y: 50, type: 'warn', label: '一个特别特别长的部位名字' }]
  }));
  ok(longLabel.ok && longLabel.value.markers[0].label.length <= 6, '部位名超长会被截断');

  const sampleMarkers = fallback.build(profile).markers;
  ok(sampleMarkers.length > 0 && sampleMarkers.every(m => typeof m.label === 'string' && m.label.length > 0),
    '示例标注每条都带部位名');
  ok(sampleMarkers.every(m => m.label.length <= 6), '示例部位名都在 6 字以内（圆形标注放得下）');

  console.log('\n[11] 回归');
  const { execSync } = require('child_process');
  const sync = execSync('node ' + path.join(ROOT, 'tests/check-sample-sync.js')).toString();
  ok(sync.includes('0 失败'), '示例数据与云函数副本保持同步');
  const skel = execSync('node ' + path.join(ROOT, 'tests/check-skeleton.js')).toString();
  ok(skel.includes('0 失败'), '骨架测试保持全绿');

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed > 0 ? 1 : 0);
}

main();
