# 数据模型

> 顾问推荐基线尚未实测：主进程文件 IO；Markdown/frontmatter + JSON 元数据为真相源，SQLite/better-sqlite3 FTS5 为可重建派生索引。
> Agent 工作规则仅引用 `AGENT-规则.md`；下文定义产品数据契约，不另立执行硬规则。

## 1. 实体总览

| 实体 | 前缀 | 用途 |
|---|---|---|
| Note | `N-` | 笔记/灵感/规范/学习记录 |
| Collection | `COL-` | 单层集合 |
| Tag | `TAG-` | 多标签 |
| Link | `LNK-` | 笔记之间的双向链接 |
| Attachment | `ATT-` | 图片/PDF/附件 |
| NoteVersion | `VER-` | 版本快照 |
| Fact | `F-` | 事实卡 |
| Capability | `C-` | 能力卡 |
| Task | `T-` | 任务卡 |
| Decision | `D-` | 决策卡 |
| WorkflowReport | `R-` | 工作流报告 |
| SecretRef | `S-` | 秘密引用（不存值） |
| Setting | `SET-` | 配置 |
| LearningItem | `L-` | 学习进度 |
| TechRadarItem | `TR-` | 技术雷达 |
| AIConversation / Message | `AI-` | 知识库 AI 对话 |
| AuditLog | `AUD-` | 后置候选，非首版实体；首版使用必要操作证据/报告 |

## 2. 核心实体

### 2.1 Note

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `N-ULID` |
| title | string | 可重复；ID 唯一 |
| content_md | text | Markdown 正文 |
| excerpt | string | 摘要/预览 |
| type | enum | inspiration / spec / note / learning / project / reference |
| status | enum | draft / active / archived / trashed |
| collection_id | string? | 单层集合 |
| sensitivity | enum | public / internal / secret |
| created_at | datetime | ISO 8601 |
| updated_at | datetime | ISO 8601 |
| deleted_at | datetime? | 软删除 |
| tags | string[] | 标签 ID |

### 2.2 Collection

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `COL-ULID` |
| name | string | 名称 |
| parent_id | string? | 预留；MVP 单层 |
| sort | int | 排序 |
| created_at | datetime | — |

### 2.3 Tag

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `TAG-ULID` |
| name | string | 唯一 |
| color | string? | 颜色 token/hex |
| created_at | datetime | — |

### 2.4 Link

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `LNK-ULID` |
| source_note_id | string | 来源 |
| target_note_id | string | 目标 |
| context | string? | 链接上下文 |
| created_at | datetime | — |

唯一索引：`(source_note_id, target_note_id)`。

### 2.5 Attachment

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `ATT-ULID` |
| blob_id | string | 共享 blob ID（SHA-256），不绑定单一笔记 |
| mime | string | MIME |
| size | int | 字节 |
| sha256 | string | 内容校验/去重 |
| path | string | vault 内相对路径 |
| created_at | datetime | — |

附件分为共享 blob 与引用：`AttachmentRef(id, note_id, attachment_id, filename, created_at)` 记录每篇笔记的引用和原始文件名；多篇笔记可引用同一 blob，引用保存在 JSON 元数据。删除一条引用不删除共享文件；回收站和保留快照仍算引用，零引用 blob 经核查和确认后才清理。

### 2.6 NoteVersion

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `VER-ULID` |
| note_id | string | 所属笔记 |
| version_no | int | 递增 |
| content_md | text | 快照 |
| reason | string | auto / manual / restore |
| created_at | datetime | — |

## 3. Agent 约束实体

### 3.1 Fact

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `F-ULID` |
| title | string | 事实标题 |
| value | text? | 非秘密值；secret 时为空 |
| secret_ref | string? | 本地路径 + 键名 |
| sensitivity | enum | internal / secret |
| source | string | 来源/获取方式 |
| last_verified_at | datetime | 最后验证 |
| review_cycle_days | int | 复查周期 |
| status | enum | active / stale / archived |
| owner | string | 负责人 |

规则：`sensitivity=secret` 时，`value` 必须为空，只允许 `secret_ref`。

### 3.2 Capability

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `C-ULID` |
| name | string | 能力名 |
| priority | enum | P0 / P1 / P2 |
| status | enum | proposed / active / deprecated |
| trigger | text | 何时使用 |
| inputs | json | 输入 |
| outputs | json | 输出 |
| constraints | json | 约束/预算 |
| anti_patterns | json | 什么时候不要用 |
| owner | string | — |

### 3.3 Task

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `T-ULID` |
| title | string | 任务标题 |
| project | string | 例如 yoji |
| goal | text | 一句话目标 |
| in_scope | json | 范围内 |
| out_of_scope | json | 范围外 |
| allowed_files | json | 允许改的文件 |
| test_scope | json | 测试范围 |
| context_budget | json | 文件数/行数/允许测试 |
| acceptance | json | 验收标准 |
| stop_conditions | json | 停止条件 |
| status | enum | draft / approved / in_progress / blocked / done |
| owner | string | — |
| created_at | datetime | — |

### 3.4 Decision

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `D-ULID` |
| title | string | 决策标题 |
| status | enum | proposed / accepted / rejected / superseded |
| context | text | 背景 |
| options | json | 选项 |
| decision | text | 结论 |
| consequences | json | 后果 |
| date | date | — |
| owner | string | — |

### 3.5 WorkflowReport

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `R-ULID` |
| task_id | string? | 多步任务卡；低风险请求可为空 |
| request_ref | string? | 无任务卡时关联明确用户请求 |
| changed_files | json | 修改范围或无修改说明 |
| path | string | `工作流/` 路径 |
| result | enum | done / partial / blocked |
| current_mainline | string | 当前主线 |
| next_step | string | 下一步 |
| questions | json? | 有待决策问题时填写，无问题不强问 |
| tested | json | 验证方法、结果或未执行原因 |
| pushed | bool? | 涉及推送时填写，未操作不虚构 |
| git_status | string? | 涉及版本操作时填写；未初始化 Git 如实写明 |
| progress | string? | 多步交接时填写 |
| missed | json | 未完成项，无则明确无 |
| tools | json? | 影响复现时记录工具/版本 |
| risks | json? | 存在风险时填写 |
| created_at | datetime | — |

### 3.6 SecretRef

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `S-ULID` |
| label | string | 人类可读标签 |
| path | string | 本地文件路径 |
| key | string | 环境变量/键名 |
| sensitivity | enum | secret |
| owner | string | — |
| last_verified_at | datetime | — |
| notes | string? | 用途/轮换说明 |

**永不存储秘密值。**

## 4. 驾驶舱实体

### 4.1 LearningItem

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `L-ULID` |
| topic | string | 主题 |
| progress | enum | not_started / learning / practicing / done |
| next_step | string | 下一步 |
| notes | string? | 备注 |
| updated_at | datetime | — |

### 4.2 TechRadarItem

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | `TR-ULID` |
| name | string | 技术名 |
| status | enum | watch / trial / adopt / hold |
| purpose | string | 用途 |
| notes | string? | 备注 |
| updated_at | datetime | — |

## 5. 存储策略

| 数据 | 位置 | 格式 |
|---|---|---|
| 笔记 | 本地 vault | Markdown + YAML front matter |
| 附件 | `attachments/<sha256>/` | 原文件 |
| 元数据真相源 | `metadata/` | 带 schema_version/revision 的 JSON；集合、标签定义、附件引用、设置、排序等非正文数据 |
| 索引 | 本地 SQLite/better-sqlite3 FTS5 | 派生缓存，可全部重建，不保存唯一业务数据 |
| 事实/能力/任务/决策 | 能力/任务卡 `cards/`；事实见 `KB-人读.md`；决策见 `docs/decisions.md` | Markdown + front matter |
| 工作流报告 | `工作流/` | Markdown |
| Context Pack | `工作流/context-packs/` | Markdown |
| 秘密 | 仓库外 `.secrets/` | 本地文件（明文按 Owner 选择） |
| 备份 | 本地备份目录 | ZIP/增量 |
| 学习/技术雷达 | 笔记 | Markdown + front matter |

## 6. 索引与搜索

建议索引字段：

- `title`
- `content_md`
- `excerpt`
- `tags`
- `type`
- `status`
- `collection_id`
- `created_at` / `updated_at`
- `sensitivity`（secret 不进默认索引/不进 AI 上下文）

推荐 SQLite/better-sqlite3 FTS5；应用层中文分词在入库和查询使用同一版本/词典，具体分词实现与高亮原文偏移映射由后续搜索节点验证；T-001只验证FTS5和原生模块可用性，不预设原生扩展可用。记录分词器/词典版本，变更后重建索引。索引可重建，不作为真相源；P0 AI 用关键词结果生成带引用答案，P1 再做向量/混合增强。性能与召回基准见 acceptance.md。

## 7. 数据完整性规则

### 写入与恢复协议（阶段B已实现单文件原子写入与备份恢复；跨文件提交清单待完善）

- 主进程统一 IO，按文档串行化写入；渲染进程仅调用受限 IPC。正文及笔记属性由 Markdown/frontmatter 权威持有，JSON 保存非正文实体；SQLite 中的重复字段仅为投影，禁止双主写。
- 保存前比对已读取 revision/hash；同目录临时文件写入并刷新、校验成功后以替换/重命名提交，文件落盘先于索引事务。Windows 文件锁、替换失败和磁盘满均返回明确失败，不提前显示已保存。
- 涉及 Markdown、JSON、附件的多文件变更使用操作 ID、提交清单和恢复日志；逐文件原子替换不等于跨文件原子事务。blob 先写入，引用后提交；崩溃后按清单恢复或保留旧版本，恢复完成再重建索引。文件已提交但索引失败时标记待索引，不回滚丢弃正文。
- 外部修改通过文件监听加重新扫描确认，以内容 hash 判断；无本地修改可重新加载，有未保存编辑或 revision 不一致时保留磁盘版和本地冲突副本，提示比较/合并，不静默覆盖任何一方。
- 重建时从 Markdown/frontmatter + JSON 全量读取，核验 schema、ID 和引用；损坏文件隔离并报告，不从旧索引反写覆盖真相源。

- 删除一律软删除；30 天后可提出清理，实际删除需确认。
- 附件按 `sha256` 去重；删除笔记不立即删附件。
- 链接唯一；目标不存在时提示“未创建”。
- 事实必须带 `last_verified_at`；过期标记 `stale`。
- SecretRef 只存引用；不得出现明文。
- 版本快照保留策略待定；至少保留最近 N 个 + 手动快照。
- 迁移必须可回滚；备份后再迁移。

## 8. 备份与导出

| 类型 | 内容 |
|---|---|
| 全量备份 | vault + 附件 + 元数据 + 配置（不含秘密） |
| 增量备份（后置） | 首版只做全量备份；后续确有容量需求再实现增量与依赖链 |
| 导出 | Markdown 文件夹、ZIP、JSON 元数据 |
| 恢复 | 在独立临时目录解包并校验 manifest/hash/schema/引用，再重建索引并抽查；通过后确认切换，保留原库可回退 |
| 秘密 | 不进入备份；单独管理 |

备份先于 AI 接入且不被 AI 选型阻塞。备份期间以提交修订快照或短暂写锁取得一致视图，manifest 记录版本、文件清单、大小、hash 和增量依赖。恢复拒绝路径穿越、绝对路径和越界链接；校验失败不覆盖现有库。恢复演练比较笔记、JSON、附件引用和内容，而不只比较文件数量。

建议保留最近 7 份成功且校验通过的备份，属于待确认策略，不默认自动删除；清理展示候选和增量依赖，获得确认后执行，不破坏仍保留的恢复链。

## 9. 权限与敏感级别

| 敏感级别 | 默认可见 | Git | AI 上下文 |
|---|---|---|---|
| public | 所有人 | 可 | 可 |
| internal | Owner/Agent | 可（私有仓库） | 可 |
| secret | Owner/授权 Agent | 否 | 默认否；任务授权可读 |

## 10. 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| 0.1 | 2026-11-16 | 初稿：实体、字段、存储、索引、完整性、备份 |
| 0.2 | 2026-11-18 | 阶段B落地：vault模块实现原子写入、frontmatter真相源、revision冲突保留、损坏隔离、附件内容寻址去重、FTS5派生索引可重建、备份manifest哈希校验与保留原库恢复；14项临时目录测试通过。跨文件操作ID/崩溃恢复日志、ZIP导出、增量备份仍待完善；UI接入属阶段C |
| 0.3 | 2026-11-18 | 阶段C：vault经kbStore IPC接入UI，自动保存状态机、回收站(软删/恢复/彻底删除)、中文FTS5搜索；一万篇基准P95=37ms、Recall@10=0.997。索引字段以notes_fts(title/body/tags)+meta投影实现；高亮偏移映射与jieba分词后置 |
