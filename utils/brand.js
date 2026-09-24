/**
 * 产品名的唯一来源（JS 侧）。
 *
 * ⚠️ 小程序名称**全平台唯一**，注册时写死，微信里给用户显示的就是它。
 * 这里和 `app.json` 的 `window.navigationBarTitleText` 必须**一字不差** ——
 * 差一个字，微信里显示注册名、界面标题里写的是另一个，演示时会被看出来。
 * 这一条没有脚本能守（本地文件不知道注册名），只能靠人核对一次。
 *
 * 改名要动的地方**只有两处**：
 *   1. 这个文件
 *   2. `app.json` 的 `window.navigationBarTitleText`
 *      （app.json 是纯 JSON，import 不进来，只能硬编码 —— 全项目唯一允许重复的地方）
 *
 * 成本对比：改这两处是 0 成本；改**注册名**要消耗每年 2 次改名机会之一
 * （发布前 2 次，发布后 2 次/年）。
 *
 * `OLD_NAMES` 是历史用过的名字，**只增不删**：它们在新名启用后必须彻底消失，
 * 少一个字都不行 —— 旧名留在文档里，读者会照着做（本项目就发生过：
 * 手册里的验收条目还写着旧名）。`tests/check-brand.js` 扫全项目守着这条。
 */

const APP_NAME = '穿的顺';

/** 历史名字，禁止在任何文件里再出现（含 .md 文档） */
const OLD_NAMES = ['衣适'];

module.exports = {
  APP_NAME: APP_NAME,
  OLD_NAMES: OLD_NAMES
};
