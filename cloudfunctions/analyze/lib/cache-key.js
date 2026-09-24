/**
 * 缓存键：把所有**会影响输出**的资料都算进去。
 *
 * 只放 fileID 是不够的：话术里写着「给妈妈穿」，资料快照里的称呼一变，
 * 同一张照片应该得到另一份结果，不能命中上一个人的缓存
 * （TODO 里 T03 的验收项：「改变称呼不命中旧话术」）。
 *
 * 抽成单独一个文件是因为它是纯逻辑 —— 命中与否在界面上看不出来，
 * 只能靠脚本逐条喂（tests/check-cache-key.js）。
 */

function buildCacheId(fileID, profile) {
  const who = (profile && typeof profile.who === 'string') ? profile.who : '';
  const difficulties = ((profile && profile.difficulties) || []).slice().sort().join('-');
  const raw = String(fileID || 'example') + '|' + who + '|' + difficulties;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) % 2147483647;
  }
  // 云数据库 doc id 不能以数字开头
  return 'a' + hash;
}

module.exports = { buildCacheId };
