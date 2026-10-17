# dsh-release-infringement-audit

**English docs: [README.en.md](README.en.md)**

**DSH 插件**：给 agent 一个工具 `release_infringement_audit`，在项目发布到 npm / ClawHub / GitHub **之前**审核侵权风险。

```text
模型 → release_infringement_audit(path)
     → skill/scripts/release_audit.py（五大类扫描）
     → BLOCK / WARN / INFO 分级清单 + Markdown 报告
```

## 为什么做这个

发布前的法律侧检查过去靠人肉回忆：依赖许可证有没有 GPL 传染？这段代码是不是抄的？
图标字体有没有授权？项目名会不会撞商标？密钥有没有混进去？
本插件把这件事变成一次工具调用，判定锚定 **SPDX 官方数据、FSF GPL FAQ、
Creative Commons 官方立场**，而不是模型直觉。

## 安装

```bash
# 从本地目录安装（开发版）
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" \
  plugin --profile desktop add file:/path/to/dsh-release-infringement-audit

# 从 npm 安装（发布后）
dsh plugin --profile desktop add dsh-release-infringement-audit
```

装完重启 DSH。之后任何会话里 agent 都能调用该工具。

## 配置（`cordis.patch.yml`）

| 字段 | 默认 | 说明 |
|---|---|---|
| `python` | 空 | 运行扫描器的解释器。空 = `$DSH_AUDIT_PYTHON` → `$PYTHON` → `python3` |
| `timeoutMs` | `120000` | 单次审核预算。依赖未安装时每个包都要查 registry，慢的情况在这里调 |
| `offline` | `false` | `true` = 完全不访问 npm registry（依赖名/版本不外发）；未安装依赖的许可证报 INFO |

## 工具契约

**参数**：`path`（必填）— 要审核的项目目录绝对路径。

**返回**：

| 字段 | 含义 |
|---|---|
| `verdict` | 结论文案（✅ 可发布 / 🟡 修复后可发布 / 🚫 不建议发布） |
| `exitCode` | `0` 干净 · `1` 仅警告 · `2` 存在阻断项 |
| `counts` | `{block, warn, info}` |
| `findings[]` | 每条含 `category`(A–E)、`severity`、`title`、`evidence`、`basis`、`fix` |
| `report` | Markdown 报告，可直接展示给用户 |

退出码 1/2 是**正常结论**而非失败：运行器把它们读成结果，而不是抛错。

## 五类风险

| 类别 | 覆盖 | 阻断示例 |
|---|---|---|
| A 许可证 | 依赖 license 与本项目冲突 | 依赖 GPL-3.0；依赖 CC-BY-NC 素材包；项目无许可证 |
| B 第三方代码 | SPDX 头、他人版权行、copied-from 标记 | 源文件带 `SPDX-License-Identifier: GPL-2.0-only` |
| C 素材 | 字体再分发、CC-NC、无来源图片 | 无 OFL 说明的 `.ttf` |
| D 商标 | 项目名/标题撞知名商标 | 命名含知名品牌（仅 WARN，描述性使用可抗辩） |
| E 密钥 | 内置规则；**绝不执行被审项目脚本** | `sk-` / `ghp_` / `AKIA` / 私钥内容 |

## 验证（本项目自己的纪律）

```bash
npm install          # 只装 devDependency（@deepseek-ai/dsh-tools，供单元测试）
npm test             # 19 个 node 用例：工具契约 + 真跑 python 集成 + CLI 一致性
npm run selftest     # 24 个 python 用例：用已知坏输入证明扫描器有效
```

已被证明的三件事（缺一不可）：

1. **扫描器有效**：24 个「已知坏输入」用例全过，另有干净项目零误报用例。
2. **工具在运行时真的注册**：在隔离 profile 里 boot，用一个探针插件查询
   `ctx.tools.schemas()` → `total=2 auditTool=true`。
   （对照实验：故意写错 schema 的插件 boot 时报
   `JsonSchemaError: schema.additionalProperties must be explicitly true or false`，
   说明「没报错」是有信息量的。）
3. **插件路径与 CLI 路径结果一致**：`test/parity.test.mjs` 对同一 fixture 深比
   `findings` 数组，防止运行器悄悄改写扫描器结论。

## 独立技能（可选）

本插件同时携带完整技能载荷（`skill/`）。不想装插件也能用：

```bash
./scripts/install-skill.sh          # 复制到 $DSH_HOME/skills/release-infringement-audit
python3 ~/.dsh/skills/release-infringement-audit/scripts/release_audit.py <项目目录>
```

## 局限（如实说明）

- 自动化初筛，**不构成法律意见**。BLOCK/WARN 需人工处置，拿不准咨询律师。
- 图片/图标的来源与相似度无法离线判定，只列为人工复核项。
- 商标检测是关键词初筛，命中 ≠ 侵权（指示性使用通常可抗辩）。
- 代码抄袭检测基于头部/版权行/标记，不做大规模指纹比对；整段改写过的抄袭查不出。
- 依赖未 `npm install` 且无网络时，部分依赖许可证无法解析（报 INFO）。

## 许可

MIT，见 [LICENSE](LICENSE)。
