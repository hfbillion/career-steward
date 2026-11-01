# Career Steward ADR 中文索引

[中文架构说明](architecture.md) | [英文 ADR 目录](../decisions/)

ADR 是长期架构决策的权威记录。以下中文内容用于快速理解，不替代对应英文原文。

## ADR-003：确定性、证据约束的岗位匹配

[查看英文原文](../decisions/ADR-003-deterministic-matching.md)

- 模型只负责把每条岗位要求映射为 `strong`、`transferable`、`weak`、`gap` 或 `unknown`；
- 正向判断必须引用已确认候选人证据；
- 权重、上限和最终分数由 `matching-policy/1.0` 计算；
- 能力得分、证据覆盖率、置信度和最终匹配分开显示；
- 关键 Must 缺口不能被其他高分平均掉。

这保证匹配报告可解释、可重算，也避免模型直接制造看似精确的百分比。

## ADR-004：分来源公司情报与独立 Employer Fit

[查看英文原文](../decisions/ADR-004-company-intelligence-and-employer-fit.md)

- 官方、媒体、社区、奖项和推断使用不同来源与结论类型；
- 社区口碑保留为情绪信号，允许冲突；
- “最佳雇主”保留机构和时间范围；
- 用户职业偏好需要确认；
- Employer Fit 与岗位能力匹配分开计算；
- Deal Breaker 冲突或未知会触发确定性分数上限。

## ADR-005：证据约束、ATS 兼容的定制 CV

[查看英文原文](../decisions/ADR-005-evidence-grounded-ats-cv.md)

- Candidate Profile 是事实源，定制 CV 是投影；
- 模型改写必须同时引用候选人证据和岗位要求；
- 缺口和未知项不能写成候选人能力；
- 真值校验优先于 ATS 校验；
- 1.0 使用单栏 Markdown 作为确认内容的标准表达。

## ADR-006：证据约束的面试准备计划

[查看英文原文](../decisions/ADR-006-evidence-grounded-interview-plan.md)

- 每条岗位要求必须恰好对应一个准备事项；
- 强项复盘证据，弱项和缺口必须诚实声明边界；
- STAR 故事绑定单一已确认经历，禁止跨公司拼接；
- 日程必须覆盖所有要求；
- 系统不生成虚假的面试通过率。

## ADR-007：用户确认、事件溯源的求职进展

[查看英文原文](../decisions/ADR-007-event-sourced-opportunity-tracking.md)

- 进展使用不可变事件，而不是直接修改一个状态字段；
- 只有用户确认的事件可以改变状态；
- 事件序列决定重放顺序，历史发生时间不会重写后续状态；
- JD 分析状态和求职进展状态保持独立；
- 未来邮箱或日历集成只能提出待确认事件。

## ADR-008：证据约束的 Candidate Profile 修订

[查看英文原文](../decisions/ADR-008-evidence-grounded-profile-amendments.md)

- 已确认档案不可变；
- 修订采用完整替换草稿，使删除可见；
- 新值仍需简历证据或明确用户陈述；
- 草稿绑定基础版本，过期确认会被事务拒绝；
- 下游生成内容不能反向成为候选人事实证据。

## ADR-009：ATS 简历导出 Renderer

[查看英文原文](../decisions/ADR-009-ats-resume-export-renderers.md)

- 已确认 Markdown 和结构化字段是内容记录源；
- Renderer 只能改变格式，不能改变措辞或增加声明；
- DOCX 采用单栏、标准标题和真实列表，不使用表格、图片、文本框、页眉或页脚；
- 导出不覆盖已有文件，并返回版本、大小和 SHA-256；
- PDF 延后到独立 Renderer 和验证策略。

## ADR-010：只读动态 Career Dashboard

[查看英文原文](../decisions/ADR-010-read-only-dynamic-career-dashboard.md)

- `/career` 和结构化工具共享同一应用投影；
- 阶段数量来自事件重放，待确认草稿保持独立；
- 工作台不保存状态、不确认草稿、不执行建议；
- 派生产物绑定的输入版本变化后会显示为过期；
- 建议是确定性计算，并避免与现有待确认草稿重复。

## ADR-011：受限的公开公司资料获取

[查看英文原文](../decisions/ADR-011-bounded-public-company-source-acquisition.md)

- 工具只抓取单个公开 HTTP(S) URL，不负责搜索或判断来源级别；
- 初始地址和每次重定向都执行 SSRF 检查；
- DNS 验证结果会固定到连接，避免重新绑定攻击；
- 请求限制为 15 秒、最多 5 次重定向、1 MB 响应和 20,000 字符文本；
- 只接受 HTML、XHTML 和纯文本，不执行 JavaScript；
- 响应哈希用于审计，不代表内容真实。

## ADR-012：需要确认的本地数据恢复

[查看英文原文](../decisions/ADR-012-confirmation-gated-local-data-recovery.md)

- 备份使用 SQLite Online Backup API，而不是直接复制 WAL 文件组；
- 快照必须位于可信工作区内且不能覆盖已有文件；
- 恢复前检查路径、完整性、Schema、核心表和 SHA-256；
- 恢复必须使用交互 UI 确认，Headless 模式拒绝；
- 覆盖当前库前自动创建 `pre-restore` 安全快照；
- 恢复失败时自动回滚；
- 备份包含完整个人数据，但不提供应用层加密。
