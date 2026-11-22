# 双语配方数据格式

一份配方一个 UTF-8 JSON 文件，文件名与网页锚点 `id` 相同。27 份配方的中文、英文视图都从 JSON 渲染。`index.json` 列出首页顺序；新增配方需要创建文件并把 ID 加入索引。

- `zh`、`en` 是并列的语言内容。翻译未完成时用 `null`，显示端回退中文并明确标示；不得自动编造步骤。
- `amount` 保存原记录的数量字符串；如果数量含需翻译的单位（如「勺」），改用 `{ "zh": "1 勺", "en": "1 spoonful" }`。不清楚的单位另用 `detail` 和 `certainty: "unconfirmed"` 说明，不要把推测写成确定用量。
- `scale` 声明模具、批量或面粉基准。只有另有 `quantity` 的食材参与计算；`quantity` 可以是克数、范围、分项或面粉百分比。某个备选／试做记录不应随当前配方缩放时，在该 `section` 加 `scalable: false`。保留原文供核对。
- `category`、`status` 与网站筛选值一致；`displayStatus` 保存两种语言的可见状态标签；`id` 和 `legacyAnchor` 保持现有 URL 锚点。
- `photos` 预留图片路径、说明和替代文字；`trials` 预留试做日期、调整和心得。公开仓库只收录适合公开的照片和笔记。
- 网页用 DOM `textContent` 渲染用户文字，避免把笔记作为 HTML 直接插入。网页加载依赖 JavaScript；JSON 读取失败时会显示错误提示。

格式示例：`black-sesame-toast.json`。全部 27 份 JSON 已做语法、ID、分类状态、中英文内容完整性及食材条目数量校验。翻译仍应随原配方修订同步复核；网页切换与搜索需在发布后验证。
