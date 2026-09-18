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

console.log('\n[1] utils/store.js 纯逻辑');
const store = require(path.join(ROOT, 'utils/store.js'));

const DIFFS = ['buttons', 'liftArm', 'bend'];
DIFFS.forEach(d => ok(store.DIFFICULTIES.includes(d), '难点枚举含 ' + d));

const def = store.defaultProfile();
ok(def.who === '妈妈', '默认对象为妈妈');
ok(Array.isArray(def.difficulties) && def.difficulties.length === 0, '默认难点为空数组');

ok(store.isValidProfile({ who: '妈妈', difficulties: ['buttons'] }) === true, '合法画像通过校验');
ok(store.isValidProfile({ who: '妈妈', difficulties: [] }) === false, '空难点不通过校验');
ok(store.isValidProfile({ who: '妈妈', difficulties: ['不存在'] }) === false, '未知难点不通过校验');
ok(store.isValidProfile(null) === false, 'null 不通过校验');

ok(JSON.stringify(store.normalizeProfile({ who: '爸爸', difficulties: ['bend', 'bend', '坏值'] }))
  === JSON.stringify({ who: '爸爸', difficulties: ['bend'] }), 'normalize 去重 + 剔除非法值');
ok(store.normalizeProfile('garbage') === null, '非对象输入返回 null');

console.log('\n[2] profile 页面逻辑（wx/Page mock 环境）');
global.wx = {
  _storage: {},
  setStorageSync(k, v) { this._storage[k] = v; },
  getStorageSync(k) { return this._storage[k]; },
  navigateTo(target) { this._lastNav = target; },
  showToast(t) { this._lastToast = t; }
};
let pageConfig = null;
global.Page = cfg => { pageConfig = cfg; };

require(path.join(ROOT, 'pages/profile/index.js'));
ok(pageConfig !== null, 'Page() 被调用');

const page = { data: JSON.parse(JSON.stringify(pageConfig.data)) };
page.setData = function (patch) { Object.assign(this.data, patch); };

pageConfig.onLoad.call(page);
ok(page.data.who === '妈妈', 'onLoad 后默认对象为妈妈');
ok(page.data.options.length === 3, '三个难点选项');
ok(page.data.options[0].key === 'buttons', '第一项 key 为 buttons');

const opt = page.data.options.find(o => o.key === 'bend');
ok(opt.selected === false, 'bend 初始未选中');

pageConfig.onChange.call(page, pick('bend'));
ok(page.data.options.find(o => o.key === 'bend').selected === true, '勾选后 bend 选中');
pageConfig.onChange.call(page, pick());
ok(page.data.options.find(o => o.key === 'bend').selected === false, '取消勾选后取消选中');

console.log('\n[3] 下一步守卫与存储');
wx._storage = {};
pageConfig.onChange.call(page, pick('buttons', 'liftArm'));
pageConfig.onNext.call(page);
const saved = wx._storage[store.KEY];
ok(saved && saved.difficulties.length === 2, '选择 2 项后正确入库');
ok(saved.difficulties.includes('buttons') && saved.difficulties.includes('liftArm'), '入库内容正确');
ok(saved.who === '妈妈', '对象名一并入库');
ok(!!saved.updatedAt, '记录更新时间');
ok(wx._lastNav && wx._lastNav.url === '/pages/add/index', '跳转 add 页');

wx._lastNav = null;
pageConfig.onChange.call(page, pick());
pageConfig.onNext.call(page);
ok(wx._lastNav === null, '全部取消选择后点下一步不跳转');
ok(wx._lastToast && wx._lastToast.title !== undefined, '未选择时弹出提示');

console.log('\n[4] 二次进入恢复（storage 回读）');
wx._storage[store.KEY] = { who: '爸爸', difficulties: ['bend'], updatedAt: Date.now() };
const page2 = { data: JSON.parse(JSON.stringify(pageConfig.data)) };
page2.setData = function (patch) { Object.assign(this.data, patch); };
pageConfig.onLoad.call(page2);
ok(page2.data.who === '爸爸', '恢复对象名为爸爸');
ok(page2.data.options.find(o => o.key === 'bend').selected === true, '恢复 bend 为选中');
ok(page2.data.options.find(o => o.key === 'buttons').selected === false, '未选过的 buttons 保持未选中');

console.log('\n[5] WXML 结构（复用原生组件）');
const wxml = read('pages/profile/index.wxml');
ok(wxml.includes('wx:for') && wxml.includes('options'), '选项列表用 wx:for 渲染');
ok(wxml.includes('<checkbox-group'), '多选交给原生 checkbox-group');
ok(wxml.includes('<checkbox ') && wxml.includes('value="{{item.key}}"'), '用原生 checkbox，value 绑 key');
ok(wxml.includes('bindchange="onChange"'), '监听原生 change 事件');
ok(wxml.includes('<label'), 'label 包裹，整卡可点（热区由原生提供）');
ok(!wxml.includes('data-key'), '不再靠 data-key 手工取值');
ok(!wxml.includes('onToggle'), '不再手写切换逻辑');
ok(!wxml.includes('class="ck"'), '不再自画勾选框');
ok(wxml.includes('bindtap="onNext"'), '下一步绑定 onNext');
ok(wxml.includes('who-bar') || wxml.includes('who'), '含对象行');
ok(wxml.includes('dots'), '含进度圆点');
ok(wxml.includes('btn-main'), '含主按钮');
ok(wxml.includes('foot-note'), '含底部说明');

console.log('\n[6] 文案合规');
const banned = ['残障', '残疾', '病人', '疾病'];
['pages/profile/index.wxml', 'pages/profile/index.js', 'utils/store.js'].forEach(f => {
  const hit = banned.filter(w => read(f).includes(w));
  ok(hit.length === 0, f + ' 无禁用词' + (hit.length ? '（命中: ' + hit.join(',') + '）' : ''));
});

console.log('\n[7] 骨架回归');
const { execSync } = require('child_process');
const r = execSync('node ' + path.join(ROOT, 'tests/check-skeleton.js')).toString();
ok(r.includes('0 失败'), '骨架测试保持全绿');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
