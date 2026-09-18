const config = require('./utils/config.js');

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库版本过低，请升级至 2.2.3 以上以使用云能力');
      return;
    }
    const options = { traceUser: true };
    if (config.CLOUD_ENV) options.env = config.CLOUD_ENV;
    wx.cloud.init(options);
  },
  globalData: {
    profileKey: 'yishi_profile'
  }
});
