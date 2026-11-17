# 前端设计令牌

> 平台无关的设计底稿。桌面端先落地，Web/手机复用同一套 token。
> 顾问推荐 Electron + TypeScript + React + Vite + CodeMirror 6，尚未实测；视觉 token 不绑定框架。Agent 工作规则仅引用 `AGENT-规则.md`。

## 当前原型视觉方向（2026-11-18）

用户要求高审美前端后，首个交互原型采用暖纸色背景、墨绿主操作、低饱和集合标识与编辑式标题。实际颜色与字体来源为 `spike/electron/src/tokens.css`；此原型探索替代本文件早期蓝色示例，不同时混用两套主题。轨道线稿为本地SVG，不加载外部图像或字体。当前尚无深色主题。

## 1. 设计原则

| 原则 | 说明 |
|---|---|
| 安静 | 低饱和、低阴影、边框优先；内容比界面重要 |
| 高密度 | 桌面端信息密度优先；行高、间距可预测 |
| 键盘优先 | 常用操作可键盘完成；焦点必须可见 |
| 中文可读 | 中文正文字号不小于 14px；行高不小于 1.6 |
| 结果先行 | 状态、结果、下一步放在视觉上层；装饰后置 |
| 一致 | 所有颜色、间距、圆角、阴影来自 token，不硬编码 |

## 2. 令牌命名

```text
--kb-<类别>-<语义>-<状态>
```

示例：

```text
--kb-color-bg
--kb-color-text-secondary
--kb-color-accent-hover
--kb-space-4
--kb-radius-md
--kb-shadow-sm
```

## 3. 颜色

### 3.1 浅色

| Token | 值 | 用途 |
|---|---|---|
| `--kb-color-bg` | `#F7F7F5` | 页面背景 |
| `--kb-color-surface` | `#FFFFFF` | 卡片、编辑区、弹层 |
| `--kb-color-surface-muted` | `#F0F0ED` | 次级背景、代码块 |
| `--kb-color-surface-hover` | `#EBEBE7` | 悬停 |
| `--kb-color-border` | `#E2E2DD` | 默认边框 |
| `--kb-color-border-strong` | `#C9C9C2` | 强边框、分割 |
| `--kb-color-text` | `#1F2328` | 主文字 |
| `--kb-color-text-secondary` | `#5B616B` | 次文字 |
| `--kb-color-text-muted` | `#8A9099` | 弱文字、占位 |
| `--kb-color-accent` | `#2F6FED` | 主操作、链接 |
| `--kb-color-accent-hover` | `#245BD0` | 主操作悬停 |
| `--kb-color-accent-soft` | `#E8F0FF` | 选中背景、浅强调 |
| `--kb-color-success` | `#1F8A5B` | 成功 |
| `--kb-color-success-soft` | `#E6F4EC` | 成功背景 |
| `--kb-color-warning` | `#B26A00` | 警告 |
| `--kb-color-warning-soft` | `#FFF3E0` | 警告背景 |
| `--kb-color-danger` | `#C0392B` | 危险、错误 |
| `--kb-color-danger-soft` | `#FDECEA` | 危险背景 |
| `--kb-color-info` | `#2F6FED` | 信息 |
| `--kb-color-info-soft` | `#E8F0FF` | 信息背景 |
| `--kb-color-focus` | `#6C9BFF` | 焦点环 |

### 3.2 深色

| Token | 值 | 用途 |
|---|---|---|
| `--kb-color-bg` | `#141518` | 页面背景 |
| `--kb-color-surface` | `#1C1E22` | 卡片、编辑区、弹层 |
| `--kb-color-surface-muted` | `#24272C` | 次级背景、代码块 |
| `--kb-color-surface-hover` | `#2B2F35` | 悬停 |
| `--kb-color-border` | `#30343A` | 默认边框 |
| `--kb-color-border-strong` | `#444A52` | 强边框、分割 |
| `--kb-color-text` | `#E8EAED` | 主文字 |
| `--kb-color-text-secondary` | `#B3B8C0` | 次文字 |
| `--kb-color-text-muted` | `#7D848E` | 弱文字、占位 |
| `--kb-color-accent` | `#6C9BFF` | 主操作、链接 |
| `--kb-color-accent-hover` | `#8AB0FF` | 主操作悬停 |
| `--kb-color-accent-soft` | `#1E2A44` | 选中背景、浅强调 |
| `--kb-color-success` | `#4CC38A` | 成功 |
| `--kb-color-success-soft` | `#173326` | 成功背景 |
| `--kb-color-warning` | `#E0A44A` | 警告 |
| `--kb-color-warning-soft` | `#332615` | 警告背景 |
| `--kb-color-danger` | `#FF6B5E` | 危险、错误 |
| `--kb-color-danger-soft` | `#3A1D1B` | 危险背景 |
| `--kb-color-info` | `#6C9BFF` | 信息 |
| `--kb-color-info-soft` | `#1E2A44` | 信息背景 |
| `--kb-color-focus` | `#8AB0FF` | 焦点环 |

### 3.3 使用规则

- 强调色只用于主操作、当前项、链接；一屏不超过 2 处大面积强调。
- 不用颜色作为唯一状态信号；必须配文字或图标。
- 正文对比度至少 AA；弱文字不用于关键信息。
- 深色模式不是反色；背景、边框、阴影分别调整。

## 4. 字体

| Token | 值 |
|---|---|
| `--kb-font-sans` | `Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif` |
| `--kb-font-serif` | `"Source Han Serif SC", "Noto Serif SC", Georgia, serif` |
| `--kb-font-mono` | `"JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", monospace` |

规则：

- 界面用 sans；长文阅读可选 serif，但默认 sans。
- 代码、路径、命令、ID 用 mono。
- 中文不回退到纯英文字体；字体栈必须包含中文字体。

## 5. 字号与行高

| Token | 字号 | 行高 | 用途 |
|---|---|---|---|
| `--kb-text-xs` | 12px | 18px | 辅助信息、标签 |
| `--kb-text-sm` | 13px | 20px | 表格、次要正文 |
| `--kb-text-base` | 14px | 23px | 默认正文 |
| `--kb-text-md` | 16px | 26px | 阅读正文 |
| `--kb-text-lg` | 20px | 30px | 区块标题 |
| `--kb-text-xl` | 24px | 34px | 页面标题 |
| `--kb-text-2xl` | 32px | 42px | 大标题/空状态 |

字重：400 常规、500 中等、600 半粗、700 粗。标题不超过 600，避免厚重。

## 6. 间距

| Token | 值 |
|---|---|
| `--kb-space-0` | 0 |
| `--kb-space-1` | 4px |
| `--kb-space-2` | 8px |
| `--kb-space-3` | 12px |
| `--kb-space-4` | 16px |
| `--kb-space-5` | 20px |
| `--kb-space-6` | 24px |
| `--kb-space-8` | 32px |
| `--kb-space-10` | 40px |
| `--kb-space-12` | 48px |
| `--kb-space-16` | 64px |

规则：4px 基准；组件内边距优先 8/12/16；区块间距 24/32；页面边距桌面 24，手机 16。

## 7. 圆角、边框、阴影

| Token | 值 | 用途 |
|---|---|---|
| `--kb-radius-xs` | 4px | 小标签、输入 |
| `--kb-radius-sm` | 6px | 按钮、卡片 |
| `--kb-radius-md` | 8px | 面板、弹层 |
| `--kb-radius-lg` | 12px | 大卡片、模态 |
| `--kb-radius-xl` | 16px | 特殊容器 |
| `--kb-radius-full` | 9999px | 胶囊标签、头像 |
| `--kb-border-width` | 1px | 默认边框 |
| `--kb-focus-width` | 2px | 焦点环 |
| `--kb-shadow-sm` | `0 1px 2px rgba(0,0,0,.05)` | 浮层小阴影 |
| `--kb-shadow-md` | `0 4px 12px rgba(0,0,0,.08)` | 弹层、菜单 |
| `--kb-shadow-lg` | `0 12px 32px rgba(0,0,0,.12)` | 模态、命令面板 |

深色模式阴影用更深的透明度（`.4` 左右）；优先边框，不要堆阴影。

## 8. 布局与断点

| 断点 | 宽度 | 布局 |
|---|---|---|
| Desktop | ≥1440px | 检查器可见；1440 时侧栏 216 + 列表 280 + 内容 624 + 检查器 320（含边框/内边距） |
| Laptop | 1280–1439px | 检查器默认折叠；1280 时侧栏 216 + 列表 280 + 内容 784 |
| Compact | 1024–1279px | 检查器折叠，侧栏收起至 56；列表 280 + 弹性内容 |
| Tablet | 768–1023px | 侧栏抽屉、检查器浮层；列表/内容按可用宽度切换单区，不强塞四栏 |
| Mobile | <768px | 单列 + 底部导航 56px，侧栏抽屉 |

尺寸建议：

- 侧栏：240px；折叠 56px。
- 列表：320px；最小 280px。
- 内容：桌面可用宽度允许时最小 560px；小屏使用 `min-width: 0`，取消硬最小值；阅读正文最大 760px，外层内容轨道弹性填充。
- 检查器：320px；可折叠。
- 顶部栏：48px；底部导航：56px。
- 页面边距：桌面 24px；平板 20px；手机 16px，均为面板内部 padding；列宽使用 border-box，不额外叠加外部间距。
- 1440、1280、1024、768、375 CSS px 及 200% 缩放分别检查；按实际 CSS 视口响应，不按物理屏幕尺寸。检查器/侧栏折叠后可用按钮或快捷键打开，长代码块局部滚动，不撑出页面横向滚动。这些是待实现的验收要求，不是已测结果。

## 9. 组件令牌

| 组件 | 规格 |
|---|---|
| Button | 高 28/32/36；水平内边距 12/14/16；圆角 6；字重 500 |
| Input | 高 32/36；内边距 8/12；边框 1px；焦点环 2px |
| Table | 表头 36；行 40/44；单元格内边距 8/12 |
| Tag | 高 22；内边距 8；圆角 full；字号 12 |
| Card | 内边距 16/20；圆角 8；边框 1px |
| Sidebar item | 高 32/36；圆角 6；选中用 accent-soft |
| Modal | 宽 480/640；圆角 12；阴影 lg |
| Toast | 桌面右下；手机顶部；最大宽 360 |
| Editor | 行高 1.7；最大宽 760；代码 mono 13/20 |
| Code block | 背景 surface-muted；内边距 12/16；圆角 6 |

## 10. 动效

| Token | 值 | 用途 |
|---|---|---|
| `--kb-motion-fast` | 120ms | 悬停、焦点 |
| `--kb-motion-base` | 180ms | 展开、切换 |
| `--kb-motion-slow` | 240ms | 模态、抽屉 |
| `--kb-ease-standard` | `cubic-bezier(.2,0,0,1)` | 默认 |

规则：尊重 `prefers-reduced-motion`；不做大幅位移动画；加载状态用骨架屏或轻量 spinner。

## 11. 可访问性

- 键盘可达所有主要操作；焦点环 2px，不能被 `outline: none` 去掉。
- 正文对比度至少 4.5:1；大字号至少 3:1。
- 状态不只靠颜色，配文字/图标。
- 可点击目标桌面至少 32×32，手机至少 44×44。
- 表单必须有 label；错误信息靠近字段。
- 支持 200% 缩放不破布局。

## 12. CSS 变量示例

```css
:root {
  --kb-color-bg: #F7F7F5;
  --kb-color-surface: #FFFFFF;
  --kb-color-surface-muted: #F0F0ED;
  --kb-color-border: #E2E2DD;
  --kb-color-text: #1F2328;
  --kb-color-text-secondary: #5B616B;
  --kb-color-text-muted: #8A9099;
  --kb-color-accent: #2F6FED;
  --kb-color-accent-soft: #E8F0FF;
  --kb-color-danger: #C0392B;
  --kb-color-focus: #6C9BFF;

  --kb-font-sans: Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  --kb-font-mono: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;

  --kb-text-base: 14px;
  --kb-text-md: 16px;
  --kb-leading-base: 23px;

  --kb-space-2: 8px;
  --kb-space-4: 16px;
  --kb-space-6: 24px;

  --kb-radius-sm: 6px;
  --kb-radius-md: 8px;
  --kb-radius-lg: 12px;

  --kb-shadow-md: 0 4px 12px rgba(0,0,0,.08);
  --kb-focus-width: 2px;
  --kb-motion-base: 180ms;
  --kb-ease-standard: cubic-bezier(.2,0,0,1);
}

[data-theme="dark"] {
  --kb-color-bg: #141518;
  --kb-color-surface: #1C1E22;
  --kb-color-surface-muted: #24272C;
  --kb-color-border: #30343A;
  --kb-color-text: #E8EAED;
  --kb-color-text-secondary: #B3B8C0;
  --kb-color-text-muted: #7D848E;
  --kb-color-accent: #6C9BFF;
  --kb-color-accent-soft: #1E2A44;
  --kb-color-danger: #FF6B5E;
  --kb-color-focus: #8AB0FF;
}
```

## 13. Do / Don't

| Do | Don't |
|---|---|
| 用 token | 硬编码颜色/间距 |
| 边框优先、阴影克制 | 到处浮层、重阴影 |
| 一屏一个主操作 | 多个强调色抢焦点 |
| 中文 14px 起、行高 1.6+ | 12px 中文长文 |
| 键盘可达 | 只靠鼠标悬停 |
| 空状态给下一步 | 空白页无引导 |

## 14. 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-11-16 | 初稿：颜色、字体、间距、布局、组件、可访问性 |
