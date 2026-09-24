# 穿的顺

帮行动不便的人挑**「好穿」**的衣服 —— 不是挑好看的。

拍一张衣服的照片，我们判断它的**结构**：开合方式、领口、袖口、门襟、裤腰、松紧、材质弹性。
不评价款式、颜色、美丑。出来的分数是**「对这个人」的参考值**，按他自己勾选的动作难点加权 ——
同一件衣服换个人，分数会变。

原生微信小程序 + 微信云开发。高中生黑客松项目。

---

## 快速开始

```bash
node tests/run-all.js      # 全部检查：每行都要显示「0 失败」
```

跑小程序本体：用**微信开发者工具**「导入项目」打开本目录，AppID 填 `wx5b899ef4f7bef91e`，
后端服务选**微信云开发**。点「编译」就能看到界面。

> 第一次上手、或者中途加入，看 [docs/rebuild-from-scratch.md](docs/rebuild-from-scratch.md)。
> 不想读长文、只想照着做完，看下面那张「哪里找什么」。

---

## 部署事实

| 项 | 值 | 在哪 |
|---|---|---|
| AppID | `wx5b899ef4f7bef91e` | `project.config.json` |
| 云开发环境 ID | `cloudbase-d5g2ft0mxecf87f08` | `utils/config.js` |
| 云函数 | `analyze` | `cloudfunctions/analyze/` |

**还没配的两件事**（没配也能跑，会自动退回示例数据）：

1. 云函数环境变量 `MODEL_BASE_URL` / `MODEL_API_KEY` / `MODEL_NAME` —— 不配就一直走示例数据，真实模型调不通
2. 数据库集合 `analyses` —— 用来缓存 24 小时内的分析结果。
   **现在还不用建**：只有真实分析成功才会写它，目前一直走兜底，碰不到这个集合

`utils/config.js` 里的 `FORCE_EXAMPLE` 是演示用的紧急开关（**当前是 `false`**）：
改成 `true` 就强制走内置示例数据，一行代码回到 100% 可控状态。**演示前一定要知道它在哪。**

---

## 目录

```
app.js / app.json / app.wxss     全局：配置 + 设计变量
project.config.json              AppID 在这里
utils/                           纯逻辑（能直接 require 进 Node 测试）
pages/                           profile → add → result → confirm → ideal
cloudfunctions/analyze/          核心分析云函数
assets/                          衣服示意图（SVG 源 + 生成的 PNG）、小程序头像
tools/                           构建与校验脚本
tests/                           check-*.js 检查套件 + run-all.js 汇总
docs/                            本项目专属文档
```

---

## 哪里找什么

| 你要做的事 | 看哪里 |
|---|---|
| **新同学第一天：按什么顺序做、做到什么样算完成** | [docs/handout-v1.md](docs/handout-v1.md) |
| 了解第一版交付范围与验收标准 | [docs/requirements-v1.md](docs/requirements-v1.md) |
| 按优先级推进后续开发 | [docs/todo.md](docs/todo.md) |
| 从零把这个项目做一遍（含每一步「为什么这么设计」） | [docs/rebuild-from-scratch.md](docs/rebuild-from-scratch.md) |
| 改提示词 | `cloudfunctions/analyze/lib/prompt.js`，改完跑 `node tools/export-prompt.js` |
| 只想看提示词全文 | [docs/prompt-for-model.md](docs/prompt-for-model.md)（**脚本生成，勿手改**） |
| 装环境 / 注册账号 / 加队友权限 / Git 协作 / 排错 / 答辩 | https://github.com/derekhut/miniprogram-onboarding-guide |

最后那份是**通用教程**，跟本项目无关的都在那儿 —— 换个小程序项目照样能用。
所以本项目只留「只对本项目成立」的东西，避免同一件事写两遍然后对不上。

---

## 四条硬规矩

改代码前先看这四条，踩过的坑都在里面。

1. **任何东西只保留一份真身。** 其余要么自动发现，要么从真身生成。
   写死的清单、写死的数字，迟早和现实对不上。
2. **红着不许往下走。** 每做一步先跑 `node tests/run-all.js`，每行都得是 `0 失败`。
3. **纯逻辑放 `utils/`，页面只管渲染。** 因为 `pages/` 依赖小程序环境、测不了；
   `utils/` 的纯函数能直接 `require` 进 Node 测试。
4. **错误不许吞掉。** 映射成可行动提示 + `console.error` 记原始错误 + 界面显示独立失败状态。
   用户看到的界面状态必须和真实状态一致。

另外两条只针对界面：

- **视觉只能黑白灰**，纯白背景，文字三档灰 `#1A1A1A` / `#6E6E6E` / `#A8A8A8`；
  语义色只有两个，且只用在结果页和对比页的圆点上：省力绿 `#3D7A5F`、注意琥珀 `#C77D2B`。
  主按钮是纯黑胶囊形，选中态用**描边**不用填充色块。
- **文案不许贴标签。** 界面里一律说「动作不太方便」，不出现疾病名称。
  `tests/check-skeleton.js` 第 [7] 组会扫全部 `wxml / wxss / js / json` 检查这条
  （排除 `node_modules`、`cloudfunctions`、`tests`；`docs/` 不参与，它不是界面文案）。

---

## 还没做的

- 让标注落在**用户自己拍的照片**上（现在标注叠在示意图上，而模型看的是照片 —— 口径不一致，
  走兜底示例看不出问题，真实调用会露馅）
- README 之外的端到端检查与交付收尾
