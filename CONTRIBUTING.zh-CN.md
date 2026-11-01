# 为 Career Steward 贡献代码

[简体中文](CONTRIBUTING.zh-CN.md) | [English](CONTRIBUTING.md)

感谢你帮助改进 Career Steward。所有贡献都应维护项目“本地优先、证据约束、确认后写入”的设计原则。

## 开发环境

- Node.js 24 或更高版本；
- npm；
- Pi 1.4 或更高版本，用于扩展交互测试。

```bash
git clone https://github.com/hfbillion/career-steward.git
cd career-steward
npm install
npm run release:check
pi install --local .
```

## Pull Request 要求

请保持 PR 聚焦，并包含：

- 用户问题和预期行为；
- 对领域、持久化或安全边界变化的测试；
- 用户可见行为的文档；
- 改变长期架构规则时，在 `docs/decisions/` 下新增或更新 ADR；
- `npm run release:check` 通过的确认。

请勿提交真实简历、求职记录、公司调研快照、SQLite 数据库、导出 CV、API Key 或其他个人信息。测试应使用 `test/` 中类似的虚构数据。

## 设计约束

- Pi 负责交互和编排，Career Steward 负责校验和持久化状态；
- 模型输出本身不是证据；
- 破坏性操作和激活状态的操作必须明确确认；
- 历史版本和求职进展事件保持追加写入；
- 新文档格式通过 Parser 或 Renderer 适配器扩展；
- 网络能力必须保留公开地址验证、超时和大小限制。

## 编码与测试

- 保持严格 TypeScript 和 `exactOptionalPropertyTypes` 兼容；
- 优先编写确定性的应用层、领域层测试；
- 默认测试不得依赖实时模型和外部网站；
- 开发时运行目标测试，提交 PR 前运行完整 `npm run release:check`。

提交贡献即表示你同意使用仓库中的 MIT License 授权该贡献。
