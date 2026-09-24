/**
 * 缓存键要包含所有会影响输出的资料。
 *
 * 原来的键只有 `fileID + 动作难点`，**不含称呼**。
 * 而话术里全是「给妈妈穿」这类称呼 —— 换一个人再分析同一张照片，
 * 会命中旧缓存，拿到写着上一个称呼的话术（TODO 里 T03 的验收项）。
 *
 * 缓存命中与否是看不见的东西，所以只能靠脚本逐条喂。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const cacheKey = require(path.join(ROOT, 'cloudfunctions/analyze/lib/cache-key.js'));

const A = { who: '妈妈', difficulties: ['buttons', 'liftArm'] };
const A_SAME_ORDER = { who: '妈妈', difficulties: ['liftArm', 'buttons'] };
const B_WHO = { who: '爸爸', difficulties: ['buttons', 'liftArm'] };
const B_DIFF = { who: '妈妈', difficulties: ['buttons'] };

console.log('\n[1] 同样的输入同样的键');
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) === cacheKey.buildCacheId('cloud://a/b.jpg', A),
  '两次调用结果一致'
);
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) === cacheKey.buildCacheId('cloud://a/b.jpg', A_SAME_ORDER),
  '难点顺序不同不影响键（内部已排序）'
);

console.log('\n[2] 影响输出的资料变了，键要跟着变');
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) !== cacheKey.buildCacheId('cloud://a/b.jpg', B_WHO),
  '换称呼 → 不命中旧缓存（话术里的称呼会变）'
);
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) !== cacheKey.buildCacheId('cloud://a/b.jpg', B_DIFF),
  '换动作难点 → 不命中旧缓存'
);
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) !== cacheKey.buildCacheId('cloud://a/c.jpg', A),
  '换照片 → 不命中旧缓存'
);

console.log('\n[3] 边界');
const nullKey = cacheKey.buildCacheId('', null);
ok(typeof nullKey === 'string' && nullKey.length > 0, '资料为空也给出合法键（' + nullKey + '）');
ok(
  cacheKey.buildCacheId('', null) === cacheKey.buildCacheId('', undefined),
  'null 与 undefined 得到同一个键'
);
ok(/^[A-Za-z]/.test(nullKey), '键以字母开头（云数据库 doc id 的要求）');
ok(
  cacheKey.buildCacheId('cloud://a/b.jpg', A) === cacheKey.buildCacheId('cloud://a/b.jpg', A),
  '键可重复计算，不依赖随机数或时间'
);

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
