// 本地试跑模型：不用装小程序，也不用部署云函数。
//
// 为什么需要这个脚本：
// 调提示词时，真实反馈环原本是「配环境变量 → 部署云函数 → 开小程序 →
// 拍照 → 上传 → 等 10 秒」，一轮几分钟，而且失败时不知道错在哪一步。
// 这个脚本调用的是和云函数**完全相同**的那几个模块
// （lib/prompt.js、lib/model.js、lib/schema.js），所以测的就是线上逻辑，
// 只是把「拍照上传」换成了「丢一个本地图片路径」。几秒一轮。
//
// 它还会把模型返回的 markers 坐标直接画在你的照片上，
// 这样「标注到底落没落在衣服上」一眼就能看出来。
//
// 用法：
//   node tools/try-model.js <图片路径>
//   node tools/try-model.js <图片路径> --who 外婆 --difficulties buttons,liftArm,bend
//   node tools/try-model.js --no-image --who 妈妈        # 只测文字，不传图
//   node tools/try-model.js <图片路径> --raw             # 打印完整原始返回
//   node tools/try-model.js <图片路径> --timeout 60000   # 放宽超时
//
// 密钥放在 .local/model.js（整个 .local/ 已被 .gitignore 排除，不会提交）。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'cloudfunctions/analyze/lib');

const prompt = require(path.join(LIB, 'prompt.js'));
const model = require(path.join(LIB, 'model.js'));
const schema = require(path.join(LIB, 'schema.js'));
const sample = require(path.join(LIB, 'sample.js'));

const https = require('https');
const http = require('http');

const LOCAL_DIR = path.join(ROOT, '.local');
const CONFIG_FILE = path.join(LOCAL_DIR, 'model.js');

// 和云函数保持一致：超过这个时间就算超时。
// 本地故意用同一个数字——如果本地都要 20 秒，云端一样会超时，
// 用更宽的超时只会给你虚假的安全感。要放宽得显式传 --timeout。
const CLOUD_TIMEOUT_MS = 15000;

const WARN = '#C77D2B';
const GOOD = '#3D7A5F';

function parseArgs(argv) {
  const opts = {
    image: '',
    who: '妈妈',
    difficulties: ['buttons'],
    noImage: false,
    raw: false,
    selfTest: false,
    listModels: false,
    out: '',
    timeoutMs: CLOUD_TIMEOUT_MS
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--who') {
      opts.who = argv[++i] || opts.who;
    } else if (arg === '--difficulties') {
      opts.difficulties = String(argv[++i] || '')
        .split(',')
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    } else if (arg === '--no-image') {
      opts.noImage = true;
    } else if (arg === '--raw') {
      opts.raw = true;
    } else if (arg === '--self-test') {
      opts.selfTest = true;
    } else if (arg === '--list-models') {
      opts.listModels = true;
    } else if (arg === '--out') {
      opts.out = argv[++i] || '';
    } else if (arg === '--timeout') {
      opts.timeoutMs = Number(argv[++i]) || CLOUD_TIMEOUT_MS;
    } else if (arg.indexOf('--') === 0) {
      fail('认不出的参数：' + arg);
    } else if (!opts.image) {
      opts.image = arg;
    }
  }

  return opts;
}

function fail(message) {
  console.error('');
  console.error('✗ ' + message);
  process.exit(1);
}

function loadConfig() {
  const fromEnv = {
    baseUrl: process.env.MODEL_BASE_URL || '',
    apiKey: process.env.MODEL_API_KEY || '',
    model: process.env.MODEL_NAME || ''
  };

  if (fromEnv.baseUrl && fromEnv.apiKey && fromEnv.model) {
    return { cfg: fromEnv, where: '环境变量' };
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    return { cfg: fromEnv, where: '环境变量（.local/model.js 不存在）' };
  }

  let local;
  try {
    local = require(CONFIG_FILE);
  } catch (err) {
    fail('.local/model.js 语法有错：' + (err && err.message));
  }

  return {
    cfg: {
      baseUrl: local.baseUrl || fromEnv.baseUrl || '',
      apiKey: local.apiKey || fromEnv.apiKey || '',
      model: local.model || fromEnv.model || ''
    },
    where: '.local/model.js'
  };
}

function checkConfig(cfg) {
  const missing = [];
  if (!cfg.baseUrl) missing.push('baseUrl   （模型接口地址，形如 https://xxx/v1）');
  if (!cfg.apiKey) missing.push('apiKey    （密钥）');
  if (!cfg.model) missing.push('model     （模型名，必须是带视觉能力的）');

  if (missing.length === 0) return true;

  console.error('');
  console.error('✗ 模型配置不全，还缺：');
  missing.forEach(function (m) { console.error('    ' + m); });
  console.error('');
  console.error('  填到 ' + path.relative(ROOT, CONFIG_FILE) + '，格式：');
  console.error('');
  console.error('    module.exports = {');
  console.error('      baseUrl: \'https://你的接口地址/v1\',');
  console.error('      apiKey: \'你的密钥\',');
  console.error('      model: \'模型名\'');
  console.error('    };');
  console.error('');
  console.error('  这个文件已被 .gitignore 排除，不会被提交。');
  console.error('');
  process.exit(1);
  return false;
}

function readImage(imagePath) {
  if (!fs.existsSync(imagePath)) {
    fail('找不到图片：' + imagePath);
  }
  const buf = fs.readFileSync(imagePath);
  if (!buf.length) fail('图片是空文件：' + imagePath);
  return buf;
}

async function drawMarkers(imagePath, analysis, outPath) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (err) {
    console.log('  （装了 sharp 才能出预览图，这次跳过）');
    return '';
  }

  const MAX_EDGE = 900;
  const base = sharp(imagePath).rotate();
  const meta = await base.metadata();
  const scale = Math.min(1, MAX_EDGE / Math.max(meta.width || MAX_EDGE, meta.height || MAX_EDGE));
  const w = Math.round((meta.width || MAX_EDGE) * scale);
  const h = Math.round((meta.height || MAX_EDGE) * scale);

  const r = Math.max(11, Math.round(Math.min(w, h) * 0.028));
  const markers = (analysis.markers || []);

  const parts = markers.map(function (m, i) {
    const cx = Math.round((m.x / 100) * w);
    const cy = Math.round((m.y / 100) * h);
    const color = m.type === 'warn' ? WARN : GOOD;
    return [
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + color + '" fill-opacity="0.92" stroke="#FFFFFF" stroke-width="2"/>',
      '<text x="' + cx + '" y="' + cy + '" font-size="' + Math.round(r * 1.15) +
        '" font-weight="500" fill="#FFFFFF" text-anchor="middle" dominant-baseline="central" ' +
        'font-family="-apple-system, Helvetica, sans-serif">' + (i + 1) + '</text>'
    ].join('');
  }).join('');

  const svg = '<svg width="' + w + '" height="' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    parts + '</svg>';

  const target = outPath || path.join(LOCAL_DIR, 'preview-' + Date.now() + '.png');
  fs.mkdirSync(path.dirname(target), { recursive: true });

  await sharp(imagePath)
    .rotate()
    .resize({ width: w, height: h, fit: 'fill' })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(target);

  return target;
}

function hr(title) {
  console.log('');
  console.log('── ' + title + ' ' + '─'.repeat(Math.max(0, 56 - title.length)));
}

// 问接口要一份模型清单。与其在文档里写死模型名（写的那天就开始过期），
// 不如直接问服务端有哪些。
function listModels(cfg) {
  return new Promise(function (resolve, reject) {
    const target = new URL(String(cfg.baseUrl).replace(/\/+$/, '') + '/models');
    const client = target.protocol === 'http:' ? http : https;
    const req = client.request({
      hostname: target.hostname,
      port: target.port || (target.protocol === 'http:' ? 80 : 443),
      path: target.pathname + target.search,
      method: 'GET',
      headers: { Authorization: 'Bearer ' + cfg.apiKey }
    }, function (res) {
      let data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, function () {
      req.destroy(new Error('请求超时'));
    });
    req.end();
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.image && !opts.noImage && !opts.listModels) {
    console.log('');
    console.log('用法：node tools/try-model.js <图片路径> [选项]');
    console.log('');
    console.log('  --who 外婆                  穿衣对象，默认「妈妈」');
    console.log('  --difficulties buttons,liftArm,bend   动作难点，可多选，用逗号隔开');
    console.log('  --no-image                  不传照片，只测文字（要看它会不会瞎猜）');
    console.log('  --raw                       打印模型完整原始返回');
    console.log('  --self-test                 不调模型，用内置示例数据，只为验证预览图能不能画出来');
    console.log('  --list-models               问接口要一份可用模型清单，然后退出');
    console.log('  --out 路径                  预览图存哪（默认 .local/preview-<时间>.png）');
    console.log('  --timeout 60000             放宽超时（默认和云函数一致：15000ms）');
    console.log('');
    console.log('难点可选值：' + Object.keys(prompt.DIFFICULTY_TEXT).join(' / '));
    console.log('');
    process.exit(0);
  }

  if (opts.listModels) {
    hr('模型清单');
    const loaded = loadConfig();
    if (!loaded.cfg.baseUrl) fail('还缺 baseUrl，先填 ' + path.relative(ROOT, CONFIG_FILE));
    if (!loaded.cfg.apiKey) fail('还缺 apiKey，先填 ' + path.relative(ROOT, CONFIG_FILE));
    console.log('  接口  ' + loaded.cfg.baseUrl);
    console.log('');
    let res;
    try {
      res = await listModels(loaded.cfg);
    } catch (err) {
      fail('请求失败：' + ((err && err.message) || err));
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      console.error('  ✗ HTTP ' + res.statusCode);
      console.error('  ' + String(res.body).slice(0, 300));
      console.error('');
      console.error(res.statusCode === 401 ? '  密钥不对。' : '  检查 baseUrl 和密钥。');
      console.log('');
      process.exit(1);
    }
    let list = [];
    try {
      list = (JSON.parse(res.body).data || []).map(function (m) { return m.id; });
    } catch (err) {
      fail('返回不是预期的 JSON 列表');
    }
    list.sort();
    console.log('  共 ' + list.length + ' 个模型：');
    console.log('');
    list.forEach(function (id) { console.log('    ' + id); });
    console.log('');
    console.log('  这个清单里**看不出哪个带视觉能力**。要传照片，选名字里带');
    console.log('  gpt-4 / gpt-4.1 / gpt-5 / o3 / o4 这类多模态型号的；');
    console.log('  纯文本型号（比如各种 embed、tts、whisper）看不到照片。');
    console.log('  挑一个填进 ' + path.relative(ROOT, CONFIG_FILE) + ' 的 model 字段。');
    console.log('');
    process.exit(0);
  }

  const profile = { who: opts.who, difficulties: opts.difficulties };

  hr('1. 配置');
  let cfg = { baseUrl: '', apiKey: '', model: '' };
  if (opts.selfTest) {
    console.log('  跳过（--self-test 不调模型，不需要密钥）');
  } else {
    const loaded = loadConfig();
    checkConfig(loaded.cfg);
    cfg = loaded.cfg;
    console.log('  来源       ' + loaded.where);
    console.log('  接口       ' + cfg.baseUrl);
    console.log('  模型       ' + cfg.model);
    console.log('  密钥       ' + '已设置（' + String(cfg.apiKey).length + ' 字符，不打印内容）');
    console.log('  超时       ' + opts.timeoutMs + ' ms（和云函数一致）');
  }

  hr('2. 请求');
  console.log('  对象       ' + profile.who);
  console.log('  难点       ' + profile.difficulties.join('、'));
  console.log('  翻译成的文字：' + (profile.difficulties
    .map(function (k) { return prompt.DIFFICULTY_TEXT[k]; })
    .filter(Boolean).join('；') || '（未匹配到，模型会按通用情况判断）'));

  let imageBase64 = '';
  let imageNote = '';
  if (!opts.noImage) {
    const buf = readImage(opts.image);
    imageBase64 = buf.toString('base64');
    const kb = Math.round(buf.length / 1024);
    const b64kb = Math.round(imageBase64.length / 1024);
    console.log('  图片       ' + path.relative(ROOT, opts.image) + '（' + kb + ' KB → base64 ' + b64kb + ' KB）');
    if (kb > 1500) {
      imageNote = '图片偏大，云端也是原样上传，可能拖慢或超时';
      console.log('  ⚠ ' + imageNote);
    }
  } else {
    console.log('  图片       不传（只测文字）');
  }

  let analysis;

  if (opts.selfTest) {
    hr('3. 跳过模型');
    console.log('  用内置示例数据（cloudfunctions/analyze/lib/sample.js），不联网。');
    console.log('  这一份数据的坐标是照示意图手工调过的 —— 拿它画在真实照片上，');
    console.log('  正好能看出「口径不一致」长什么样。');
    analysis = sample.sampleFor(profile);
  } else {
    const messages = prompt.buildMessages(profile, !!imageBase64);
    const callModel = model.createCallModel({
      baseUrl: cfg.baseUrl,
      apiKey: cfg.apiKey,
      model: cfg.model,
      timeoutMs: opts.timeoutMs
    });

    const started = Date.now();
    let raw;
    try {
      raw = await callModel(messages, { attempt: 1, imageBase64: imageBase64 });
    } catch (err) {
      hr('请求失败');
      console.error('  ✗ ' + ((err && err.message) || err));
      console.error('');
      console.error('  对一下常见原因：');
      console.error('    · 状态码 401 / 403  → 密钥不对，或没权限用这个模型');
      console.error('    · 状态码 404        → baseUrl 少了或多了 /v1，或模型名拼错');
      console.error('    · 状态码 429        → 触发限流，等一会儿再试');
      console.error('    · 报文里提到 image  → 这个模型不支持图片，要换成带视觉能力的');
      console.error('    · 超时              → 模型太慢，换更快的，或放宽超时');
      console.error('');
      process.exit(1);
    }
    const elapsed = Date.now() - started;

    hr('3. 返回');
    console.log('  耗时       ' + (elapsed / 1000).toFixed(1) + ' 秒');
    if (elapsed > opts.timeoutMs * 0.7) {
      console.log('  ⚠ 已经用掉超时预算的 ' + Math.round((elapsed / opts.timeoutMs) * 100) +
        '%，云端再慢一点就会判超时');
    }
    console.log('  字符数     ' + raw.length);
    console.log('');
    const preview = opts.raw ? raw : raw.slice(0, 700) + (raw.length > 700 ? '\n…（要看全部加 --raw）' : '');
    console.log(preview.split('\n').map(function (l) { return '  │ ' + l; }).join('\n'));

    hr('4. 解析');
    let parsed;
    try {
      parsed = model.parseModelOutput(raw);
    } catch (err) {
      console.error('  ✗ JSON 解析失败：' + ((err && err.message) || err));
      console.error('');
      console.error('  这通常说明提示词没压住格式。改 lib/prompt.js 里');
      console.error('  「只输出一个 JSON 对象，不要输出任何解释文字或 Markdown 代码块」那条，');
      console.error('  或者把它挪到更靠前的位置。');
      process.exit(1);
    }
    console.log('  ✓ 拿到 JSON，顶层字段：' + Object.keys(parsed).join('、'));

    hr('5. 结构校验');
    const checked = schema.validateAnalysis(parsed);
    if (!checked.ok) {
      console.error('  ✗ 不符合结构要求：' + checked.error);
      console.error('');
      console.error('  云函数遇到这个会重试一次，再失败就退回示例数据 ——');
      console.error('  也就是界面上还能看，但**根本不是模型给的**。');
      console.error('  这个错误值得改掉，不要放着。');
      process.exit(1);
    }
    analysis = checked.value;
    console.log('  ✓ 通过');
  }

  hr('6. ' + (opts.selfTest ? '内置示例数据（不是模型给的）' : '模型给的判断'));
  console.log('  衣服       ' + analysis.garment.name + '（' + analysis.garment.category + '）');
  console.log('  总分       ' + analysis.score + ' / 100 —— ' + analysis.level);
  console.log('  一句话     ' + analysis.summary);
  console.log('');
  console.log('  四个分项：');
  (analysis.dims || []).forEach(function (d) {
    const bar = '█'.repeat(Math.round(d.score / 5)) + '·'.repeat(20 - Math.round(d.score / 5));
    console.log('    ' + String(d.label).padEnd(6, '　') + ' ' + String(d.score).padStart(3) + '  ' + bar);
  });
  console.log('');
  console.log('  结构分析 ' + analysis.findings.length + ' 条：');
  analysis.findings.forEach(function (f, i) {
    console.log('    ' + (i + 1) + '. [' + f.label + '] ' + f.title);
  });
  console.log('');
  console.log('  要问商家的 ' + analysis.questions.length + ' 条（抽第一条看看）：');
  console.log('    ' + analysis.questions[0].title);

  hr('7. 标注坐标');
  const markers = analysis.markers || [];
  if (!markers.length) {
    console.log('  （没有标注）');
  } else {
    if (opts.selfTest) {
      console.log('  这一份坐标本来是照**示意图**手工调过的，现在把它画在你的照片上。');
      console.log('  位置对不上是正常的 —— 这正好说明「模型看照片、界面画示意图」的问题。');
    } else {
      console.log('  这些百分比是**相对你给的这张照片**的，和小程序里一样。');
    }
    console.log('');
    console.log('    #   类型     x%     y%');
    markers.forEach(function (m, i) {
      console.log('    ' + (i + 1) + '   ' + String(m.type).padEnd(6) + '  ' +
        String(m.x).padStart(4) + '   ' + String(m.y).padStart(4));
    });
    const outOfRange = markers.filter(function (m) {
      return m.x < 15 || m.x > 85 || m.y < 12 || m.y > 88;
    });
    if (outOfRange.length) {
      console.log('');
      console.log('  ⚠ 有 ' + outOfRange.length + ' 个点落在提示词约定的范围之外');
      console.log('    （衣服应占横向 15%-85%、纵向 12%-88%）——大概率飘到背景上了。');
    }
  }

  if (!opts.noImage && markers.length) {
    hr('8. 预览图');
    const target = await drawMarkers(opts.image, analysis, opts.out);
    if (target) {
      console.log('  已写出 ' + path.relative(ROOT, target));
      console.log('  橙色 = 需要注意，绿色 = 省力，数字和上面 7 的顺序一致。');
      console.log('');
      console.log('  注意：这张预览图是把坐标**直接按百分比画在照片上**，');
      console.log('  所以它反映的是模型给的坐标准不准。');
      console.log('  小程序里还会额外叠一层容器偏移（结果页 .garment-wrap 有 24rpx 上下内边距），');
      console.log('  那是另一个问题，不在这张图里体现。');
    }
  }

  hr('小结');
  if (opts.selfTest) {
    console.log('  这一轮用的是内置示例数据，只验证了「预览图能画出来」。');
    console.log('  真要试模型：去掉 --self-test，并确认 .local/model.js 已经填好。');
  } else {
    console.log('  模型返回合格，整条链路（提示词 → 模型 → 校验）是通的。');
    console.log('  接下来把这三个值填进云函数环境变量，线上线下就一致了：');
    console.log('    MODEL_BASE_URL=' + cfg.baseUrl);
    console.log('    MODEL_NAME=' + cfg.model);
    console.log('    MODEL_API_KEY=（就是 .local/model.js 里那个，不用再找）');
  }
  console.log('');
}

main().catch(function (err) {
  console.error('');
  console.error('✗ 意外错误：' + ((err && err.stack) || err));
  process.exit(1);
});
