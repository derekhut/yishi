/**
 * 结果页「没有」的三种说法 —— 必须是三句不同的话。
 *
 * 混成一句就把诚实这条规矩丢了。三种「没有」的含义完全不同：
 *   1. 模型看了照片，**没看出**难穿的点     → 可以说，但要说清是「这张照片里没看出」
 *   2. **这次没读出来**（失败/超时/没图）   → 不能给出任何结论，给重试和换一张
 *   3. 看出了一些，但**把握不够**，先不标   → 不能说「没问题」
 *
 * 第 2、3 种最容易混：都会表现为「界面上什么都没标出来」，
 * 但一个是"这次失败了"，一个是"模型觉得不确定"，后续动作完全不同。
 *
 * 这个模块是纯逻辑（不碰 wx、不碰界面），所以能逐条喂、逐条断言。
 */

/**
 * @param {object} input
 * @param {boolean} input.ok        云函数是否成功
 * @param {string}  input.source    model / example / failed
 * @param {object}  input.analysis  分析结果（失败时为 null）
 * @param {boolean} input.uncertain 有结论但把握不够（置信度筛掉）
 * @param {string}  input.reason    失败原因
 */
function describeOutcome(input) {
  const data = input || {};
  const analysis = data.analysis || null;

  // 1) 失败：连结果都没有，什么都不许说
  if (data.ok === false || !analysis) {
    return {
      kind: 'failed',
      title: '这次没分析出来',
      detail: '照片没能读明白，所以不给你看任何分数 —— 换一张清楚点的，或者再试一次。',
      reason: data.reason || '',
      actions: [
        { key: 'retry', label: '再试一次' },
        { key: 'reselect', label: '换一张照片' }
      ]
    };
  }

  // 2) 有结论但把握不够：不能说「没问题」
  if (data.uncertain) {
    return {
      kind: 'uncertain',
      title: '有几处它不太确定，先不下结论',
      detail: '照片上有几处看不太清楚，这些地方先不打分，也不标在图上。',
      reason: '',
      actions: [
        { key: 'reselect', label: '换一张清楚点的' }
      ]
    };
  }

  // 3) 真实结果里没有「需要注意」的项：说清是「这张照片里没看出」
  const findings = Array.isArray(analysis.findings) ? analysis.findings : [];
  const warns = findings.filter(function (f) { return f && f.type === 'warn'; });
  if (data.source === 'model' && warns.length === 0) {
    return {
      kind: 'no-problem',
      title: '这张照片里没看出明显的难穿点',
      detail: '只代表照片上看得见的部分 —— 手感、尺码这些照片看不出来，买之前还是要问一句。',
      reason: '',
      actions: [
        { key: 'reselect', label: '换一张照片' }
      ]
    };
  }

  return { kind: 'result', title: '', detail: '', reason: '', actions: [] };
}

const SOURCE_LABEL = {
  model: '真实分析',
  cache: '真实分析',
  example: '示例数据',
  'local-fallback': '示例数据',
  failed: '这次没分析出来'
};

/** 示例数据必须在界面上被认出来 —— 它不是真实结果 */
function isSampleSource(source) {
  return source !== 'model' && source !== 'cache' && source !== 'failed';
}

module.exports = {
  describeOutcome,
  SOURCE_LABEL,
  isSampleSource
};
