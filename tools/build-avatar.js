// 生成微信小程序头像。
//
// 为什么不交给 AI 画：头像是 144×144，AI 生成的插画在这个尺寸下线条会糊，
// 而且配色不受控，会和「纯白底 + 黑白灰」的视觉规范打架。
// 这里用几何路径自己画，好处是能把每个坐标精确控制到 144px 网格上。
//
// 图形语义：一件「前襟敞开」的上衣。
// 敞开的前襟 = 不用把手臂穿过闭合的衣服 = 好穿。这是产品的核心判断项。
//
// 几何上的三个坑（都踩过，所以写下来）：
//   1. 领口用尖 V，和前襟开缝接在一起会形成「沙漏」，40px 下像蝴蝶结不像衣服。
//      改法：负空间必须单调——从上往下先收窄、再放宽，中间不能有尖角。
//   2. 领口两侧如果比肩膀高，会各拉出一个尖角，整个剪影变成「女巫帽」。
//      改法：肩线拉平，领口只做浅浅的梯形缺口。
//   3. 开缝太宽（>20px）会把衣服切成互不相干的两片布。
//      改法：上沿 10px、下摆 16px，保持「一件衣服敞着」的读感。
//
// 试过但放弃的方案：给门襟钉三颗扣子。扣子在 144 下只有 7px，
// 到微信列表的 40px 就不到 1px 了，纯粹是噪点。开缝本身就是「开合方式」的表达。
//
// 运行：
//   NODE_PATH=/Users/derekhu/.workbuddy/binaries/node/workspace/node_modules \
//     node tools/build-avatar.js
//
// 选定的是 b-inverted（黑底白衣服）。要换回别的候选，只改下面的 CHOSEN 重跑。
//
// 输出到 assets/avatar/（只留一份真身，不做多份长得一样的拷贝）：
//   avatar.png            144×144，上传微信后台就是用这个文件
//   preview-avatar.png    576×576，放大 4 倍，用来肉眼看细节
//   preview-circle.png    四个候选的对比图，方形 / 圆形裁切 / 40px 三档

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets/avatar');

// 上衣外轮廓。顺时针，从左领口起笔。整体关于 x=72 左右对称。
const OUTLINE = [
  'M62 32',   // 左领口上沿
  'L67 44',   // 领口左壁，收进去
  'L77 44',   // 领口底边（10px 宽）
  'L82 32',   // 领口右壁
  'L110 32',  // 右肩（水平，不抬尖角）
  'L128 58',  // 右袖口外角
  'L106 72',  // 右袖窿（袖底内角）
  'L106 117', // 右下摆
  'L38 117',  // 左下摆
  'L38 72',   // 左袖窿
  'L16 58',   // 左袖口外角
  'L34 32',   // 左肩
  'Z',
].join(' ');

// 前襟开缝：从领口底边收尖到 y=100，不碰下摆。
// 关键是「不一路通到底」：试过通到下摆的版本，白底上会读成两块互不相干的板子。
// 现在负空间从领口的 20px 单调收到 0，全程没有尖角也没有分叉，剪影始终是一件衣服。
const OPENING = 'M68.5 44 L75.5 44 L72 100 Z';

const INK = '#1A1A1A';
const PAPER = '#FFFFFF';

const FILLED_BODY = `<path d="${OUTLINE}" fill="${INK}"/><path d="${OPENING}" fill="${PAPER}"/>`;

const VARIANTS = [
  {
    key: 'a-filled',
    label: '实心 + 开缝',
    note: '白底黑衣服，前襟一道细开缝',
    bg: PAPER,
    body: FILLED_BODY,
  },
  {
    key: 'b-inverted',
    label: '反白（推荐）',
    note: '黑底白衣服，圆形裁切后最完整',
    bg: INK,
    body: `<path d="${OUTLINE}" fill="${PAPER}"/><path d="${OPENING}" fill="${INK}"/>`,
  },
  {
    key: 'c-outline',
    label: '线稿',
    note: '不填充，只用线条',
    bg: PAPER,
    // 线稿没法靠「挖白」表现开缝，改成门襟一笔中线。
    // 起点要离开领口缺口一段距离，否则描边会把缺口填满，领子糊成一团黑。
    body:
      `<path d="${OUTLINE}" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linejoin="round"/>` +
      `<path d="M72 52 L72 113" fill="none" stroke="${INK}" stroke-width="7.5" stroke-linecap="round"/>`,
  },
  {
    key: 'd-solid',
    label: '实心无开缝',
    note: '最简洁，小尺寸下最清楚',
    bg: PAPER,
    body: `<path d="${OUTLINE}" fill="${INK}"/>`,
  },
];

// 选定哪一个作为正式头像。这是唯一的「开关」，改这里就行。
// b-inverted 胜出的理由：微信列表里头像是圆形裁切，黑底盘裁完是一枚完整的
// 黑圆盘 + 白衣服，像正经 app 图标；白底盘裁完是「白圆盘里一块黑」，边界会消失。
// 而且它在 40px 下最清楚。
const CHOSEN = 'b-inverted';

function avatarSvg(variant, size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${variant.bg}"/>
  ${variant.body}
</svg>`;
}

// 对比图：每个变体一行，左边是上传用的方形，中间是微信列表里的圆形裁切，
// 下排再放一个 40px 的圆，用来看小尺寸下还认不认得出来。
function sheetSvg() {
  const COL_W = 250;
  const SHEET_W = VARIANTS.length * COL_W;
  const SHEET_H = 290;

  const TOP = 52;
  const BIG = 104;
  const SMALL = 40;
  const SMALL_Y = 208;

  const clips = [];
  const cells = [];

  VARIANTS.forEach(function (v, i) {
    const ox = i * COL_W;
    const bigScale = BIG / 144;
    const smallScale = SMALL / 144;

    const sqX = 14 + ox;
    const ciCx = 172 + ox;
    const ciX = ciCx - BIG / 2;
    const smX = ciCx - SMALL / 2;

    clips.push(
      `<clipPath id="sq${i}"><rect x="${sqX}" y="${TOP}" width="${BIG}" height="${BIG}" rx="10"/></clipPath>`,
      `<clipPath id="ci${i}"><circle cx="${ciCx}" cy="${TOP + BIG / 2}" r="${BIG / 2}"/></clipPath>`,
      `<clipPath id="sm${i}"><circle cx="${ciCx}" cy="${SMALL_Y + SMALL / 2}" r="${SMALL / 2}"/></clipPath>`
    );

    // 选定的那一列用实黑标注，其余的压成浅灰，一眼能看出用的是哪个
    const picked = v.key === CHOSEN;

    cells.push(
      `<text x="${COL_W / 2 + ox}" y="26" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="500" fill="${picked ? INK : '#A8A8A8'}">${v.key}</text>`,
      `<text x="${COL_W / 2 + ox}" y="43" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${picked ? INK : '#A8A8A8'}">${v.label}${picked ? ' ← 已选用' : ''}</text>`,
      `<g clip-path="url(#sq${i})"><rect x="${sqX}" y="${TOP}" width="${BIG}" height="${BIG}" fill="${v.bg}"/><g transform="translate(${sqX},${TOP}) scale(${bigScale})">${v.body}</g></g>`,
      `<g clip-path="url(#ci${i})"><rect x="${ciX}" y="${TOP}" width="${BIG}" height="${BIG}" fill="${v.bg}"/><g transform="translate(${ciX},${TOP}) scale(${bigScale})">${v.body}</g></g>`,
      `<g clip-path="url(#sm${i})"><rect x="${smX}" y="${SMALL_Y}" width="${SMALL}" height="${SMALL}" fill="${v.bg}"/><g transform="translate(${smX},${SMALL_Y}) scale(${smallScale})">${v.body}</g></g>`
    );
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}">
  <rect width="${SHEET_W}" height="${SHEET_H}" fill="#FFFFFF"/>
  <defs>${clips.join('')}</defs>
  ${cells.join('\n  ')}
  <text x="16" y="176" font-family="sans-serif" font-size="12" fill="#6E6E6E">上排左：上传用的方形　　上排右：微信列表里的圆形裁切</text>
  <text x="16" y="272" font-family="sans-serif" font-size="12" fill="#6E6E6E">下排圆形＝列表里实际看到的 40px，小到这程度还认得出衣服才算过关</text>
</svg>`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const chosen = VARIANTS.find(function (v) {
    return v.key === CHOSEN;
  });
  if (!chosen) {
    throw new Error(`CHOSEN 写的是 ${CHOSEN}，但候选里没有这个 key`);
  }

  // 只渲染选定的这一个。四个候选长得太像，目录里多躺一张就迟早有人传错。
  // 想换回别的候选，改上面的 CHOSEN 重跑 —— 四个候选的定义都还在。
  await sharp(Buffer.from(avatarSvg(chosen, 144)))
    .png()
    .toFile(path.join(OUT_DIR, 'avatar.png'));

  // 576：放大 4 倍。144 太小了，肉眼没法判断好坏。
  await sharp(Buffer.from(avatarSvg(chosen, 576)))
    .png()
    .toFile(path.join(OUT_DIR, 'preview-avatar.png'));

  // 对比图保留，四个候选都在上面，日后想换选可以直接比对。
  await sharp(Buffer.from(sheetSvg()), { density: 144 })
    .png()
    .toFile(path.join(OUT_DIR, 'preview-circle.png'));

  // 清掉上一轮留下的文件，包括早期那些 avatar-xxx.png 候选。
  const wanted = new Set(['avatar.png', 'preview-avatar.png', 'preview-circle.png']);
  fs.readdirSync(OUT_DIR).forEach(function (f) {
    if (!wanted.has(f)) {
      fs.unlinkSync(path.join(OUT_DIR, f));
      console.log(`  清理旧文件 ${f}`);
    }
  });

  console.log(`输出目录：${path.relative(ROOT, OUT_DIR)}　选定：${CHOSEN}`);
  fs.readdirSync(OUT_DIR)
    .sort()
    .forEach(function (f) {
      const size = fs.statSync(path.join(OUT_DIR, f)).size;
      console.log(`  ${f}  ${(size / 1024).toFixed(1)} KB`);
    });

  // 微信的硬性要求，不合格上传会被拒，所以直接在这里卡住。
  const target = path.join(OUT_DIR, 'avatar.png');
  const meta = await sharp(target).metadata();
  if (meta.width !== 144 || meta.height !== 144) {
    throw new Error(`avatar.png 尺寸是 ${meta.width}×${meta.height}，微信要求 144×144`);
  }
  if (fs.statSync(target).size > 2 * 1024 * 1024) {
    throw new Error('avatar.png 超过 2MB');
  }
  console.log('avatar.png 通过：144×144、PNG、远小于 2MB，可以直接上传微信后台');
}

main().catch(function (err) {
  console.error(err.message);
  process.exit(1);
});
