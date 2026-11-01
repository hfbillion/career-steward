# Career Steward · 职业管家

[简体中文](README.md) | [English](../../README.md)

Career Steward 1.0 是一个构建在 Pi 之上的开源、本地优先求职智能体。它以候选人的真实证据为基础，帮助用户管理职业档案、分析岗位和公司、生成诚实且适合 ATS 的简历、制定面试计划，并跟踪求职进展。

Pi 负责自然语言交互和任务编排；Career Steward 负责校验、确定性策略、版本化数据和用户确认边界。

```text
简历证据
  -> 候选人档案
  -> JD 与公司分析
  -> 可解释匹配
  -> 定制 CV
  -> 面试计划
  -> 用户确认的求职进度
```

## 1.0 能力

- 解析文字型 PDF 简历，并保留稳定的证据位置；
- 创建、修订和查询不可变的 Candidate Profile 历史版本；
- 结构化分析 JD，区分明确要求和推断要求；
- 构建完整的 Requirement–Evidence Matrix；
- 使用版本化 TypeScript 策略计算岗位匹配度；
- 明确展示强项、可迁移能力、弱项、缺口和未知项；
- 根据官方、专业媒体、社区和雇主奖项来源研究公司；
- 分开计算岗位能力匹配和 Employer Fit；
- 生成有证据约束、单栏、ATS 友好的定制 CV；
- 导出 Markdown 和 DOCX；
- 生成面试准备矩阵、STAR 故事、学习计划和反向面试问题；
- 通过不可变事件管理收藏、准备、已投递、面试、Offer 和终止状态；
- 使用 `/career` 查看动态工作台；
- 使用本地 SQLite 保存数据，并支持一致性备份和确认式恢复；
- 提供 4 个 Pi Skills 和 36 个领域工具。

## 要求

- Node.js 24 或更高版本；
- Pi 1.4 或更高版本；
- npm。

## 快速开始

```bash
git clone https://github.com/hfbillion/career-steward.git
cd career-steward
npm install
npm run release:check
pi install --local .
```

进入 Pi 后，可以执行 `/career`，也可以直接告诉 Pi：

```text
请导入 workspace 中的 resume.pdf，并帮我建立候选人档案。
```

简历文件必须位于当前可信工作区内。1.0 只支持文字型 PDF；扫描件、OCR、DOCX、HTML 和图片简历不在范围内。

## 典型工作流

### 管理候选人档案

```text
import_resume
  -> propose_candidate_profile
  -> 用户审阅
  -> confirm_candidate_profile
  -> get_candidate_profile
```

模型只能提出结构化内容。每个职业事实必须引用简历块或明确的用户陈述，确认后才会成为新的档案版本。

### 分析岗位和匹配度

```text
create_job_opportunity
  -> propose_job_analysis
  -> 用户审阅并确认
  -> calculate_job_match
  -> get_job_match
```

模型负责语义判断和证据映射，但不能提交最终分数、权重或加分项。分数由 `matching-policy/1.0` 在应用代码中确定性计算。

### 调研公司和雇主适配

```text
搜索/浏览发现 URL
  -> fetch_company_source
  -> propose_company_research
  -> 用户确认
  -> calculate_employer_fit
```

官方事实、专业报道、社区口碑、雇主奖项和模型推断会分别记录。社区评价不会被伪装成公司事实，“最佳雇主”奖项会保留发布机构和时间范围。

### 生成定制 CV

```text
已确认档案 + 已确认 JD 分析 + 当前 Match Report
  -> propose_tailored_resume
  -> 用户检查证据、覆盖率和 ATS 提示
  -> confirm_tailored_resume
  -> export_tailored_resume
```

缺口和未知要求不能被写成候选人已经具备的能力。1.0 支持 Markdown 和单栏 DOCX 导出，不承诺任何特定 ATS 厂商一定接受或提高排名。

### 面试准备与进度管理

面试计划覆盖每一条岗位要求，并区分优势复盘、可迁移能力说明、缺口应对和待澄清问题。STAR 故事只能使用同一段已确认经历中的证据。

求职状态只能通过用户确认的事件改变。系统不会因为生成了 CV、收到邮件或日历出现会议，就自动把岗位标记为“已投递”或“面试中”。

## `/career` 工作台

`/career` 是只读动态投影，展示候选人档案状态、各求职阶段数量、等待确认的草稿、最近进展和确定性的下一步建议。工作台不会保存第二套状态，也不会自动执行建议。

## 数据、隐私与安全

应用数据默认位于：

```text
.career-steward/career-steward.sqlite
```

导出文件和备份也保留在可信工作区内。数据库和备份包含敏感职业信息，Career Steward 不提供应用层加密，请使用操作系统权限和受保护的备份位置。

Pi 和所配置的模型服务商在正常工作过程中仍可能接收到提示词或工具结果。处理个人信息前，请检查对应服务的隐私和数据保留政策。

公司资料抓取只允许公开 HTTP(S) 地址，并限制重定向、超时、媒体类型和响应大小，同时阻止私网、回环地址和云元数据地址。成功抓取不代表页面内容一定真实。

不要提交真实简历、导出的 CV、SQLite 数据库、备份文件或 API Key。详细说明见[中文安全政策](../../SECURITY.zh-CN.md)。

## 开发与验证

```bash
npm run check
npm test
npm run test:acceptance
npm run release:check
```

`release:check` 会执行严格 TypeScript 检查、全部测试和生产构建。

## 文档

- [中文架构说明](architecture.md)
- [中文 1.0 验收说明](acceptance-1.0.md)
- [ADR 中文索引](decisions.md)
- [英文架构原文](../architecture.md)
- [中文贡献指南](../../CONTRIBUTING.zh-CN.md)
- [中文变更日志](../../CHANGELOG.zh-CN.md)

## 贡献与许可证

欢迎提交 Issue 和聚焦明确的 Pull Request。请使用虚构测试数据，运行 `npm run release:check`，并为持久架构规则的变化补充 ADR。参见[中文贡献指南](../../CONTRIBUTING.zh-CN.md)。

Career Steward 使用 [MIT License](../../LICENSE)。
