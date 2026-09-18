const IMAGE_DIR = 'yishi/';

function extOf(filePath) {
  const match = /\.(\w+)$/.exec(filePath || '');
  return match ? match[1].toLowerCase() : 'jpg';
}

function buildCloudPath(filePath, now, rand) {
  const stamp = now || Date.now();
  const random = rand || Math.random().toString(36).slice(2, 8);
  return IMAGE_DIR + stamp + '-' + random + '.' + extOf(filePath);
}

function normalizeError(err) {
  const raw = (err && (err.errMsg || err.message)) || String(err || '未知错误');
  let hint = '请重试';
  if (/cloud|env|environment/i.test(raw)) hint = '请确认云开发已开通并填入环境 ID';
  else if (/network|timeout|请求超时/i.test(raw)) hint = '请检查网络后重试';
  else if (/permission|denied|权限/i.test(raw)) hint = '请检查云存储权限设置';
  return { raw: raw, hint: hint };
}

function uploadImage(wxApi, filePath) {
  return wxApi.cloud.uploadFile({
    cloudPath: buildCloudPath(filePath),
    filePath: filePath
  }).then(function (res) {
    if (!res || !res.fileID) {
      return Promise.reject({ errMsg: '上传返回缺少 fileID' });
    }
    return res;
  }).catch(function (err) {
    const info = normalizeError(err);
    const e = new Error(info.raw);
    e.hint = info.hint;
    throw e;
  });
}

module.exports = {
  IMAGE_DIR,
  extOf,
  buildCloudPath,
  normalizeError,
  uploadImage
};
