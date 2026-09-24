const store = require('../../utils/store.js');
const upload = require('../../utils/upload.js');
const theme = require('../../utils/theme.js');

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 1,
    previewPath: '',
    fileID: '',
    uploading: false,
    uploadFailed: false,
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
    this.setData({ who: profile.who });
  },

  onChoose() {
    const self = this;

    return wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed']
    }).then(function (res) {
      const filePath = res.tempFiles[0].tempFilePath;
      self.setData({ previewPath: filePath, fileID: '', uploadFailed: false });
      return self.doUpload(filePath, '正在上传');
    }).catch(function (err) {
      const msg = (err && err.errMsg) || '';
      if (msg.indexOf('cancel') >= 0) {
        self.setData({ uploading: false });
        return;
      }
      self.reportUploadError(err);
    });
  },

  doUpload(filePath, loadingTitle) {
    const self = this;
    this.setData({ uploading: true, uploadFailed: false });
    wx.showLoading({ title: loadingTitle || '正在上传' });

    return upload.uploadImage(wx, filePath).then(function (res) {
      wx.hideLoading();
      self.setData({ fileID: res.fileID, uploading: false, uploadFailed: false });
      return res;
    }).catch(function (err) {
      wx.hideLoading();
      self.setData({ uploading: false, uploadFailed: true });
      throw err;
    });
  },

  reportUploadError(err) {
    const hint = (err && err.hint) || '请重试';
    const raw = (err && err.message) || String(err || '');
    console.error('[add] 图片上传失败：', raw, '| 建议：', hint);
    wx.showToast({ title: '上传失败，' + hint, icon: 'none', duration: 3000 });
  },

  onAnalyze() {
    const self = this;

    if (this.data.fileID) {
      this.goResult(this.data.fileID);
      return;
    }

    if (!this.data.previewPath) {
      wx.showToast({ title: '先拍一张照片', icon: 'none' });
      return;
    }

    return this.doUpload(this.data.previewPath, '正在重新上传').then(function (res) {
      self.goResult(res.fileID);
    }).catch(function (err) {
      self.reportUploadError(err);
    });
  },

  goResult(fileID) {
    wx.navigateTo({
      url: '/pages/result/index?fileID=' + encodeURIComponent(fileID)
    });
  },

  onExample() {
    wx.navigateTo({ url: '/pages/result/index?example=1' });
  }
});
