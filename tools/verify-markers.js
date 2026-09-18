// 校验示意图上的标注坐标是否真的压在衣服上。
//
// 为什么需要它：标注坐标是百分比，和 assets/garment-current.png 的取景绑死。
// 一旦改了 SVG 的 viewBox（或重画衣服），坐标口径就变了，标注会飘到空白处——
// 这个 bug 出现过一次，靠肉眼很难发现。此脚本用像素 alpha 直接验证。
//
// 用法：NODE_PATH=<managed workspace node_modules> node tools/verify-markers.js
//
// 注意：sharp 不在小程序依赖里，所以这个校验放在 tools/ 而不是 tests/，
// 避免 tests 套件依赖图像库（run-all.js 会自动收录 tests/check-*.js）。
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('未找到 sharp，请先安装：npm install sharp（在隔离的 node workspace 中）');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const fallback = require(path.join(ROOT, 'utils/fallback-analysis.js'));
const sample = require(path.join(ROOT, 'cloudfunctions/analyze/lib/sample.js'));

// 各坐标点对应的结构部位，方便失败时看懂是哪个点错了
const PART = {
  '41,16': '领口 / 门襟上端',
  '50,62': '纽扣排',
  '18,61': '左侧袖口'
};

const CASES = [
  { name: '扣扣子 + 抬手', difficulties: ['buttons', 'liftArm'] },
  { name: '只扣扣子',      difficulties: ['buttons'] },
  { name: '只抬手',        difficulties: ['liftArm'] },
  { name: '只弯腰',        difficulties: ['bend'] }
];

(async function main() {
  const file = path.join(ROOT, 'assets/garment-current.png');
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;

  function alphaAt(percentX, percentY) {
    const x = Math.round(percentX / 100 * W);
    const y = Math.round(percentY / 100 * H);
    return data[(y * W + x) * C + 3];
  }

  let missed = 0;
  let checked = 0;

  console.log('对照图：assets/garment-current.png (' + W + '×' + H + ')\n');

  CASES.forEach(function (item) {
    // 前端兜底数据与云函数示例数据必须给出同一组坐标，这里两边都比一遍
    const sources = [
      { label: '前端兜底', markers: fallback.build({ who: '妈妈', difficulties: item.difficulties }).markers },
      { label: '云函数示例', markers: sample.sampleFor({ who: '妈妈', difficulties: item.difficulties }).markers }
    ];

    sources.forEach(function (source) {
      source.markers.forEach(function (m) {
        checked++;
        const alpha = alphaAt(m.x, m.y);
        const on = alpha > 8;
        if (!on) missed++;
        const part = PART[m.x + ',' + m.y] || '（未登记的坐标）';
        console.log(
          '  ' + (on ? 'OK  ' : 'MISS') + '  ' + item.name.padEnd(12) +
          source.label.padEnd(10) + '(' + String(m.x).padStart(2) + '%,' + String(m.y).padStart(2) + '%)  ' +
          part.padEnd(16) + ' alpha=' + alpha
        );
      });
    });
    console.log('');
  });

  if (missed === 0) {
    console.log('全部 ' + checked + ' 个标注都压在衣服上');
    process.exit(0);
  }
  console.log('有 ' + missed + '/' + checked + ' 个标注落在空白处——请按 assets/*.svg 首行的 viewBox 重算坐标');
  process.exit(1);
})();
