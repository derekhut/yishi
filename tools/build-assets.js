// 把 assets/ 下的款式图 SVG 光栅化为 PNG（小程序 <image> 对本地 SVG 支持不稳定，PNG 更可靠）
// 用法：NODE_PATH=<managed workspace node_modules> node tools/build-assets.js
//
// 关于取景：SVG 的 viewBox 已经收成 196×196 的正方形，紧贴衣服轮廓（见 assets/*.svg 首行）。
// 两张图共用同一取景，保证并排对比时比例一致。
// 输出保留透明背景，这样衣服可以叠在任意底色上（结果页白底、理想页浅灰底都成立）。
// 注意：改动 viewBox 会让图上标注的百分比坐标整体位移，必须同步重算
// sample.js 与 utils/fallback-analysis.js 里的 markers。
const fs = require('fs');
const path = require('path');
let sharp;
try {
  sharp = require('sharp');
} catch (err) {
  console.error('未找到 sharp，请先安装：npm install sharp（在隔离的 node workspace 中）');
  process.exit(1);
}

const ASSETS = path.join(__dirname, '..', 'assets');
const SCALE = 3;
const TARGETS = ['garment-current', 'garment-ideal'];

(async function main() {
  for (const name of TARGETS) {
    const source = path.join(ASSETS, name + '.svg');
    const target = path.join(ASSETS, name + '.png');
    if (!fs.existsSync(source)) {
      console.error('缺少源文件：' + source);
      process.exit(1);
    }
    const svg = fs.readFileSync(source);
    const density = 72 * SCALE;
    await sharp(svg, { density: density })
      .resize(300 * SCALE, 300 * SCALE, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png({ compressionLevel: 9 })
      .toFile(target);
    const size = fs.statSync(target).size;
    console.log('生成 ' + path.basename(target) + ' （' + (size / 1024).toFixed(1) + ' KB）');
  }
  console.log('款式图资源构建完成');
})();

