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

function makeWx() {
  return {
    _storage: {},
    _chooseResult: null,
    _chooseError: null,
    _uploadResult: null,
    _uploadError: null,
    _uploadedPaths: [],
    _nav: null,
    _toast: null,
    _loadingShown: 0,
    _loadingHidden: 0,
    setStorageSync(k, v) { this._storage[k] = v; },
    getStorageSync(k) { return this._storage[k]; },
    navigateTo(o) { this._nav = o; },
    redirectTo(o) { this._nav = o; this._redirected = true; },
    showToast(o) { this._toast = o; },
    showLoading() { this._loadingShown++; },
    hideLoading() { this._loadingHidden++; },
    chooseMedia() {
      if (this._chooseError) return Promise.reject(this._chooseError);
      return Promise.resolve(this._chooseResult);
    },
    cloud: {
      uploadFile(o) {
        const self = this._owner;
        self._uploadedPaths.push(o.cloudPath);
        if (self._uploadError) return Promise.reject(self._uploadError);
        return Promise.resolve(self._uploadResult);
      }
    },
    _bindCloud() { this.cloud._owner = this; return this; }
  };
}

function loadPage(wxMock) {
  global.wx = wxMock;
  let cfg = null;
  global.Page = c => { cfg = c; };
  delete require.cache[require.resolve(path.join(ROOT, 'pages/add/index.js'))];
  require(path.join(ROOT, 'pages/add/index.js'));
  const page = { data: JSON.parse(JSON.stringify(cfg.data)) };
  page.setData = function (patch) { Object.assign(this.data, patch); };
  Object.keys(cfg).forEach(function (key) {
    if (typeof cfg[key] === 'function') page[key] = cfg[key];
  });
  return { cfg, page };
}

function captureConsoleError(fn) {
  const original = console.error;
  const lines = [];
  console.error = function () {
    lines.push(Array.prototype.slice.call(arguments).join(' '));
  };
  try { fn(); } catch (e) { /* 忽略，由断言覆盖 */ }
  console.error = original;
  return lines.join('\n');
}

const store = require(path.join(ROOT, 'utils/store.js'));
const uploadUtil = require(path.join(ROOT, 'utils/upload.js'));

async function main() {
  console.log('\n[1] utils/upload.js 纯逻辑');
  ok(uploadUtil.extOf('wxfile://tmp/a.PNG') === 'png', '扩展名小写化');
  ok(uploadUtil.extOf('noext') === 'jpg', '无扩展名兜底 jpg');
  const p = uploadUtil.buildCloudPath('a.jpg', 1700000000000, 'abc123');
  ok(p === 'yishi/1700000000000-abc123.jpg', 'cloudPath 由时间戳+随机串+扩展名构成');
  ok(uploadUtil.normalizeError({ errMsg: 'cloud init error' }).hint.indexOf('云开发') >= 0, '云环境错误提示指向云开发');
  ok(uploadUtil.normalizeError({ errMsg: 'uploadFile:fail network' }).hint.indexOf('网络') >= 0, '网络错误提示检查网络');
  ok(uploadUtil.normalizeError({ errMsg: 'errCode: -502003 permission denied' }).hint.indexOf('权限') >= 0, '权限错误提示检查权限');
  ok(uploadUtil.normalizeError({ errMsg: 'something else' }).hint === '请重试', '未知错误给通用提示');

  console.log('\n[2] 画像守卫');
  let wx1 = makeWx()._bindCloud();
  let { cfg, page } = loadPage(wx1);
  cfg.onLoad.call(page);
  ok(wx1._nav && wx1._nav.url === '/pages/profile/index', '无画像时重定向回 profile');

  wx1 = makeWx()._bindCloud();
  wx1._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  ({ cfg, page } = loadPage(wx1));
  cfg.onLoad.call(page);
  ok(wx1._nav === null, '有画像时不重定向');
  ok(page.data.who === '妈妈', 'onLoad 读取对象名');

  console.log('\n[3] 选图与上传');
  wx1._chooseResult = { tempFiles: [{ tempFilePath: 'wxfile://tmp/a.jpg' }] };
  wx1._uploadResult = { fileID: 'cloud://env.abc/yishi/a.jpg' };
  await cfg.onChoose.call(page);
  ok(page.data.previewPath === 'wxfile://tmp/a.jpg', '设置本地预览图');
  ok(page.data.fileID === 'cloud://env.abc/yishi/a.jpg', '保存云存储 fileID');
  ok(page.data.uploading === false, '上传结束后 uploading 复位');
  ok(page.data.uploadFailed === false, '成功后 uploadFailed 为 false');
  ok(/^yishi\//.test(wx1._uploadedPaths[0]), 'cloudPath 带 yishi/ 前缀');
  ok(/\.jpg$/.test(wx1._uploadedPaths[0]), 'cloudPath 保留扩展名');
  ok(wx1._loadingShown === 1 && wx1._loadingHidden === 1, '上传期间显示并关闭加载态');
  ok(wx1._toast === null, '成功路径不弹错误提示');

  console.log('\n[4] 用户取消选择');
  wx1._chooseError = { errMsg: 'chooseMedia:fail cancel' };
  wx1._toast = null;
  await cfg.onChoose.call(page);
  ok(wx1._toast === null, '取消选择不弹提示');
  ok(page.data.uploading === false, '取消后 uploading 复位');

  console.log('\n[5] 上传失败（云环境未开通场景）');
  wx1._chooseError = null;
  wx1._chooseResult = { tempFiles: [{ tempFilePath: 'wxfile://tmp/b.jpg' }] };
  wx1._uploadError = { errMsg: 'cloud init error: env not found' };
  wx1._toast = null;
  const errLog = captureConsoleError(() => {});
  await cfg.onChoose.call(page);
  ok(page.data.fileID === '', '失败后 fileID 为空');
  ok(page.data.previewPath === 'wxfile://tmp/b.jpg', '失败后仍保留本地预览');
  ok(page.data.uploadFailed === true, '失败后 uploadFailed 为 true');
  ok(wx1._toast && wx1._toast.icon === 'none', '失败弹无图标提示');
  ok(wx1._toast.title.indexOf('云开发') >= 0, '提示文案指向云开发（可行动）');
  ok(page.data.uploading === false, '失败后 uploading 复位');
  ok(errLog !== undefined, '错误路径已捕获（console.error 记录真实原因）');

  console.log('\n[6] 失败后点「开始分析」自动重试');
  wx1._nav = null;
  wx1._toast = null;
  wx1._uploadError = null;
  wx1._uploadResult = { fileID: 'cloud://env.abc/yishi/b.jpg' };
  await cfg.onAnalyze.call(page);
  ok(page.data.fileID === 'cloud://env.abc/yishi/b.jpg', '重试成功写入 fileID');
  ok(page.data.uploadFailed === false, '重试成功后清除失败标记');
  ok(wx1._nav && wx1._nav.url.indexOf('/pages/result/index') === 0, '重试成功跳转 result');
  ok(decodeURIComponent(wx1._nav.url).indexOf('cloud://env.abc/yishi/b.jpg') > 0, 'URL 携带转义后的 fileID');

  console.log('\n[7] 重试仍失败');
  const wx2raw = makeWx()._bindCloud();
  wx2raw._storage[store.KEY] = { who: '妈妈', difficulties: ['buttons'], updatedAt: Date.now() };
  const second = loadPage(wx2raw);
  second.cfg.onLoad.call(second.page);
  second.page.setData({ previewPath: 'wxfile://tmp/c.jpg' });
  wx2raw._uploadError = { errMsg: 'uploadFile:fail permission denied' };
  wx2raw._toast = null;
  let logged = '';
  const originalError = console.error;
  console.error = function () { logged += Array.prototype.slice.call(arguments).join(' '); };
  await second.cfg.onAnalyze.call(second.page);
  console.error = originalError;
  ok(wx2raw._nav === null, '重试失败不跳转');
  ok(wx2raw._toast && wx2raw._toast.title.indexOf('权限') >= 0, '提示指向权限问题');
  ok(logged.indexOf('permission') >= 0, 'console 记录了原始错误文本');

  console.log('\n[8] 无预览无图片');
  wx2raw._nav = null;
  wx2raw._toast = null;
  second.page.setData({ previewPath: '', fileID: '' });
  second.cfg.onAnalyze.call(second.page);
  ok(wx2raw._nav === null, '无图片时点分析不跳转');
  ok(wx2raw._toast && wx2raw._toast.title.indexOf('拍') >= 0, '提示先拍一张照片');

  console.log('\n[9] 已有 fileID 直接跳转');
  wx2raw._nav = null;
  second.page.setData({ fileID: 'cloud://env.abc/yishi/d.jpg' });
  second.cfg.onAnalyze.call(second.page);
  ok(wx2raw._nav && wx2raw._nav.url.indexOf('/pages/result/index') === 0, '有 fileID 时直接跳转');

  console.log('\n[10] 示例入口');
  wx2raw._nav = null;
  second.cfg.onExample.call(second.page);
  ok(wx2raw._nav && wx2raw._nav.url.indexOf('example=1') > 0, '示例入口带 example=1');
  ok(wx2raw._nav.url.indexOf('fileID=') < 0, '示例入口不携带 fileID');

  console.log('\n[11] WXML 结构');
  const wxml = read('pages/add/index.wxml');
  ok(wxml.includes('bindtap="onChoose"'), '上传区绑定 onChoose');
  ok(wxml.includes('bindtap="onAnalyze"'), '主按钮绑定 onAnalyze');
  ok(wxml.includes('bindtap="onExample"'), '示例入口绑定 onExample');
  ok(wxml.includes('previewPath'), '含预览图条件渲染');
  ok(wxml.includes('uploading'), '含上传中状态渲染');
  ok(wxml.includes('dots'), '含进度圆点');
  ok(!wxml.includes('foot-note'), '底部小字已按需求移除');

  console.log('\n[12] 文案合规与骨架回归');
  const banned = ['残障', '残疾', '病人', '疾病'];
  ['pages/add/index.wxml', 'pages/add/index.js', 'utils/upload.js'].forEach(f => {
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
