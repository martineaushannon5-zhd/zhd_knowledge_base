# Zhd Knowledge Base

本地优先个人知识库与Agent约束层。Windows桌面交互原型已在 `spike/electron/` 实现；正式数据层、SQLite全文索引与安装包待完成。Web后置，鸿蒙纳入后续评估。

## 查看当前原型

在 `spike/electron/` 运行 `npm run dev`，浏览器访问 `http://127.0.0.1:5173`。独立桌面运行 `npm run build` 后 `npm run electron:preview`。验证命令为 `npm run test:storage`、`npm run test:ui`、`npm run test:login`。

本地默认首页现为粒子螺旋登录页；`#/login` 显示登录页，`#/workspace` 保留原型工作台。登录服务尚未接入，表单不会验证身份、发送或保存凭证；“体验工作台”是公开演示入口，不是登录成功或访问保护。此登录页改动尚未重新部署到线上。

浏览器使用localStorage，桌面使用应用目录中的原型JSON，数据彼此独立；不要作为重要资料的唯一副本。内置内容为示例；实际执行证据及未完成项见T-001任务卡。

## 线上预览

浏览器预览版已部署到 https://know.zhdstudy.cloud （部署细节见 `KB-人读.md` F-008）。更新线上版本：在 `spike/electron/` 运行 `npm run build`，再把 `dist/` 内容同步到服务器 `/www/wwwroot/zhd-know/dist`（属主 `www`）。静态文件更新无需重载 Nginx。

## 入口

| 文件 | 用途 |
|---|---|
| `AGENT-规则.md` | 所有Agent统一工作方式；按需读取、简明汇报、明确权限 |
| `KB-人读.md` | 当前状态与关键事实 |
| `KB-待更新.md` | 待确认事项和更新记录 |
| `docs/tech-selection.md` | 顾问推荐技术基线与取舍 |
| `docs/实施路线与Agent提示词.md` | 验收节点、每步技术栈、可复制提示词 |
| `docs/decisions.md` | 决策及待确认推荐 |
| `cards/任务/T-001-桌面壳选型.md` | 下一步：Electron Windows最小验证 |
| `templates/`、`工作流/` | 按需任务模板与执行证据 |

## 当前推荐

Electron + TypeScript + React/Vite + CodeMirror6；Markdown/JSON/附件为真相源，SQLite FTS5为可重建索引；Vitest/Playwright验证，electron-builder NSIS分发。尚未验证具体版本兼容性、中文分词库、性能与安装包。

## 实施顺序

Windows验证 → 数据与备份 → 捕获/编辑/搜索 → Agent交接 → 基础AI → Windows交付。以验收节点推进，不按周排期；AI和鸿蒙选型不阻塞本地数据底座。

先读规则、当前任务和相关章节，不默认读全库。纯咨询无需任务卡，小修改使用明确请求，多步实现按任务卡交接。报告如实记录实际验证，不为格式虚构问题。
