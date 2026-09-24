const store = require('../../utils/store.js');
const theme = require('../../utils/theme.js');

const OPTION_META = [
  { key: 'buttons', title: '扣扣子、拉拉链', icon: '/assets/icon-buttons.png' },
  { key: 'liftArm', title: '抬手、套头穿衣', icon: '/assets/icon-liftarm.png' },
  { key: 'bend', title: '弯腰、抬腿穿裤袜', icon: '/assets/icon-bend.png' }
];

function buildOptions(selected) {
  const list = selected || [];
  return OPTION_META.map(function (meta) {
    return {
      key: meta.key,
      title: meta.title,
      icon: meta.icon,
      selected: list.indexOf(meta.key) >= 0
    };
  });
}

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 0,
    options: buildOptions([]),
    eyeCare: false,
    themeClass: '',
    ckColor: theme.THEME.light.ink,
    switchOnColor: theme.THEME.light.switchOn
  },

  onLoad() {
    theme.applyTheme(this, wx);
    const profile = store.loadProfile(wx) || store.defaultProfile();
    this.setData({
      who: profile.who,
      options: buildOptions(profile.difficulties)
    });
  },

  // 护眼模式开关：存起来（下次进来还是这个状态），并立刻生效。
  onEyeChange(e) {
    const on = theme.setEyeCare(wx, e.detail.value);
    theme.applyTheme(this, wx);
    wx.showToast({ title: on ? '护眼模式已开启' : '已恢复普通模式', icon: 'none' });
  },

  // 多选状态交给原生 checkbox-group 维护，这里只把选中结果同步回视图模型。
  // e.detail.value 是选中项 value（绑的是 key）组成的字符串数组。
  onChange(e) {
    const picked = (e && e.detail && e.detail.value) || [];
    const options = this.data.options.map(function (item) {
      return Object.assign({}, item, { selected: picked.indexOf(item.key) >= 0 });
    });
    this.setData({ options: options });
  },

  onNext() {
    const difficulties = this.data.options
      .filter(function (item) { return item.selected; })
      .map(function (item) { return item.key; });

    if (difficulties.length === 0) {
      wx.showToast({ title: '请至少选一项', icon: 'none' });
      return;
    }

    store.saveProfile(wx, { who: this.data.who, difficulties: difficulties });
    wx.navigateTo({ url: '/pages/add/index' });
  },

  // 首屏就能看到东西：不想先填表单的人（演示时的评委也是）点这里直接看示例。
  // 示例资料不写进 storage，所以不会盖掉用户自己的设置。
  onSample() {
    wx.navigateTo({ url: '/pages/result/index?example=1' });
  }
});
