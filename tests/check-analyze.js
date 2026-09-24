const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LIB = path.join(ROOT, 'cloudfunctions/analyze/lib');
let failed = 0;
let passed = 0;

function ok(cond, msg) {
  if (cond) { passed++; console.log('  PASS ' + msg); }
  else { failed++; console.error('  FAIL ' + msg); }
}

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

const schema = require(path.join(LIB, 'schema.js'));
const prompt = require(path.join(LIB, 'prompt.js'));
const sample = require(path.join(LIB, 'sample.js'));
const model = require(path.join(LIB, 'model.js'));
const analyze = require(path.join(LIB, 'analyze.js'));

const PROFILE = { who: '妈妈', difficulties: ['buttons', 'liftArm'] };

/** 失败路径一定会打日志（这是对的），测试里静音，免得刷屏 */
const quietLog = { error: function () {}, warn: function () {} };

function validAnalysis() {
  return {
    garment: { name: '针织开衫', category: 'top' },
    score: 78,
    level: '可以买',
    summary: '前开襟对抬胳膊费劲的人很友好，但纽扣多需要留意。',
    dims: [
      { key: 'dress', label: '穿脱省力', score: 92 },
      { key: 'closure', label: '开合操作', score: 48 },
      { key: 'cuff', label: '袖口宽松', score: 85 },
      { key: 'size', label: '尺码友好', score: 65 }
    ],
    findings: [
      { type: 'good', label: '省力', title: '前开襟 · 不用套头', detail: '穿衣不需要把手举过头顶。' },
      { type: 'warn', label: '注意', title: '一排纽扣 · 5 颗以上', detail: '扣扣子费劲的话建议先问商家。' }
    ],
    markers: [{ x: 44, y: 14, type: 'good' }, { x: 46, y: 52, type: 'warn' }],
    questions: [{ title: '前面的纽扣需要逐颗扣吗？', detail: '请确认是真纽扣还是装饰扣。' }],
    script: '您好，这件开衫我想给 65 岁的妈妈买，请问扣子是真扣子吗？',
    tryOn: ['能否按平时的方式穿上、脱下'],
    idealFeatures: [{ index: 1, title: '大拉环暗拉链', detail: '不用扣扣子' }],
    idealGap: '主要差在开合方式上',
    idealScript: '您好，我想找类似这种开衫：前开襟 + 大拉环暗拉链。'
  };
}

async function main() {
  console.log('\n[1] schema 校验');
  const good = schema.validateAnalysis(validAnalysis());
  ok(good.ok === true, '完整合法结果通过校验');
  ok(good.value.score === 78, '分数保留');

  const missing = validAnalysis();
  delete missing.script;
  ok(schema.validateAnalysis(missing).ok === false, '缺 script 不通过');

  const noDims = validAnalysis();
  noDims.dims = [{ key: 'dress', label: '穿脱省力', score: 92 }];
  ok(schema.validateAnalysis(noDims).ok === false, '分项不足 4 个不通过');

  const noFindings = validAnalysis();
  noFindings.findings = [];
  ok(schema.validateAnalysis(noFindings).ok === false, 'findings 为空不通过');

  const tooManyQuestions = validAnalysis();
  tooManyQuestions.questions = [1, 2, 3, 4].map(i => ({ title: 'q' + i, detail: 'd' }));
  ok(schema.validateAnalysis(tooManyQuestions).ok === false, '问题超过 3 条不通过');

  const badScore = validAnalysis();
  badScore.score = 130;
  ok(schema.validateAnalysis(badScore).ok === false, '分数越界不通过');

  const badDimsScore = validAnalysis();
  badDimsScore.dims[0].score = '很高';
  ok(schema.validateAnalysis(badDimsScore).ok === false, '分项分数非数字不通过');

  const notJson = schema.validateAnalysis('这不是 JSON');
  ok(notJson.ok === false, '非对象输入不通过');

  console.log('\n[2] schema 归一化');
  const messy = validAnalysis();
  messy.score = 77.6;
  messy.summary = '  前后有空格  ';
  messy.findings.push({ type: 'unknown', label: 'x', title: '无效项', detail: '' });
  const normalized = schema.validateAnalysis(messy);
  ok(normalized.ok === true, '可修的问题不拒绝');
  ok(normalized.value.score === 78, '小数分数四舍五入');
  ok(normalized.value.summary === '前后有空格', '字符串去空格');
  ok(normalized.value.findings.length === 2, '剔除非法 type 的 finding');

  console.log('\n[3] prompt 构造');
  const msgs = prompt.buildMessages(PROFILE);
  ok(Array.isArray(msgs) && msgs.length >= 2, '生成 system + user 消息');
  ok(msgs[0].role === 'system', '第一条是 system');
  const joined = JSON.stringify(msgs);
  ['扣扣子', '抬手'].every(k => ok(joined.includes(k), 'prompt 含用户难点关键词 ' + k));
  ok(joined.includes('score'), 'prompt 声明了 score 字段');
  ok(joined.includes('dims'), 'prompt 声明了 dims 字段');
  ok(joined.includes('script'), 'prompt 声明了 script 字段');
  ok(joined.includes('idealFeatures'), 'prompt 声明了 idealFeatures 字段');
  ok(joined.includes('JSON'), 'prompt 要求输出 JSON');
  ok(!joined.includes('疾病') && !joined.includes('残障'), 'prompt 无标签化词汇');
  ok(joined.includes('不要'), 'prompt 含约束性指令（避免夸大）');

  const withImage = prompt.buildMessages(PROFILE, true);
  const hasImagePart = withImage.some(m => Array.isArray(m.content) &&
    m.content.some(c => c.type === 'image_url'));
  ok(hasImagePart, '有图片时消息含 image_url 部分');

  console.log('\n[4] 示例数据（兜底）');
  const s1 = sample.sampleFor({ who: '妈妈', difficulties: ['buttons'] });
  ok(schema.validateAnalysis(s1).ok === true, '示例数据自身合法');
  const closureDim = s1.dims.find(d => d.key === 'closure');
  ok(closureDim.score < 60, '选「扣扣子费劲」时开合操作分项偏低');

  const s2 = sample.sampleFor({ who: '妈妈', difficulties: ['liftArm'] });
  const dressDim = s2.dims.find(d => d.key === 'dress');
  ok(dressDim.score >= 88, '选「抬手费劲」时穿脱省力分项偏高');

  const s3 = sample.sampleFor(PROFILE);
  ok(s3.findings.length >= 2, '多选难点时给多条结论');
  ok(s3.script.indexOf('妈妈') >= 0, '示例话术使用画像中的对象名');

  const s4 = sample.sampleFor(null);
  ok(schema.validateAnalysis(s4).ok === true, '画像为空时也有合法兜底');

  console.log('\n[5] 模型调用与解析');
  const body = model.buildRequestBody({
    model: 'gpt-4o',
    messages: prompt.buildMessages(PROFILE),
    imageBase64: 'AAA'
  });
  ok(body.model === 'gpt-4o', '请求体带模型名');
  ok(Array.isArray(body.messages), '请求体带 messages');
  const imgPart = body.messages[1].content.find(c => c.type === 'image_url');
  ok(!!imgPart && imgPart.image_url.url.indexOf('data:image') === 0, '图片以 data URI 形式发送');
  ok(imgPart.image_url.url.indexOf('base64,AAA') > 0, 'base64 内容正确嵌入');

  const fenced = model.parseModelOutput('这是结果：\n```json\n{"score": 80}\n```\n以上。');
  ok(fenced.score === 80, '解析代码块包裹的 JSON');
  ok(model.parseModelOutput('{"score": 81}').score === 81, '解析裸 JSON');
  ok(model.parseModelOutput('前言 {"score": 82} 后记').score === 82, '从文本中提取 JSON 对象');
  let threw = false;
  try { model.parseModelOutput('完全没有 JSON'); } catch (e) { threw = true; }
  ok(threw, '无 JSON 时抛错（触发重试）');

  console.log('\n[6] 编排：成功路径');
  let calls = 0;
  const successDeps = {
    callModel: async () => { calls++; return JSON.stringify(validAnalysis()); },
    sampleFor: sample.sampleFor
  };
  let res = await analyze.runAnalysis({ profile: PROFILE, imageBase64: 'AAA', deps: successDeps });
  ok(res.ok === true, '返回 ok');
  ok(res.source === 'model', '来源标记为 model');
  ok(calls === 1, '成功时只调用一次模型');
  ok(res.analysis.score === 78, '返回解析后的结果');

  console.log('\n[7] 编排：模型返回脏数据 → 重试');
  calls = 0;
  const retryDeps = {
    callModel: async () => { calls++; return calls === 1 ? '不是 JSON' : JSON.stringify(validAnalysis()); },
    sampleFor: sample.sampleFor,
    log: quietLog
  };
  // 真实分析必须有图：缺图时程序直接拦下，不会走到模型（见 check-analyze-defense.js）
  res = await analyze.runAnalysis({ profile: PROFILE, imageBase64: 'AAA', deps: retryDeps });
  ok(calls === 2, '首次失败后重试一次');
  ok(res.source === 'model', '重试成功后来源为 model');

  console.log('\n[8] 编排：两次都失败 → 诚实失败（不给示例）');
  calls = 0;
  const failDeps = {
    callModel: async () => { calls++; return '仍然不是 JSON'; },
    sampleFor: sample.sampleFor,
    log: quietLog
  };
  res = await analyze.runAnalysis({ profile: PROFILE, imageBase64: 'AAA', deps: failDeps });
  ok(calls === 2, '失败时尝试两次后放弃');
  // 契约变了：以前这里断言「兜底也是 ok:true + 示例数据」，那是假装成功。
  // 现在失败就是失败，界面去说「这次没读出来」并给重试出口。
  ok(res.ok === false, '失败就是失败，不返回 ok:true');
  ok(res.source === 'failed', '来源标记为 failed');
  ok(res.analysis === null, '不带任何示例数据（避免被当成真实结果）');
  ok(!!res.reason, '记录失败原因便于排查');

  console.log('\n[9] 编排：模型抛异常（超时/网络）');
  const throwDeps = {
    callModel: async () => { throw new Error('请求超时'); },
    sampleFor: sample.sampleFor,
    log: quietLog
  };
  res = await analyze.runAnalysis({ profile: PROFILE, imageBase64: 'AAA', deps: throwDeps });
  ok(res.source === 'failed', '异常时诚实失败');
  ok(res.reason.indexOf('超时') >= 0, '原因包含异常信息');

  console.log('\n[10] 编排：示例模式是另一条路');
  const keywordDeps = {
    callModel: async () => { throw new Error('no api key'); },
    sampleFor: sample.sampleFor,
    forceFallback: true,
    log: quietLog
  };
  res = await analyze.runAnalysis({ profile: PROFILE, deps: keywordDeps });
  // 示例模式是用户主动要看示例，不是失败 —— 所以 ok:true，且来源标 example
  ok(res.ok === true, '示例模式是 ok 的（它和失败是两条路）');
  ok(res.source === 'example', '来源标记为 example');
  ok(schema.validateAnalysis(res.analysis).ok === true, '示例数据合法可渲染');

  console.log('\n[11] 云函数入口结构');
  const indexSrc = read('cloudfunctions/analyze/index.js');
  ok(indexSrc.includes('wx-server-sdk'), '引入 wx-server-sdk');
  ok(indexSrc.includes('DYNAMIC_CURRENT_ENV'), '使用当前环境初始化');
  ok(indexSrc.includes('MODEL_BASE_URL'), '读取模型地址环境变量');
  ok(indexSrc.includes('MODEL_API_KEY'), '读取模型密钥环境变量');
  ok(indexSrc.includes('MODEL_NAME'), '读取模型名称环境变量');
  ok(indexSrc.includes('exports.main'), '导出 main 入口');
  ok(/TIMEOUT|timeoutMs|15000/.test(indexSrc), '含超时控制');
  ok(indexSrc.includes('downloadFile'), '从云存储下载图片');
  ok(/analyses/.test(indexSrc), '结果写入 analyses 集合做缓存');
  ok(indexSrc.includes('catch'), '有整体异常捕获');

  console.log('\n[12] package.json 依赖');
  const pkg = JSON.parse(read('cloudfunctions/analyze/package.json'));
  ok(!!pkg.dependencies['wx-server-sdk'], '声明 wx-server-sdk 依赖');
  ok(pkg.main === 'index.js', '入口指向 index.js');

  console.log('\n[13] 文案合规与回归');
  const banned = ['残障', '残疾', '病人', '疾病'];
  ['cloudfunctions/analyze/index.js', 'cloudfunctions/analyze/lib/prompt.js', 'cloudfunctions/analyze/lib/sample.js'].forEach(f => {
    const hit = banned.filter(w => read(f).includes(w));
    ok(hit.length === 0, f + ' 无禁用词' + (hit.length ? '（命中: ' + hit.join(',') + '）' : ''));
  });
  const { execSync } = require('child_process');
  const r = execSync('node ' + path.join(ROOT, 'tests/check-skeleton.js')).toString();
  ok(r.includes('0 失败'), '骨架测试保持全绿');

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed > 0 ? 1 : 0);
}

main();
