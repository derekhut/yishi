const store = require('../../utils/store.js');
const format = require('../../utils/format.js');
const fallback = require('../../utils/fallback-analysis.js');
const config = require('../../utils/config.js');
const theme = require('../../utils/theme.js');
const state = require('../../utils/analyze-state.js');
const photo = require('../../utils/photo.js');

const SOURCE_LABEL = state.SOURCE_LABEL;

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
    outcome: { kind: 'result', title: '', detail: '', actions: [] },
    // 图上放的一定是这次分析用的那张照片：示例配配套图，真实配用户拍的那张
    photoSrc: '',
    photoKind: 'none',
    photoLoading: false,
    photoFailed: false,
    markerCaption: '',
    eyeCare: false,
    themeClass: '',
    ckColor: theme.THEME.light.ink
  },

  onLoad(query) {
    theme.applyTheme(this, wx);

    const q = query || {};
    const isExample = String(q.example || '') === '1';
    const fileID = q.fileID ? decodeURIComponent(q.fileID) : '';

    if (isExample) {
      // 看示例不该被资料表单挡住，也不该改动用户自己的资料（不写 storage）
      this.profile = store.SAMPLE_PROFILE;
    } else {
      const profile = store.loadProfile(wx);
      if (!store.isValidProfile(profile)) {
        wx.redirectTo({ url: '/pages/profile/index' });
        return;
      }
      this.profile = profile;
    }

    // 重试要用的还是原来那张照片，不能丢了 fileID 去重新分析一张空的
    this.fileID = fileID;

    this.setData({ who: this.profile.who, loading: true });
    this.loadAnalysis(fileID, isExample);
  },

  loadAnalysis(fileID, isExample) {
    const self = this;

    // 示例模式：用户主动要看示例，是合法的一条路（界面会写明「示例数据」）
    if (config.FORCE_EXAMPLE || isExample) {
      this.render(fallback.build(this.profile), 'example');
      return Promise.resolve({ source: 'example' });
    }

    return wx.cloud.callFunction({
      name: config.ANALYZE_FUNCTION || 'analyze',
      data: {
        fileID: fileID,
        profile: this.profile
      }
    }).then(function (res) {
      const result = res && res.result;
      // 云函数说失败就是失败：不把示例数据拿来顶上
      if (!result || result.ok !== true || !result.analysis) {
        self.showOutcome({
          ok: false,
          source: (result && result.source) || 'failed',
          analysis: null,
          reason: (result && result.reason) || '云函数返回异常'
        });
        return result;
      }
      self.render(result.analysis, result.source || 'model');
      return result;
    }).catch(function (err) {
      const reason = (err && (err.errMsg || err.message)) || '未知错误';
      console.error('[result] 分析失败（不改用示例数据）：', reason);
      self.showOutcome({ ok: false, source: 'failed', analysis: null, reason: reason });
      return { source: 'failed', reason: reason };
    });
  },

  showOutcome(input) {
    const out = state.describeOutcome(input);
    this.setData({
      loading: false,
      analysis: null,
      outcome: out,
      source: 'failed',
      sourceLabel: state.SOURCE_LABEL.failed,
      photoSrc: '',
      photoLoading: false,
      photoFailed: false,
      markersView: []
    });
  },

  /**
   * 照片与标注一起上：照片没显示出来就不画标注，
   * 免得几个点飘在占位块上，像是标到了什么东西。
   */
  applyPhoto(view, markers) {
    const src = view.src || '';
    const shown = src ? markers : [];
    this.setData({
      photoKind: view.kind,
      photoSrc: src,
      markersView: shown,
      markerCaption: format.markerCaption(shown, !!src)
    });
  },

  loadPhoto(source, markers) {
    const self = this;
    const view = photo.resolvePhoto({ source: source, fileID: this.fileID });
    this.setData({ photoLoading: view.kind === 'file' });
    this.applyPhoto(view, markers);

    if (view.kind !== 'file') return Promise.resolve(null);

    return photo.fetchPhotoUrl(wx, view.fileID).then(function (url) {
      self.setData({ photoLoading: false, photoFailed: !url });
      // 取不回来就空着：不换成配套图，那是另一件衣服
      self.applyPhoto(url ? { kind: view.kind, src: url, fileID: view.fileID } : view, markers);
      return url;
    });
  },

  render(analysis, source) {
    const isSample = state.isSampleSource(source);
    // 真实结果里一条「需要注意」都没有时，说清是「这张照片里没看出」
    const outcome = state.describeOutcome({
      ok: true,
      source: source,
      analysis: analysis
    });
    const markers = format.markersView(analysis.markers);
    this.setData({
      loading: false,
      analysis: analysis,
      dimsView: format.dimsView(analysis.dims),
      markersView: [],
      findings: format.findingsView(analysis.findings),
      scoreTone: format.scoreTone(analysis.score),
      source: source,
      sourceLabel: SOURCE_LABEL[source] || '示例数据',
      sampleNote: isSample,
      outcome: outcome
    });
    this.loadPhoto(source, markers);

    // 存的是完整记录（来源、照片、资料快照、时间、版本），下游页面靠它判断还能不能用
    store.saveRecord(wx, {
      analysis: analysis,
      source: source,
      fileID: this.fileID || '',
      profile: this.profile
    });
  },

  onRetry() {
    if (this.data.loading) {
      wx.showToast({ title: '还在分析中，请稍候', icon: 'none' });
      return;
    }
    this.setData({ loading: true, photoFailed: false });
    this.loadAnalysis(this.fileID || '', false);
  },

  onReselect() {
    wx.redirectTo({ url: '/pages/add/index' });
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
