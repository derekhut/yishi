const store = require('../../utils/store.js');

// 左栏最多列 3 条，再多就成了信息墙，反而看不清重点。
const MAX_FACTS = 3;

// 模型偶尔会漏掉 index 字段，这里统一兜底成 1、2、3……
function featureLabel(feature, position) {
  const raw = feature && feature.index;
  const n = Number(raw);
  if (isFinite(n) && n > 0) return String(Math.round(n));
  return String(position + 1);
}

function featuresView(list) {
  const array = Array.isArray(list) ? list : [];
  return array.map(function (item, position) {
    const feature = item || {};
    return {
      index: featureLabel(feature, position),
      title: feature.title || '',
      detail: feature.detail || ''
    };
  });
}

function factsView(findings) {
  const array = Array.isArray(findings) ? findings : [];
  return array.slice(0, MAX_FACTS).map(function (item) {
    const finding = item || {};
    return {
      type: finding.type === 'warn' ? 'warn' : 'good',
      title: finding.title || ''
    };
  });
}

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 3,
    loaded: false,
    garmentName: '',
    score: '—',
    imageCurrent: '/assets/garment-current.png',
    imageIdeal: '/assets/garment-ideal.png',
    currentFacts: [],
    idealFeatures: [],
    idealGap: '',
    idealScript: ''
  },

  onLoad() {
    const profile = store.loadProfile(wx);
    if (!store.isValidProfile(profile)) {
      wx.redirectTo({ url: '/pages/profile/index' });
      return;
    }

    const analysis = store.loadAnalysis(wx);
    if (!analysis) {
      wx.redirectTo({ url: '/pages/add/index' });
      return;
    }

    this.analysis = analysis;

    const garment = analysis.garment || {};
    const idealFeatures = featuresView(analysis.idealFeatures);

    this.setData({
      who: profile.who,
      loaded: true,
      garmentName: garment.name || '这件衣服',
      score: typeof analysis.score === 'number' ? analysis.score : '—',
      currentFacts: factsView(analysis.findings),
      idealFeatures: idealFeatures,
      idealGap: analysis.idealGap || '',
      idealScript: analysis.idealScript || ''
    });
  },

  onCopyScript() {
    if (!this.data.idealScript) {
      wx.showToast({ title: '还没有可复制的内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.idealScript,
      success: function () {
        wx.showToast({ title: '话术已复制，发给客服即可', icon: 'none' });
      },
      fail: function () {
        wx.showToast({ title: '复制失败，请长按选择', icon: 'none' });
      }
    });
  },

  onConfirm() {
    if (!this.data.loaded) {
      wx.showToast({ title: '还没有分析结果', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/confirm/index' });
  },

  onBack() {
    wx.navigateBack({ delta: 1 });
  }
});
