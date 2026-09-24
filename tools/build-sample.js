/**
 * 生成云函数用的示例数据副本。
 *
 * 为什么必须生成而不是手抄：云函数上传时只打包自己那层目录，
 * 它 `require` 不到 `utils/`，所以示例数据物理上得在云函数里再放一份。
 * 而「两份」必然漂移 —— 以前就是各写各的，靠注释里一句
 * 「有意保持一致的判断口径」来约束，没有任何东西守着它。
 *
 * 做法沿用 `tools/export-prompt.js` 的先例：**源只有一份，另一份生出来**。
 * 用法：node tools/build-sample.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'utils/fallback-analysis.js');
const OUT = path.join(ROOT, 'cloudfunctions/analyze/lib/sample.js');

const HEADER = [
  '/**',
  ' * ⚠️ 本文件由 `node tools/build-sample.js` 从 utils/fallback-analysis.js 生成，',
  ' * **不要手改** —— 改了也会被下次生成覆盖，而且会让 tests/check-sample-sync.js 变红。',
  ' *',
  ' * 要改示例数据（分数、话术、分项）请改源文件 utils/fallback-analysis.js，',
  ' * 然后跑一次生成脚本。云函数 require 不到上级目录，所以这里必须有一份副本。',
  ' */',
  ''
].join('\n');

function render() {
  const src = fs.readFileSync(SRC, 'utf8');

  // 源文件末尾那行导出是给小程序用的，副本里换成云函数要的形状
  const body = src.replace(
    /module\.exports\s*=\s*\{[^}]*\};?\s*$/,
    ''
  ).replace(/\s+$/, '');

  const tail = [
    '',
    'module.exports = {',
    '  build: build,',
    '  normalizeProfile: normalizeProfile,',
    '  // 云函数侧的入口名；带上来源标记，界面靠它显示「示例数据」',
    '  sampleFor: function (profile) {',
    "    const out = build(profile);",
    "    out.source = 'fallback';",
    '    return out;',
    '  }',
    '};',
    ''
  ].join('\n');

  return HEADER + body + '\n' + tail;
}

module.exports = { render: render, SRC: SRC, OUT: OUT };

if (require.main === module) {
  const text = render();
  const before = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (before === text) {
    console.log('示例数据副本已是最新，无需改动：cloudfunctions/analyze/lib/sample.js');
  } else {
    fs.writeFileSync(OUT, text);
    console.log('已生成 cloudfunctions/analyze/lib/sample.js（源：utils/fallback-analysis.js）');
  }
}
