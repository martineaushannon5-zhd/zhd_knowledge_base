# 前端审美与技术审查 · spike/electron

日期：2026-11-18 · 对象：`spike/electron`（Electron + React 19 + Vite 8）
方法：impeccable（critique / audit 视角）+ design-taste-frontend 2.5.1（"one system / font-load / text-contrast / one radius scale" 检查项）
审查面：`src/styles.css`(306) · `src/login.css`(200) · `src/tokens.css`(22) · `src/App.tsx`(238) · `src/LoginPage.tsx`(241) · `src/ParticleHelix.tsx`(494) · `electron/main.cjs`

## 0. 边界（先说清楚我看到了什么、没看到什么）

- **没有做视觉审查。** 当前模型不支持读图；modlens 未配置视觉 provider；`tests/interface.cjs` / `tests/login.cjs` 的 Electron 启动全部失败（`Error: Process failed to launch!`），所以连新截图都没有。`test-results/` 里的 png 是今天 09:38 的旧图，且我无法打开。
- **做的是源码级 + 度量级审查**：所有结论都能用行号或脚本输出复核（见各节"证据"）。
- 结论强度分级：**【实测】** 有数字/命令输出；**【读码】** 由代码结构推出；**【判断】** 审美取向。

---

## 1. 一句话结论

概念是对的，而且少见地对：**纸感底色 + 森林绿 + 一点朱砂 + 中文衬线标题**，是国内笔记类产品里少见的克制组合。但它现在有三处硬伤，让"它想成为的样子"和"它在目标机器上的样子"不是同一个东西：

1. **衬线字体在打包目标（这台 Windows）上完全不存在**，中文标题实际落回无衬线 —— 整套层级语言失效；
2. **38% 的字号声明小于 11px**（最小 4px），元信息层已经不可读；
3. **登录页和工作台是两个品牌**：一个是宇宙隐喻（粒子螺旋、星图、`THOUGHTS BECOME CONSTELLATIONS`），一个是纸张档案柜。

---

## 2. P0 · 会让设计失效的问题

### 2.1 字体：editorial 字族在目标机上不存在 【实测】

```css
/* src/tokens.css:19-21 */
--font-ui: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
--font-editorial: 'Noto Serif CJK SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', Georgia, serif;
--font-mono: 'Cascadia Code', Consolas, monospace;
```

本机 `System.Drawing.Text.InstalledFontCollection`（118 个字体家族）实测：

| 字族 | 声明位置 | 本机 |
| --- | --- | --- |
| Noto Serif CJK SC | tokens.css:20 | **无** |
| Source Han Serif SC | tokens.css:20 | **无** |
| Songti SC | tokens.css:20 | **无** |
| SimSun | tokens.css:20 | **无**（只有 SimSun-ExtB/ExtG） |
| Georgia | tokens.css:20 | 有（**但无中文字形**） |
| Microsoft YaHei | tokens.css:19 | **无**（本机家族名是 `Microsoft YaHei UI`） |
| Cascadia Code | tokens.css:21 | **无** |
| Noto Sans SC / Segoe UI / Consolas | — | 有 |

后果（按 CSS 逐字回退规则推演）：

- 中文标题：4 个中文衬线候选全部缺失 → Georgia 只有拉丁字形 → 落到 generic `serif` → Windows 的 serif 通常映射 Times New Roman，仍无中文 → 最终落到系统 CJK 兜底（Noto Sans SC / YaHei UI）。**结果是中文衬线标题实际渲染成无衬线**。
- 同一个标题里，拉丁字符（`Zhd.`、`01 / ∞`、`IDEAS`）走 Georgia，中文走无衬线 —— **一个标题两种字形骨架**，行内视觉粗细/字面高度不一致。
- `.brand strong`(styles.css:24)、`.workspace-avatar`(30)、`.favorite-index`(162)、`.inbox-prompt-top > span`(167) 还**硬编码了 Georgia**，绕开了 token，登录页 login.css:30、136 同样硬编码 —— 于是"品牌是衬线的、内容是黑体的"这种错位遍及全站。
- `@font-face` 在全项目 **0 处**，`font-src 'self'` 的 CSP 本来允许自带字体文件，但没有带。

**判定**：这不是"字体没选好"，是**字体从未被交付**。当前 CSS 里所有 `font-family: var(--font-editorial)` 的声明（styles.css:79/91/183/214/227/258，login.css:42/69/95/148）在目标机器上等于 `font-family: <系统黑体>`。

**改法（二选一，不要折中）**：
- A（推荐，保住概念）：内置一份中文衬线子集（思源宋体 / Noto Serif SC，`subset` 到 GB2312 + 常用标点，woff2 约 800KB–1.5MB），`@font-face` + `font-display: swap`，`--font-editorial` 首选项指向它，Georgia 退到第二（只用于拉丁）。
- B（承认现实）：删掉衬线概念，改用 **同族不同字重 + 字号 + 字距** 建立层级（YaHei UI Light/Bold 都在本机），并把 4 处硬编码 Georgia 一并删掉。这条便宜但会把设计降回"通用深色/浅色后台"。

### 2.2 字号：38% 的声明在 11px 以下 【实测】

脚本统计三份 CSS 共 **183 条 `font-size` 声明**，分布：

```
4px×1  5px×2  6px×3  7px×8  8px×10  9px×13  10px×33  11px×32  12px×31  13px×11  …
< 11px 合计 70 条（38%）
```

具体到会伤人的：

| 选择器 | 行 | 字号 | 说明 |
| --- | --- | --- | --- |
| `.feature-index` | styles.css:96 | **6px**（1330px 下 5px，760 下 5px，420 下 **4px**） | 首屏主视觉上的装饰标签 |
| `.studio-signature > span` | styles.css:173 | 7px | 侧栏签名 |
| `.brand small` | styles.css:26 / 272 | 8px / 7px | 品牌副标 `KNOWLEDGE STUDIO` |
| `.eyebrow` | styles.css:78 / 273 | 9px / 8px | 每个页面标题上方的小标 |
| `.card-bottom time` | styles.css:142 | 9px | 卡片日期 |
| `.page-footer` | styles.css:174 / 273 | 9px / 8px | 页脚 |
| `.login-intro-caption` | login.css:139 | 7px | 开场字幕 |
| `.helix-note-node` | login.css:68 | 8px | 光点卡片编号 |
| `.login-field > label > span` | login.css:101 | 7px | 表单字段的英文副标 |

在 1500×960 窗口 + Windows 125% 缩放下，7px ≈ 8.75 物理像素；4px 的 `feature-index` 在 420 断点下是**不可读的噪点**。中文 9–10px 在 ClearType 下笔画会粘连（横画 1px 时几乎消失）。

**改法**：设一条硬下限——**正文 14/13，元信息 11，任何文字 ≥ 11px，装饰性拉丁小标 ≥ 10px 且只用于非信息**。`feature-index` 这种纯装饰要么提到 10px 要么删掉。

### 2.3 对比度：分类标签在"几乎不可读"的水平 【实测】

WCAG AA（正文 4.5:1 / 大字 3:1），实测（sRGB 相对亮度公式）：

| 用途 | 前景 / 背景 | 比值 | 判定 |
| --- | --- | --- | --- |
| 分类标签（10px 文字） | `--ochre #b39a5d` / `--white #fffefa` | **2.70:1** | FAIL |
| 分类标签（10px 文字） | `--sage #83986c` / `--paper #faf9f6` | **2.99:1** | FAIL |
| 输入占位符 | `#b0b4a7` / `--paper` | **2.01:1** | FAIL |
| 侧栏序号 `.favorite-index` | `#aaa998` / `--white` | **2.35:1** | FAIL |
| 侧栏签名 `.studio-signature` | `#a8aa9b` / `--paper` | **2.24:1** | FAIL |
| 页脚 `.page-footer` | `#999d91` / `--paper` | **2.63:1** | FAIL |
| 快捷捕获计数 `.capture-bottom` | `#939384` / `#f3f0e7` | **2.73:1** | FAIL |
| 正文元信息 `--muted` | `#6f7667` / `--paper` | 4.47:1 | 擦边（且用在 9–10px 上） |
| 正文 `--secondary` | `#58624f` / `--paper` | 6.09:1 | 通过 |
| 正文 `--ink` | `#303b31` / `--paper` | 11.11:1 | 通过 |

`--ochre` / `--sage` 之所以致命，是因为它们**被当作文字色**（styles.css:44-47 的 `.ochre/.blue/.green/.purple`），而 `categoryMeta` 给四类笔记各配了一个，于是**每一张卡片的左上角分类名都是 2.7–3.0:1 的 10px 文字**。

**改法**：分类色保留色相但压暗到 ≥ 4.5:1（示例：ochre → `#8a6f2e`，sage → `#5c6f45`，blue → `#4f6b7a`，plum → `#6f6279`，需再实测）；或改成"彩点 + 深色文字"（`●` 用原色，文字用 `--secondary`），这样既保住分类色彩又不牺牲可读性。后者更符合纸感语言。

### 2.4 四组断点永远不会触发 【实测】

`electron/main.cjs:114-117`：`width: 1500, height: 960, minWidth: 1000, minHeight: 680`。

窗口宽度下限 1000px，因此 `@media (max-width: 960px)`(styles.css:272)、`max-width: 760px`(273)、`max-width: 420px`(274)、以及 login.css 的 `max-width: 700px`(168-197)、`385px`(198) **在打包后的桌面应用里 100% 不会命中**。

代价不只是死代码：这 5 个块里包含 **44px 触摸目标的唯一实现**（styles.css:273 的 `.icon-button { min-width: 44px; min-height: 44px }`）和整套移动布局。也就是说——**触摸可用性规则写在了永远不会执行的代码里**，而真正生效的桌面宽度下，图标按钮是 32×32（styles.css:69），收藏按钮 32×32（134）。

**改法**：二选一。
- 认桌面：删掉 760/420/700/385 四个块（约 1/5 的 CSS），把需要的触摸尺寸并进桌面规则（或者干脆不管，桌面鼠标场景 32px 可接受）。
- 认移动：把 `minWidth` 降到 380，让这些断点真的能看见，并补 820/768 的验证。

**不要维持现状**：现在的状态是"写了两套布局，只有一套能跑"。

---

## 3. P1 · 系统一致性

### 3.1 258 个色值，17 个 token 【实测】

```
styles.css   90 个 hex
login.css   151 个 hex
tokens.css   17 个 hex
合计 258，去重 245
```

`tokens.css` 的 17 个 token **全部被引用过**（没有被淘汰的），但全站 245 个唯一色值意味着 **约 93% 的颜色决策绕过了设计系统**。典型症状：

- `--paper #faf9f6` 隔壁又有一个 `#fafbf8`（login.css:8 的 `--login-paper`）；
- `--ink #303b31` 旁边是 `--login-ink #253c38`；`--forest #2d4235` 旁边是 `--login-teal #174e49`；
- `#a0523d` 出现 3 次（危险色），每次手写；
- `#385446`、`#e5eadd`、`#eeefe7`、`#eceee6`、`#f5f5ef` 等一批"只差一点点"的灰绿。

这不是"细腻"，是**没有标尺**：改一次主色要动 90 处。

### 3.2 圆角 19 种、z-index 无标尺 【实测】

```
border-radius: 2,3,4,5,6,7,8,9,11,12,14,15,16,18,22,40,50%,99,999  → 19 种
z-index: 0,1,2,3,4,6,25,30,100,101                                → 10 种散落
```

design-taste 的 `one radius scale` 检查项直接不通过。建议收敛成 3 档：`--r-sm: 5px`（控件）、`--r-md: 8px`（卡片）、`--r-lg: 14px`（对话框/浮层），`99px` 仅用于胶囊。

### 3.3 两个调色板 = 两个产品 【读码 + 判断】

- 工作台：`#faf9f6` 纸白 + 森林绿 + 细线框 + 9px 小字（安静、档案感）。
- 登录页：`#071b1c` 墨绿黑 + 粒子螺旋 + 68px 衬线标题 + `THOUGHTS BECOME CONSTELLATIONS`（戏剧、宇宙感）。

它们共享的只有"绿"这一个色相。作为产品体验，这是**两次第一印象**：用户先在"星空剧场"里被要求登录，进到一个"纸质档案柜"，中间没有任何视觉过渡（只有 `.is-leaving` 的 460ms 模糊淡出，login.css:17）。

更具体的问题：**登录页是零功能的摩擦门**。它有一个密码框，而密码框下面写着"请勿输入真实密码"（LoginPage.tsx:32/55/62/77），提交后提示"登录服务尚未接入"。也就是说界面的第一个交互在为自己的存在道歉。对一个**本地优先、不需要账号**的笔记应用，这是纯成本：用户在见到任何价值之前先做一个决定。

**改法（三选一）**：
- 删掉登录路由，直接进工作台（最符合"本地知识库"的产品真相）；
- 保留为"欢迎页"，去掉邮箱/密码字段，只留"进入知识空间"和一个真实的说明（把 `.login-card` 从表单改成一页介绍）；
- 保留登录，但把工作台的视觉语言（纸白、细线、森林绿、衬线）搬进登录页，让两者是同一个品牌的两个房间 —— 而不是两个品牌。

### 3.4 首页最大的元素，是在给自己打广告 【判断】

`.feature-card`（styles.css:87，252px 高，森林绿底）占据了工作台首屏最大的一块，内容是：`A QUIET PLACE FOR IDEAS` + 一段说明 + 一个 CTA + 一个 420×300 的轨道装饰 SVG（App.tsx:19，里面写着 `IDEAS` / `CONNECTIONS` / `01 / ∞`）。

对一个 Operate 模式的应用界面，这是**首屏最高成本的位置给了装饰**：用户每次打开工作台，看到的不是"我的笔记"，而是一张自我介绍的横幅。`01 / ∞`、`IDEAS`、`CONNECTIONS` 这类英文小字是典型的"生成式装饰"——它们不承载信息，只制造"设计过"的印象。

**改法**：把 feature-card 降级为**一次性的首次引导**（localStorage 标记，只在第一次显示），或者压缩到 120px 以内只留一行字。首屏应该以"最近笔记/待整理"为主角。

---

## 4. P2 · 细节与工程

| # | 问题 | 位置 | 说明 |
| --- | --- | --- | --- |
| 1 | Toast 没有真正居中 | styles.css:265 `left: calc(50% + 80px)` | 侧栏 224px 时主区中心是 `50% + 112px`；80px 是魔法数，导致 toast 恒定**偏左 32px**（1330px 以下偏左 23px）。≤760 断点又改回 `50%`，说明作者知道这不对但只修了用不到的分支。 |
| 2 | 中文字距 | styles.css:91（1.2px）、login.css:42（**3px**，68px 标题）、styles.css:78（2.1px） | 拉丁大写加字距是对的；中文加 1.2–3px 会破坏字组关系，标题会散。中文只应在 ≥24px 时用 ≤0.05em。 |
| 3 | hover 上浮是模板反射 | styles.css:106、131（`translateY(-2px)`） | 卡片/收藏卡 hover 上浮 + `transform` 过渡，是 AI 生成界面的最强指纹之一。纸感界面更适合 `background` / `border-color` 的细微变化。 |
| 4 | 动画 gap 会抖 | styles.css:93-94（`gap: 24px → 30px`） | 对 `gap` 做过渡触发布局计算，逐帧重排；改成 `transform: translateX()` 或直接不做。 |
| 5 | 无限 shimmer | login.css:121（`login-shimmer 6s infinite`） | 提交按钮里有一条永远在扫的流光，GPU 常驻绘制；`prefers-reduced-motion` 已覆盖（login.css:200）但没有暂停按钮/超时。 |
| 6 | 焦点环会被裁 | styles.css:10（`outline-offset: 4px`） | 在 `overflow: auto` 的 `.editor-body`(224)、`.search-results`(198) 里，贴边元素的焦点环会被裁掉一半。改成 2px offset 或用 `box-shadow` 内环。 |
| 7 | 无 error boundary | src/Root.tsx（19 行） | 只有 `Suspense`；`App` 里任何渲染异常 = 白屏，且用户数据在本地、没有"安全退出"。 |
| 8 | 包体 | 构建输出警告 `chunks larger than 500 kB` | markdown-it 已随主包；`MarkdownEditor` 已 lazy（App.tsx:28）但 markdown-it/DOMPurify 还在首屏。建议把阅读模式的 `md.render` 也拆到 lazy chunk。 |
| 9 | 命名不统一 | index.html:9 `Zhd Notes · 本地知识库`；Root.tsx:14 `ZHD Knowledge Studio`；登录页 `ZHD.`；正文 `知识空间`/`知识库`/`工作台` | 五个名字。产品名应该只有一个，`document.title` 随路由变化是对的，但品牌名不该变。 |
| 10 | CSS 导入耦合 | login.css 使用 `var(--font-ui)` 但不 `@import './tokens.css'` | 依赖 `Root.tsx:3` 先导入 styles.css。独立挂载（比如单独的登录窗口）会静默掉字体。把 tokens 放在两份 CSS 的公共入口或各自 import。 |
| 11 | 无暗色主题 | index.html:5 `color-scheme: light` | 一个每天开着用的桌面笔记应用，夜里是 `#faf9f6` 满屏白光。至少跟随系统提供 `prefers-color-scheme: dark` 的一套纸/墨反转。 |

做得好的地方（不要改坏）：`prefers-reduced-motion` 覆盖完整（styles.css:275、login.css:200）；`:focus-visible` 统一（styles.css:10）；`html { scrollbar-gutter: stable }`(18)；`body:has(dialog[open]) { overflow: hidden }`(19)；原生 `<dialog>` + `showModal()` + `aria-labelledby`（App.tsx:22-26、LoginPage.tsx:27/65）；保存状态机 `idle/saving/saved/error/conflict` 与冲突文案（App.tsx:89/64-66）比多数产品都认真。

---

## 5. 修复顺序（建议）

**P0（一次性，约 1 天）**
1. 字体落地：内置中文衬线 woff2 子集，或改字重方案并清掉 4 处硬编码 Georgia（tokens.css:20-21、styles.css:24/30/162/167、login.css:30/136）。
2. 字号下限 11px：清掉 `feature-index` 4-6px 与全部 7-9px 元信息。
3. 分类色对比度：ochre/sage/blue/plum 压暗到 ≥4.5:1，或改"彩点 + 深字"。
4. 断点二选一：删 760/420/700/385，或放开 minWidth。

**P1（约 1–2 天）**
5. 登录/工作台二选一（删、改欢迎页、或统一视觉世界）。
6. feature-card 降级为首次引导。
7. 颜色 token 化（先做"新代码必须用 token"+ 现有 90 处分批收）。
8. 圆角 3 档、z-index 3 档。

**P2（随手）**
9. toast 居中改 `calc(50% + var(--sidebar-w) / 2)`。
10. 中文标题字距归零。
11. 去掉卡片 hover 上浮、gap 过渡、无限 shimmer。
12. 焦点环 offset 改 2px；加 error boundary；markdown-it 拆包；统一产品名。

---

## 6. 无法验证的部分（需要一次真机截图才能定论）

- 衬线回退后的实际观感（是"高级黑体"还是"字体缺失感"）；
- 首屏 1500×960 下的真实密度与留白是否失衡；
- 粒子螺旋（ParticleHelix.tsx 494 行）在集显上的帧率；
- 深绿底上的 `text-shadow` 是否糊。

要拿到这些，需要先修好 Electron 启动（当前 `Process failed to launch!`）。我可以先做这件事，再补一版带截图的视觉复核。
---

## 7. 修复状态（2026-11-18 追加，见 `工作流/2026-11-18-品牌图标与安装.md`）

| 审查项 | 状态 |
| --- | --- |
| 2.1 字体未交付/混骨架 | 部分：回退栈补 YaHei UI/Noto Sans SC 消除混骨架与通用 serif 兜底；**未**内置衬线 woff2（离线安全取舍） |
| 2.2 字号 <11px | 已修：信息 ≥11 / 装饰拉丁 ≥10 覆盖层 |
| 2.3 分类色/元信息对比度 | 已修：分类色压暗 + 浅底小字提对比 |
| 2.4 死断点 | 部分：minWidth→760 使 960/760 可达；420/385 服务浏览器预览 |
| 3.1 色值绕过 token | 未做（分批收） |
| 3.2 圆角/z-index 无标尺 | 未做（token 已备 --r-sm/md/lg 待收敛） |
| 3.3 登录/工作台两品牌 | 未删登录（用户要求保留登录页）；品牌名/标记已统一 |
| 3.4 首屏广告横幅 | 已修：feature-card 仅首次引导 |
| P2 toast/字距/hover/gap/shimmer/焦点/error boundary/命名/tokens 导入 | 已修 |
| P2 markdown-it 拆包 / 暗色主题 | 未做 |
| 6 真机截图复核 | 已补：Electron 启动修复后 interface/login 重新出图 |

环境注：本机端点安全软件拦截沙箱 broker/GPU 子进程/%TEMP% 写入/NSIS exe 执行；已用 --no-sandbox + in-process-gpu + 项目内 userData + 免 NSIS 安装绕过，未改系统安全设置。OS 沙箱关闭为记录在案的安全取舍。
