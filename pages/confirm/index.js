const store = require('../../utils/store.js');
const format = require('../../utils/format.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 3,
    loaded: false,
    questions: [],
    script: '',
    idealScript: '',
    tryOn: [],
    eyeCare: false,
    themeClass: '',
    ckColor: theme.THEME.light.ink
  },

  onLoad() {
    theme.applyTheme(this, wx);
    const profile = store.loadProfile(wx);
    if (!store.isValidProfile(profile)) {
      wx.redirectTo({ url: '/pages/profile/index' });
      return;
    }

    // 用完整记录，并校验它还是不是「这个人的」。
    // 照片标识下游无从知道（只有结果页 query 里有），换了照片会走 add → result
    // 重新分析并覆盖这条记录，所以这里实际比对的是资料。
    const record = store.loadRecord(wx);
    if (!record || !store.isCompatibleRecord(record, { fileID: record.fileID, profile: profile })) {
      wx.redirectTo({ url: '/pages/add/index' });
      return;
    }
    this.record = record;

    const analysis = record.analysis;

    const questions = (analysis.questions || []).map(function (item, index) {
      return {
        index: format.indexLabel(index),
        title: item.title,
        detail: item.detail
      };
    });

    const tryOn = (analysis.tryOn || []).map(function (text) {
      return { text: text, checked: false };
    });

    this.setData({
      who: profile.who,
      loaded: true,
      questions: questions,
      script: analysis.script || '',
      idealScript: analysis.idealScript || '',
      tryOn: tryOn
    });
  },

  onCopyScript() {
    if (!this.data.script) {
      wx.showToast({ title: '还没有可复制的内容', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.script,
      success: function () {
        wx.showToast({ title: '话术已复制，发给客服即可', icon: 'none' });
      },
      fail: function () {
        wx.showToast({ title: '复制失败，请长按选择', icon: 'none' });
      }
    });
  },

  onCopyIdealScript() {
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

  // 勾选状态由原生 checkbox-group 维护，这里只把结果同步回视图模型。
  // e.detail.value 是选中项 value 组成的字符串数组（value 绑的是下标）。
  onTryChange(e) {
    const picked = (e && e.detail && e.detail.value) || [];
    const tryOn = this.data.tryOn.map(function (item, index) {
      return { text: item.text, checked: picked.indexOf(String(index)) >= 0 };
    });
    this.setData({ tryOn: tryOn });
  },

  onAgain() {
    wx.redirectTo({ url: '/pages/add/index' });
  },

  onIdeal() {
    wx.navigateTo({ url: '/pages/ideal/index' });
  }
});
