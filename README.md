# 衣适 · 帮行动不便的人买到「穿得自在」的衣服

高中生黑客松项目。本 README 将在任务 8 补全部署文档；当前为骨架阶段占位。

## 快速开始

1. 用微信开发者工具「导入项目」打开本目录
2. 将 `project.config.json` 中的 `appid` 替换为你注册的 AppID
3. 骨架阶段页面尚未实现完整交互，按任务推进逐步交付

## 目录

- `pages/` 五个页面：profile（穿衣需求）→ add（拍照上传）→ result（好穿指数）→ confirm（购买确认）→ ideal（理想款对比）
- `cloudfunctions/analyze/` 核心分析云函数（任务 4 实现）
- `tests/` Node 结构检查脚本，可在本地直接运行
