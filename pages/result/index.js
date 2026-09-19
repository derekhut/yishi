const store = require('../../utils/store.js');
const format = require('../../utils/format.js');
const fallback = require('../../utils/fallback-analysis.js');
const config = require('../../utils/config.js');
const theme = require('../../utils/theme.js');

const SOURCE_LABEL = {
  model: '真实分析',
  cache: '真实分析',
  fallback: '示例数据',
  'local-fallback': '示例数据'
};

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 2,
    loading: true,
    loadingTip: '正在一件一件地看这件衣服的好穿程度',
    analysis: null,
    dimsView: [],
    markersView: [],
    findings: [],
    scoreTone: 'warn',
    source: '',
    sampleNote: false,
    garmentImage: '/assets/garment-current.png',
    eyeCare: false,
    themeClass: '',
    ckColor: theme.THEME.light.ink
  },

  onLoad(query) {
    theme.applyTheme(this, wx);
    const profile = store.loadProfile(wx);
    if (!store.isValidProfile(profile)) {
      wx.redirectTo({ url: '/pages/profile/index' });
      return;
    }
    this.profile = profile;

    const q = query || {};
    const isExample = String(q.example || '') === '1';
    const fileID = q.fileID ? decodeURIComponent(q.fileID) : '';

    this.setData({ who: profile.who, loading: true });
    this.loadAnalysis(fileID, isExample);
  },

  loadAnalysis(fileID, isExample) {
    const self = this;

    if (config.FORCE_EXAMPLE) {
      this.render(fallback.build(this.profile), 'local-fallback');
      return Promise.resolve({ source: 'local-fallback' });
    }

    return wx.cloud.callFunction({
      name: config.ANALYZE_FUNCTION || 'analyze',
      data: {
        fileID: fileID,
        profile: this.profile
      }
    }).then(function (res) {
      const result = res && res.result;
      if (!result || result.ok !== true || !result.analysis) {
        throw new Error((result && result.message) || '云函数返回异常');
      }
      self.render(result.analysis, result.source || 'model');
      return result;
    }).catch(function (err) {
      const reason = (err && (err.errMsg || err.message)) || '未知错误';
      console.error('[衣适] 分析失败，改用本地示例数据：', reason);
      self.render(fallback.build(self.profile), 'local-fallback');
      return { source: 'local-fallback', reason: reason };
    });
  },

  render(analysis, source) {
    const isSample = source !== 'model' && source !== 'cache';
    this.setData({
      loading: false,
      analysis: analysis,
      dimsView: format.dimsView(analysis.dims),
      markersView: format.markersView(analysis.markers),
      findings: format.findingsView(analysis.findings),
      scoreTone: format.scoreTone(analysis.score),
      source: source,
      sourceLabel: SOURCE_LABEL[source] || '示例数据',
      sampleNote: isSample
    });
    store.saveAnalysis(wx, analysis);
  },

  onRetry() {
    if (this.data.analysis) {
      this.setData({ loading: true });
      this.loadAnalysis('', false);
      return;
    }
    wx.showToast({ title: '还在分析中，请稍候', icon: 'none' });
  },

  onConfirm() {
    if (!this.data.analysis) {
      wx.showToast({ title: '分析还没完成', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/confirm/index' });
  },

  onIdeal() {
    if (!this.data.analysis) {
      wx.showToast({ title: '分析还没完成', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/ideal/index' });
  }
});
