// 全局配置：部署时只需改这里
module.exports = {
  // 云开发环境 ID。在开发者工具「云开发」控制台的环境设置里可以看到。
  // 留空则使用默认环境（多环境时容易调错，建议显式填写）。
  CLOUD_ENV: 'cloudbase-d5g2ft0mxecf87f08',

  // analyze 云函数名
  ANALYZE_FUNCTION: 'analyze',

  // 是否使用内置示例数据直接演示（不调用模型，适合无网络/无 key 的彩排）
  // 设为 true 时，result 页始终走示例数据
  FORCE_EXAMPLE: false
};
