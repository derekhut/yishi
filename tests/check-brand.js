/**
 * 产品名的一致性。
 *
 * 产品名在全项目**只允许出现两处**：`utils/brand.js`（JS 侧唯一来源）和
 * `app.json`（纯 JSON，import 不进来，只能硬编码）。多一处就是漏改的隐患 ——
 * 界面上两个名字同时存在，演示时一眼就被看见。
 *
 * 这里直接扫全项目，比人眼可靠：本项目 2026-09 由「衣适」改名为「穿的顺」，
 * 改名时只改了 3 处，旧名残留在 README、sitemap、三篇 docs 和两处 console 前缀里，
 * 其中 `docs/rebuild-from-scratch.md` 的验收条目还写着「标题『衣适』」。
 *
 * 规则：
 *   1. 新名在代码/配置里只准出现在 brand.js 与 app.json
 *   2. 旧名在项目里一个字都不准留（含文档 —— 文档里留旧名，读者会照着做）
 *   3. 页面级 .json 不许自己盖标题，统一继承 app.json
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

const CODE_EXT = ['.js', '.json', '.wxml', '.wxss', '.wxs'];
const DOC_EXT = ['.md'];
const SKIP_DIR = ['node_modules', '.git', '.local', '.workbuddy', 'assets'];

/** 新名只允许出现的两个文件；app.json 是唯一允许重复的地方 */
const ALLOWED = ['utils/brand.js', 'app.json'];
/** 扫描器自己跳过：它的注释里必然提到这个名字 */
const SELF = 'tests/check-brand.js';

function walk(dir, out) {
  fs.readdirSync(dir).forEach(function (name) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) {
      if (SKIP_DIR.indexOf(name) !== -1) return;
      walk(full, out);
      return;
    }
    out.push(rel);
  });
  return out;
}

const allFiles = walk(ROOT, []);
const codeFiles = allFiles.filter(function (rel) {
  return CODE_EXT.indexOf(path.extname(rel)) !== -1;
});
const docFiles = allFiles.filter(function (rel) {
  return DOC_EXT.indexOf(path.extname(rel)) !== -1;
});

console.log('\n[1] 唯一来源');
ok(fs.existsSync(path.join(ROOT, 'utils/brand.js')), 'utils/brand.js 存在');
let brand = null;
try {
  brand = require('../utils/brand.js');
} catch (err) {
  ok(false, 'utils/brand.js 可被 require（' + err.message + '）');
}
if (brand) {
  ok(!!brand.APP_NAME, 'APP_NAME 非空（实际 ' + JSON.stringify(brand.APP_NAME) + '）');
  ok(brand.APP_NAME.length <= 10, 'APP_NAME 不超过 10 个字');
  ok(
    !brand.OLD_NAMES || brand.OLD_NAMES.indexOf(brand.APP_NAME) === -1,
    'APP_NAME 不在旧名列表里'
  );
}
ok(codeFiles.length > 0, '扫到了项目文件（' + codeFiles.length + ' 个）');

console.log('\n[2] app.json 跟着走');
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
if (brand) {
  ok(
    appJson.window && appJson.window.navigationBarTitleText === brand.APP_NAME,
    'app.json 标题与 APP_NAME 一致（实际 ' +
      JSON.stringify(appJson.window && appJson.window.navigationBarTitleText) + '）'
  );
}

console.log('\n[3] 新名只准两处');
if (brand) {
  const hits = [];
  codeFiles.forEach(function (rel) {
    if (ALLOWED.indexOf(rel) !== -1) return;
    if (rel === SELF) return;
    if (fs.readFileSync(path.join(ROOT, rel), 'utf8').indexOf(brand.APP_NAME) !== -1) {
      hits.push(rel);
    }
  });
  ok(hits.length === 0, '代码/配置里没有第三处产品名' + (hits.length ? '（命中: ' + hits.join(', ') + '）' : ''));
}

console.log('\n[4] 页面标题不许重复产品名');
// 页面标题写着「添加衣服」「分析结果」这类功能名是有用的 —— 老人要看得出自己在哪一步。
// 要禁的是页面标题里又写一遍产品名：那会和 app.json 的全局标题重复，改名时必漏。
const pageHits = [];
allFiles.forEach(function (rel) {
  if (!/^pages\/.*\/index\.json$/.test(rel)) return;
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const title = cfg.navigationBarTitleText;
  if (typeof title !== 'string') return;
  if (brand && (title === brand.APP_NAME || title.indexOf(brand.APP_NAME) !== -1)) {
    pageHits.push(rel + '（' + title + '）');
  }
});
ok(
  pageHits.length === 0,
  '页面标题不写产品名（功能名可以）' + (pageHits.length ? '（命中: ' + pageHits.join(', ') + '）' : '')
);

console.log('\n[5] 旧名清零（含文档）');
if (brand && Array.isArray(brand.OLD_NAMES)) {
  const oldHits = [];
  allFiles.forEach(function (rel) {
    if (rel === SELF) return;
    // brand.js 是旧名清单的定义处，它自己必然含旧名
    if (rel === 'utils/brand.js') return;
    let text = '';
    try {
      text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    } catch (err) {
      return;
    }
    brand.OLD_NAMES.forEach(function (old) {
      if (text.indexOf(old) !== -1) oldHits.push(rel + '（' + old + '）');
    });
  });
  ok(
    oldHits.length === 0,
    '全项目没有旧名残留' + (oldHits.length ? '（命中: ' + oldHits.join(', ') + '）' : '')
  );
  ok(docFiles.length > 0, '文档也纳入扫描（' + docFiles.length + ' 篇）');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
