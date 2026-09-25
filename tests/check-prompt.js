/**
 * 提示词的硬约束（T05 的一部分）。
 *
 * 提示词是纯文本，改了不会有任何编译错误，也不会被结构校验挡住 ——
 * 所以只能扫源码断言。这里守的是两条**实测结论**：
 *
 * 1. 不能强制「有正有负」：衣服本来就可能全是省力项或全是难点，
 *    硬凑一条会把没看见的东西说成看见了（T00 发现：模糊照片上照样编出
 *    「无束缚」「没有紧绷的松紧带」这类正面判断）。
 * 2. 不能假定衣服在画面里的固定范围：竖构图、偏心、斜置都不适用
 *    （T00 第二轮 s3/s4 就是这类，原来的 15%-85% 区间是错的）。
 *
 * 另加一条：看不清必须说出来（T00 第三轮实测：模糊遮挡版零声明）。
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

const prompt = require(path.join(ROOT, 'cloudfunctions/analyze/lib/prompt.js'));
const SYS = prompt.SYSTEM_PROMPT;

console.log('\n[1] 不再逼模型凑正负');

ok(SYS.indexOf('有正有负') === -1, '不再强制 findings「有正有负」');
ok(SYS.indexOf('不要全部报喜') === -1, '不再要求「不要全部报喜也不要全部报忧」');
ok(
  SYS.indexOf('如实') !== -1 || SYS.indexOf('有多少说多少') !== -1 || SYS.indexOf('没有就少写') !== -1,
  '改成「有多少说多少」的口径'
);

console.log('\n[2] 不再假定衣服占画面的固定范围');

ok(SYS.indexOf('15%-85%') === -1, '不再写死横向 15%-85%');
ok(SYS.indexOf('12%-88%') === -1, '不再写死纵向 12%-88%');
ok(
  SYS.indexOf('实际看到') !== -1 || SYS.indexOf('你看到的') !== -1,
  '改成「按实际看到的位置」落点'
);

console.log('\n[3] 看不清必须说出来');

ok(SYS.indexOf('看不清') !== -1, '提示词要求说明看不清的部位');
ok(
  SYS.indexOf('不要') !== -1 && SYS.indexOf('下结论') !== -1,
  '明确「看不清就不要下结论」'
);
ok(
  SYS.indexOf('markers') !== -1 && SYS.indexOf('看不清') !== -1,
  '坐标只给看得清的部位'
);

console.log('\n[4] 原有的硬要求没被改掉');

ok(SYS.indexOf('JSON') !== -1, '仍然要求只输出 JSON');
ok(SYS.indexOf('简体中文') !== -1, '仍然要求简体中文');
ok(SYS.indexOf('标签化') !== -1 || SYS.indexOf('中性描述') !== -1, '仍然禁止标签化/医学化称谓');
ok(SYS.indexOf('questions') !== -1, '仍然要求把不确定的事放进 questions');

console.log('\n[5] 消息组装');

{
  const withImg = prompt.buildMessages({ who: '妈妈', difficulties: ['buttons'] }, true);
  const text = JSON.stringify(withImg);
  ok(text.indexOf(prompt.IMAGE_PLACEHOLDER) !== -1, '带图时消息里有图片占位');
  const attached = prompt.attachImage(withImg, 'data:image/jpeg;base64,REAL');
  ok(JSON.stringify(attached).indexOf('REAL') !== -1, 'attachImage 把占位换成真实图片');
  ok(JSON.stringify(attached).indexOf(prompt.IMAGE_PLACEHOLDER) === -1, '占位被替换掉，没有残留');

  const noImg = prompt.buildMessages({ who: '妈妈', difficulties: [] }, false);
  ok(JSON.stringify(noImg).indexOf('image_url') === -1, '无图时不带 image_url');
  ok(JSON.stringify(noImg).indexOf('妈妈') !== -1, '资料里的称呼进提示词');
  ok(JSON.stringify(noImg).indexOf('看不清') !== -1, '用户消息里也要求说明看不清');
}

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed > 0 ? 1 : 0);
