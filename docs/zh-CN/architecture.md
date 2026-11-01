# Career Steward 1.0 中文架构说明

[简体中文](architecture.md) | [English](../architecture.md)

## 系统定位

Pi 是智能交互入口、任务编排器和扩展运行时，但不是系统记录源。Career Steward 的领域核心独立于 Pi 会话，使候选人证据、匹配规则、生成产物和求职进展不会随着一次对话消失。

```text
Pi Runtime
  -> Career Skills 与 Extension
  -> 领域工具
  -> 应用服务
  -> Career Domain Core
  -> SQLite 与本地文件
```

1.0 采用本地优先的模块化单体。当前数据规模和业务边界不需要微服务、向量数据库或子 Agent 编排。

## 核心不变量

1. Candidate Profile 是候选人事实的记录源，简历只是投影；
2. 每条生成的职业声明必须追溯到证据；
3. 模型可以提出事实，但只有经过校验和确认的工具可以持久化；
4. 匹配分数、证据覆盖率和置信度是不同指标；
5. 官方事实、媒体报道、社区观点和模型推断必须分开；
6. 修改候选人事实必须经过用户确认；
7. 模型负责语义分类，版本化代码负责权重、上限和最终计算；
8. Capability Match 与 Employer Fit 是两个独立决策维度；
9. 求职进展来自用户确认的事件历史，不是模型推断的可变字段。

## 简历导入与 Candidate Profile

所有文档解析器都输出同一个版本化 `ParsedResumeDocument`。1.0 只提供文字型 PDF 解析器。

```text
PDF
  -> parse_resume_pdf
  -> ParsedResumeDocument
  -> 模型语义提取
  -> CandidateProfileDraft
  -> 证据校验
  -> 用户确认
  -> CandidateProfileRevision
```

PDF 解析器只做确定性文本提取，不推断、不改写、不保存候选人事实。模型提出的姓名、技能、经历和教育信息都必须引用稳定的源文档块。

已确认档案保持不可变。纠错和新增事实采用完整替换式修订草稿：省略字段会作为删除内容显示，每个保留或新增值仍需要证据。明确的用户陈述可以成为 `user-statement` 证据，但模型生成的 Match Report、CV 或 STAR 故事不能反向成为档案证据。

修订草稿记录基础版本。确认时如果当前档案已经变化，事务会拒绝过期草稿，避免覆盖并发修改。

## JD 和岗位要求

岗位原文保存为 `JobOpportunity`，并按行形成稳定的 `jd-b*` 证据块。模型可以提出两类要求：

- 明确要求：必须引用雇主实际写出的 JD 证据；
- 推断要求：仍要引用相关 JD 内容，同时单独保存推断理由和置信度。

只有用户确认后，分析才成为不可变的 `JobAnalysisRevision`。

## 证据约束的岗位匹配

```text
CandidateProfileRevision + JobAnalysisRevision
  -> 模型建立 Requirement–Evidence Matrix
  -> 应用层完整性校验
  -> matching-policy/1.0
  -> JobMatchReport
```

模型把每条要求分类为：

- `strong`：有直接、充分证据；
- `transferable`：有可迁移证据；
- `weak`：有有限证据；
- `gap`：现有证据显示不满足；
- `unknown`：已确认档案不足以判断。

正向评价必须引用真实候选人证据；`gap` 和 `unknown` 不允许附带候选人证据。模型不能提交权重、得分或最终匹配率。应用代码分别计算能力得分、证据覆盖率、置信度和最终匹配分数，并对关键缺口应用上限。

## 公司情报与 Employer Fit

Capability Match 只回答“我能否胜任岗位”。公司口碑、加班、稳定性、薪酬和个人偏好进入单独的 Employer Fit。

```text
URL 发现
  -> fetch_company_source
  -> 有界网页快照与 SHA-256
  -> 来源记录
  -> 有来源的公司结论
  -> 用户确认
  -> CompanyResearchRevision
```

来源区分为官方、专业媒体、社区和奖项登记；结论区分为官方事实、报道事实、社区情绪、奖项记录和推断。模型推断不是来源，必须引用真实来源并保存理由。

“最佳雇主”不能成为永久布尔标签，必须保留奖项机构和时间范围。社区评价只代表样本情绪，允许不同来源互相冲突。

公开网页抓取会检查初始 URL 和每次重定向，阻止私网、回环、链路本地、保留地址和云元数据目标。系统固定已验证 DNS 地址，并限制超时、重定向次数、响应大小、媒体类型和规范化文本长度。1.0 不执行网页 JavaScript。

Employer Fit 将已确认职业偏好与公司结论逐项映射。Deal Breaker 冲突或未知会限制最终分数，防止平均分掩盖关键风险。

## 定制 CV

定制 CV 是已确认档案的岗位投影，不是第二套 Candidate Profile。

```text
CandidateProfileRevision
  + JobAnalysisRevision
  + JobMatchReport
  -> 模型选择与谨慎改写
  -> 证据和要求校验
  -> 用户确认
  -> TailoredResumeRevision
  -> Markdown / DOCX
```

身份、联系方式、公司、职位、日期、技能和教育信息由应用代码从已确认档案复制。模型生成的摘要和项目描述必须引用 Match Report 已映射到相应要求的证据。经历 bullet 的证据必须属于同一段经历，防止把不同公司的工作拼成虚假故事。

真值校验先于 ATS 校验。1.0 的标准输出是单栏 Markdown 和 ATS 友好的单栏 DOCX，不使用表格、图片、文本框或多栏布局。ATS 检查只是兼容性提示，不保证任何厂商一定接受或提高排名。

## 面试准备

面试计划把完整岗位要求矩阵转换为准备事项：

- 强项：复盘真实证据和决策；
- 可迁移或弱项：说明证据，同时诚实声明边界；
- 缺口或未知：准备诚实回答、学习计划或澄清问题；
- STAR 故事：只能引用同一段已确认经历；
- 日程：必须覆盖每条岗位要求；
- 反向问题：可引用公司资料，但使用中性、可验证的问法。

系统报告准备工作量和风险项，不编造面试通过概率。

## 求职进展状态机

岗位分析状态与求职进展状态分开：

```text
JobOpportunity.status
  -> captured | analyzed

OpportunityEvent replay
  -> discovered | saved | preparing | applied
  -> interviewing | offer | accepted/rejected/withdrawn/closed
```

用户陈述先被结构化为候选事件，应用层校验转换，用户确认后事务追加。事件同时保存业务发生时间和系统记录时间，但状态重放只按照不可变序列号进行。

生成 CV、计算高分、收到邮件或日历会议都不会直接改变求职状态。未来集成最多只能创建待确认事件，不能取得直接写权限。

## `/career` 动态工作台

`/career` 和 `get_career_dashboard` 使用同一个只读投影：

```text
已确认版本 + 待确认草稿 + OpportunityEvent 重放
  -> 阶段数量
  -> 待确认事项
  -> 最近活动
  -> 确定性的下一步建议
```

工作台不是新的记录源。它不保存第二套状态、不确认草稿，也不执行建议。派生产物会检查所绑定的输入版本；输入变化后，历史产物仍保留，但会被标记为过期并建议重新生成。

## 本地持久化

Career Steward 使用 Node.js 内置 SQLite，数据位于：

```text
.career-steward/
  -> career-steward.sqlite
  -> career-steward.sqlite-wal
  -> career-steward.sqlite-shm
```

Pi 会话历史不是系统记录源。Schema 1–9 逐步增加了档案、岗位分析、匹配报告、公司调研、职业偏好、Employer Fit、定制 CV、面试计划、求职事件和档案修订草稿。

核心数据采用草稿与不可变版本分离的表结构。下游报告绑定输入版本和策略版本，使结果可追踪、可重算，而不是原地覆盖。

## 备份与恢复

备份使用 SQLite Online Backup API，不直接复制主库、WAL 和 SHM 文件，避免得到不同时间点的破损快照。

```text
CareerStore
  -> SQLite Online Backup
  -> 工作区内快照
  -> quick_check + Schema + 核心表 + SHA-256
```

恢复必须使用 Pi 交互 UI 确认。覆盖前会自动创建 `pre-restore` 安全备份，并再次验证用户审阅过的 SHA-256。系统拒绝损坏文件、非 Career Steward 数据、Schema 0 和高于当前程序的未来 Schema。

数据库和备份没有应用层加密，必须依靠操作系统权限和独立保护的备份介质。

## Skill、Tool 和 Extension 的职责

- Skill：告诉 Pi 如何组织多步骤工作流和何时调用工具；
- Tool：提供带 Schema 的确定性领域能力和持久化边界；
- Extension：向 Pi 注册工具、命令和交互确认；
- Domain/Application：保存不依赖 Pi 的业务规则；
- Infrastructure：实现 SQLite 和本地文件能力。

1.0 不使用子 Agent。未来只有当来源调研、多个岗位批量比较或独立评审可并行且结果可合并时，才考虑在 `TaskExecutor` 接口后引入子 Agent；子 Agent 不能绕过领域校验和确认。

## 演进接口

- `DocumentParser`：增加 DOCX、HTML、Markdown 或 OCR；
- `CompanySource`：增加新的官方、媒体或社区适配器；
- `MatchStrategy`：增加职位族专用匹配策略；
- `ResumeRenderer`：增加 PDF 等输出格式；
- `TaskExecutor`：可选子 Agent 执行；
- `OpportunityEventSource`：接入邮箱、日历、浏览器或 ATS，但只创建待确认事件。

具体长期决策请参阅 [ADR 中文索引](decisions.md) 和[英文 ADR 原文](../decisions/)。
