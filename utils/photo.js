/**
 * 结果页／对比页要显示的那张照片（T04）。
 *
 * T00 侦察定下来的表达方式是「原图 + 部位名称 + 依据」，所以图上放的一定是
 * **这次分析用的那张照片**。这里守住两条最容易出错的界线：
 *
 *   1. 示例结论配的是配套图 —— 不能拿着用户拍的照片去配示例话术，
 *      那等于把「我们编的示例」说成「看了你的衣服得出的结论」。
 *   2. 原图取不回来时不回退成配套图 —— 配套图是另一件衣服，
 *      挂上去等于换掉了用户问的那件。
 *
 * 标注同理：照片没显示出来就不画标注，坐标没给全就不画那个点。
 * 宁可少画，也不画一个指向别处或指向空气的标记。
 */

const state = require('./analyze-state.js');

/** 示例配套的款式图（真实结果一律不用它） */
const SAMPLE_IMAGE = '/assets/garment-current.png';

/**
 * @param {object} input
 * @param {string} input.source model / cache / example / fallback …
 * @param {string} input.fileID 云存储里的照片标识
 * @returns {{kind: 'file'|'asset'|'none', src: string, fileID: string, isSample: boolean}}
 */
function resolvePhoto(input) {
  const data = input || {};
  const isSample = state.isSampleSource(data.source);
  const fileID = String(data.fileID || '');

  // 示例：只看配套图，连 fileID 都不留，省得后面手滑又去取真实照片
  if (isSample) {
    return { kind: 'asset', src: SAMPLE_IMAGE, fileID: '', isSample: true };
  }
  if (fileID) {
    return { kind: 'file', src: '', fileID: fileID, isSample: false };
  }
  return { kind: 'none', src: '', fileID: '', isSample: false };
}

/**
 * 云存储 fileID → 能直接塞进 <image src> 的临时链接。
 * 取不回来返回 null，由页面显示占位 —— 不抛给调用方，也不换成别的图。
 */
function fetchPhotoUrl(wxApi, fileID) {
  const id = String(fileID || '');
  if (!id) return Promise.resolve(null);
  const cloud = wxApi && wxApi.cloud;
  if (!cloud || typeof cloud.getTempFileURL !== 'function') return Promise.resolve(null);

  return cloud.getTempFileURL({ fileList: [id] }).then(function (res) {
    const list = (res && res.fileList) || [];
    let hit = null;
    list.forEach(function (item) {
      if (item && item.fileID === id) hit = item;
    });
    if (!hit) hit = list[0];
    const url = hit && hit.tempFileURL;
    return typeof url === 'string' && url ? url : null;
  }).catch(function (err) {
    // 记下来但不吞成「成功」：调用方拿到 null，界面给占位
    console.error('[photo] 原图取回失败：', (err && (err.errMsg || err.message)) || err);
    return null;
  });
}

module.exports = {
  SAMPLE_IMAGE,
  resolvePhoto,
  fetchPhotoUrl
};
