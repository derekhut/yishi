const store = require('../../utils/store.js');

const OPTION_META = [
  { key: 'buttons', title: '扣扣子、拉拉链', desc: '手指不太灵活，捏握小东西费劲' },
  { key: 'liftArm', title: '抬手、套头穿衣', desc: '肩膀活动不便，穿脱上衣费劲' },
  { key: 'bend', title: '弯腰、抬腿穿裤袜', desc: '腰、髋或膝部活动不便' }
];

function buildOptions(selected) {
  const list = selected || [];
  return OPTION_META.map(function (meta) {
    return {
      key: meta.key,
      title: meta.title,
      desc: meta.desc,
      selected: list.indexOf(meta.key) >= 0
    };
  });
}

Page({
  data: {
    who: store.DEFAULT_WHO,
    steps: [0, 1, 2, 3],
    currentStep: 0,
    options: buildOptions([])
  },

  onLoad() {
    const profile = store.loadProfile(wx) || store.defaultProfile();
    this.setData({
      who: profile.who,
      options: buildOptions(profile.difficulties)
    });
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
  }
});
