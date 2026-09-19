// 护眼模式主题工具。
// 思路：颜色全部走 CSS 变量，开关只负责两件事——
//   1) 给页面根节点换上 .theme-warm 类（变量整体变暖）；
//   2) 把原生导航栏/窗口背景同步成暖色（这两处 CSS 够不着）。
const store = require('./store.js');

const THEME = {
  light: {
    navBar: '#FFFFFF',
    windowBg: '#FFFFFF',
    ink: '#1A1A1A',
    switchOn: '#1A1A1A'
  },
  warm: {
    navBar: '#F7F1E3',
    windowBg: '#F7F1E3',
    ink: '#3B3020',
    switchOn: '#B06A28'
  }
};

function isEyeCare(wxApi) {
  return store.loadSettings(wxApi).eyeCare === true;
}

// 读取设置并把主题应用到页面：写入 eyeCare / themeClass / ckColor 三个数据字段。
function applyTheme(page, wxApi) {
  const eyeCare = isEyeCare(wxApi);
  const colors = eyeCare ? THEME.warm : THEME.light;
  page.setData({
    eyeCare: eyeCare,
    themeClass: eyeCare ? 'theme-warm' : '',
    ckColor: colors.ink,
    switchOnColor: colors.switchOn
  });
  try {
    wxApi.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: colors.navBar
    });
  } catch (err) {
    // 测试环境的 wx mock 可能没有这个方法，忽略即可
  }
  try {
    wxApi.setBackgroundColor({ backgroundColor: colors.windowBg });
  } catch (err) {
    // 同上
  }
  return eyeCare;
}

function setEyeCare(wxApi, value) {
  store.saveSettings(wxApi, { eyeCare: value === true });
  return value === true;
}

module.exports = {
  THEME,
  isEyeCare,
  applyTheme,
  setEyeCare
};
