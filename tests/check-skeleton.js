const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

function readJSON(p) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
}

function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

console.log('\n[1] 基础文件');
ok(exists('project.config.json'), 'project.config.json 存在');
ok(exists('app.json'), 'app.json 存在');
ok(exists('app.js'), 'app.js 存在');
ok(exists('app.wxss'), 'app.wxss 存在');
ok(exists('sitemap.json'), 'sitemap.json 存在');
ok(exists('README.md'), 'README.md 存在');

console.log('\n[2] app.json 结构');
const appJson = readJSON('app.json');
ok(Array.isArray(appJson.pages) && appJson.pages.length === 5, '注册 5 个页面');
const expected = ['pages/profile/index', 'pages/add/index', 'pages/result/index', 'pages/confirm/index', 'pages/ideal/index'];
expected.forEach(p => ok(appJson.pages.includes(p), '包含 ' + p));
ok(appJson.pages[0] === 'pages/profile/index', '首页为 profile');
ok(appJson.window && appJson.window.navigationBarTitleText === '衣适', '窗口标题为「衣适」');
ok(appJson.window && appJson.window.backgroundColor === '#FFFFFF', '窗口背景纯白');
ok(appJson.style === 'v2', '使用 v2 样式');
ok(appJson.sitemapLocation === 'sitemap.json', '指向 sitemap');

console.log('\n[3] 页面四件套完整性');
appJson.pages.forEach(p => {
  ['.wxml', '.wxss', '.js', '.json'].forEach(ext => {
    ok(exists(p + ext), p + ext + ' 存在');
  });
  const cfg = readJSON(p + '.json');
  ok(cfg.usingComponents !== undefined, p + ' 的 json 含 usingComponents');
  ok(cfg.navigationBarTitleText !== undefined, p + ' 的 json 含导航标题');
});

console.log('\n[4] 页面可运行性（无云函数依赖的静态检查）');
appJson.pages.forEach(p => {
  const js = fs.readFileSync(path.join(ROOT, p + '.js'), 'utf8');
  ok(/Page\(\{/.test(js), p + ' 有 Page() 调用');
});

console.log('\n[5] project.config.json');
const pc = readJSON('project.config.json');
ok(pc.appid !== undefined, 'appid 字段存在（占位或已填）');
ok(pc.compileType === 'miniprogram', 'compileType 为 miniprogram');
ok(pc.cloudfunctionRoot === 'cloudfunctions/', '指定云函数根目录');
ok(pc.libVersion !== undefined, '指定基础库版本');

console.log('\n[6] 设计 token（app.wxss）');
const wxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
const tokens = ['--ink', '--ink-2', '--ink-3', '--line', '--soft', '--good', '--warn'];
tokens.forEach(t => ok(wxss.includes(t), '定义 ' + t));
ok(wxss.includes('page {') || wxss.includes('page{'), '设置 page 根样式');

console.log('\n[7] 文案合规（无标签化词汇）');
const banned = ['残障', '残疾', '病人', '疾病'];
const files = [];
(function walk(dir) {
  fs.readdirSync(dir).forEach(f => {
    const fp = path.join(dir, f);
    if (fs.statSync(fp).isDirectory()) {
      if (!['node_modules', 'cloudfunctions', 'tests'].includes(f)) walk(fp);
    } else if (/\.(wxml|wxss|js|json)$/.test(f)) files.push(fp);
  });
})(ROOT);
files.forEach(fp => {
  const txt = fs.readFileSync(fp, 'utf8');
  const hit = banned.filter(w => txt.includes(w));
  ok(hit.length === 0, path.relative(ROOT, fp) + ' 无禁用词' + (hit.length ? '（命中: ' + hit.join(',') + '）' : ''));
});

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
