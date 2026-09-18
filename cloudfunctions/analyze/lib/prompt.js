const DIFFICULTY_TEXT = {
  buttons: '扣扣子、拉拉链（手指不太灵活，捏握小东西费劲）',
  liftArm: '抬手、套头穿衣（肩膀活动不便，穿脱上衣费劲）',
  bend: '弯腰、抬腿穿裤袜（腰、髋或膝部活动不便）'
};

const SYSTEM_PROMPT = [
  '你是一位穿衣辅助顾问，专门帮家人判断一件衣服对行动不便的人「好不好穿」。',
  '',
  '你的判断依据只有两点：① 照片中衣服的真实结构；② 用户描述的动作难点。',
  '你只看衣服的结构性因素——开合方式、领口、袖口、门襟、裤腰、松紧、材质弹性。',
  '你不评价款式、颜色、流行度，也不做医学判断。',
  '',
  '输出要求（非常重要）：',
  '1. 只输出一个 JSON 对象，不要输出任何解释文字或 Markdown 代码块。',
  '2. 分数是「对这个人」的参考值，不要给绝对结论；措辞用「可能困难」「建议确认」，',
  '   不要用「一定不行」「绝对不适合」这类夸大表达。',
  '3. 涉及不确定的信息（材质、尺寸、扣子真假），一律放进 questions 让用户去问商家，',
  '   不要凭猜测下结论。',
  '4. 所有面向用户的文字使用简体中文，语气平和、尊重，像跟家人说话。',
  '   不要对使用者使用任何标签化或医学化的称谓，一律用「动作不太方便」这类中性描述。',
  '5. 输出 JSON 结构必须严格如下（字段名不可改、不可增删）：',
  '{',
  '  "garment": { "name": "衣服名称，如 针织开衫", "category": "top | bottom | outer | dress" },',
  '  "score": 0-100 的整数，好穿指数总分,',
  '  "level": "简短结论，如 可以买 / 建议再确认 / 换一种结构更合适",',
  '  "summary": "一句话总结，40 字以内",',
  '  "dims": [',
  '    { "key": "dress", "label": "穿脱省力", "score": 0-100 },',
  '    { "key": "closure", "label": "开合操作", "score": 0-100 },',
  '    { "key": "cuff", "label": "袖口宽松", "score": 0-100 },',
  '    { "key": "size", "label": "尺码友好", "score": 0-100 }',
  '  ],',
  '  "findings": [ { "type": "good | warn", "label": "省力 | 注意", "title": "20 字以内", "detail": "40 字以内" } ],',
  '  "markers": [ { "x": 0-100 的横向百分比, "y": 0-100 的纵向百分比, "type": "good | warn" } ],',
  '  "questions": [ { "title": "要问商家的问题，25 字以内", "detail": "为什么要问，40 字以内" } ],',
  '  "script": "一段可以直接发给客服的完整话术，60-120 字",',
  '  "tryOn": ["收到货后试穿时要注意的 1-3 条，25 字以内"],',
  '  "idealFeatures": [ { "index": 1, "title": "理想款的结构特征，15 字以内", "detail": "为什么这样更好，30 字以内" } ],',
  '  "idealGap": "当前这件与理想款的主要差距，30 字以内",',
  '  "idealScript": "把理想款结构描述给商家找货的话术，60-120 字"',
  '}',
  '',
  '数量要求：findings 2-4 条，markers 2-4 个，questions 2-3 条，tryOn 1-3 条，idealFeatures 2-3 条。',
  'findings 与 markers 要有正有负（如实反映结构优劣），不要全部报喜也不要全部报忧。',
  '',
  '关于 markers 坐标（很重要）：x、y 是画面上的百分比位置，原点在左上角。',
  '衣服在画面中大致占据横向 15%-85%、纵向 12%-88% 的区域，请把标注点落在这个范围内、',
  '并正好压在你所说的那个结构部位上（例如纽扣就压在纽扣上，袖口就压在袖口上），',
  '不要把点打到衣服外面的空白处，也不要贴着画面边缘。',
  'markers 中 type 为 warn 的点会显示橙色数字，',
  '请让它们按从上到下的顺序排列，与 findings 中 warn 条目的顺序一致。'
].join('\n');

function difficultyText(profile) {
  const list = (profile && profile.difficulties) || [];
  const texts = list.map(function (key) { return DIFFICULTY_TEXT[key]; }).filter(Boolean);
  return texts.length ? texts.join('；') : '暂未说明具体动作难点，请按常见情况给出通用判断';
}

function whoText(profile) {
  return (profile && profile.who) || '家人';
}

const IMAGE_PLACEHOLDER = 'data:image/jpeg;base64,PLACEHOLDER';

function buildMessages(profile, withImage) {
  const userText = [
    '请分析这件衣服对下面这位家人来说好不好穿。',
    '',
    '穿衣对象：' + whoText(profile),
    '动作比较费劲的地方：' + difficultyText(profile),
    '',
    '请根据照片中这件衣服的结构判断，并把不确定的信息整理成需要向商家确认的问题。',
    '如果照片不够清晰，请在 summary 中说明哪些部位看不清，仍按可见部分给出判断。'
  ].join('\n');

  if (!withImage) {
    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userText }
    ];
  }

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: userText },
        { type: 'text', text: '照片见下（这件衣服）：' },
        { type: 'image_url', image_url: { url: IMAGE_PLACEHOLDER } }
      ]
    }
  ];
}

function attachImage(messages, dataUri) {
  const copy = messages.slice();
  const last = copy[copy.length - 1];
  const content = Array.isArray(last.content)
    ? last.content.slice()
    : [{ type: 'text', text: last.content }];

  const slot = content.findIndex(function (part) {
    return part && part.type === 'image_url' && part.image_url && part.image_url.url === IMAGE_PLACEHOLDER;
  });

  if (slot >= 0) {
    content[slot] = { type: 'image_url', image_url: { url: dataUri } };
  } else {
    content.push({ type: 'image_url', image_url: { url: dataUri } });
  }

  copy[copy.length - 1] = { role: last.role, content: content };
  return copy;
}

module.exports = {
  SYSTEM_PROMPT,
  DIFFICULTY_TEXT,
  IMAGE_PLACEHOLDER,
  buildMessages,
  attachImage
};
