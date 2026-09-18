// 把云函数里的提示词导出成一份可读、可复制的 Markdown。
//
// 为什么要用脚本导出而不是手抄一份：提示词是产品最核心的资产之一，
// 手抄的那份迟早会和 cloudfunctions/analyze/lib/prompt.js 里的真身对不上。
// 每次改完提示词，跑一次这个脚本即可。
//
// 用法：node tools/export-prompt.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const prompt = require(path.join(ROOT, 'cloudfunctions/analyze/lib/prompt.js'));

const TARGET = path.join(ROOT, 'docs/prompt-for-model.md');

// 用两个典型画像生成样例消息，覆盖「极端」和「温和」两种情况
const SAMPLES = [
  { label: '只勾了「扣扣子」', profile: { who: '妈妈', difficulties: ['buttons'] } },
  { label: '三项都勾', profile: { who: '外婆', difficulties: ['buttons', 'liftArm', 'bend'] } }
];

function fence(text, lang) {
  return '```' + (lang || '') + '\n' + text + '\n```';
}

function renderUserMessage(messages) {
  const user = messages[messages.length - 1];
  if (typeof user.content === 'string') return user.content;
  return user.content
    .filter(function (part) { return part.type === 'text'; })
    .map(function (part) { return part.text; })
    .join('\n');
}

function main() {
  const lines = [];

  lines.push('# 提示词（由脚本导出，请勿手改）');
  lines.push('');
  lines.push('这份文件由 `node tools/export-prompt.js` 从 `cloudfunctions/analyze/lib/prompt.js` 生成。');
  lines.push('要改提示词，请改那个源文件，然后重新跑一次脚本——**不要直接改这份**，否则下次导出就被覆盖了。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. 系统提示词（system）');
  lines.push('');
  lines.push('直接整段复制到任何大模型里就能用（把模型的接口切成 OpenAI 格式，system 填这里，user 填第 2 节）。');
  lines.push('');
  lines.push(fence(prompt.SYSTEM_PROMPT));
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 2. 用户消息（user）');
  lines.push('');
  lines.push('这一段是程序拼出来的，两部分会被填进去：**穿衣对象**和**动作难点**。');
  lines.push('');

  SAMPLES.forEach(function (item) {
    lines.push('### ' + item.label);
    lines.push('');
    lines.push(fence(renderUserMessage(prompt.buildMessages(item.profile, false))));
    lines.push('');
  });

  lines.push('### 动作难点的固定说法');
  lines.push('');
  lines.push('界面上问的是「哪些动作费劲」，传给模型时会被翻译成具体的动作描述：');
  lines.push('');
  lines.push('| 界面选项 | 传给模型的文字 |');
  lines.push('|---|---|');
  Object.keys(prompt.DIFFICULTY_TEXT).forEach(function (key) {
    lines.push('| `' + key + '` | ' + prompt.DIFFICULTY_TEXT[key] + ' |');
  });
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 3. 照片怎么传');
  lines.push('');
  lines.push('多模态消息里，图片放在 user 的 content 数组里，和文字并列：');
  lines.push('');
  lines.push(fence([
    '{',
    '  "role": "user",',
    '  "content": [',
    '    { "type": "text", "text": "（第 2 节那段文字）" },',
    '    { "type": "text", "text": "照片见下（这件衣服）：" },',
    '    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,...." } }',
    '  ]',
    '}'
  ].join('\n'), 'json'));
  lines.push('');
  lines.push('注意：必须选**带视觉能力**的模型，纯文本模型看不到照片。');
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('## 4. 自己试一遍（不用装小程序）');
  lines.push('');
  lines.push('想单独调提示词，不必每次都部署云函数。随便找个能贴长文本的大模型网页版：');
  lines.push('');
  lines.push('1. 把第 1 节整段贴进「系统提示词」或对话开头');
  lines.push('2. 把第 2 节任意一段贴进去');
  lines.push('3. 再附一张衣服照片');
  lines.push('4. 看它返回的 JSON 里 `dims` 四个分数、`findings`、`markers` 对不对');
  lines.push('');
  lines.push('几个常见毛病和对应改法：');
  lines.push('');
  lines.push('| 毛病 | 说明提示词该怎么改 |');
  lines.push('|---|---|');
  lines.push('| 返回里带 ```json 代码块 | 它没看清「不要输出 Markdown 代码块」，把这条提到最前面 |');
  lines.push('| 分数全给 80 分以上 | 加一句「分数要有区分度，结构确实有障碍时不要给高分」 |');
  lines.push('| markers 飘到画面外 | 检查「15%-85% / 12%-88%」那段有没有被截断 |');
  lines.push('| findings 全是好话 | 重申「要有正有负，不要全部报喜」 |');
  lines.push('| 用了医学词 | 重申第 4 条，用「动作不太方便」这类中性说法 |');
  lines.push('');

  fs.writeFileSync(TARGET, lines.join('\n'), 'utf8');
  console.log('已导出 ' + path.relative(ROOT, TARGET) + '（' + lines.length + ' 行）');
}

main();
