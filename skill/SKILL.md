---
name: release-infringement-audit
description: 发布前侵权/法律风险审核。当用户说「发布前审一下」「有没有侵权风险」「能发到 npm/ClawHub/GitHub 吗」「release audit」时使用。扫描开源许可证兼容性（GPL 传染/CC-NC）、复制的第三方代码、文档图片字体素材、商标冲突、密钥泄漏五大类，输出结构化分级报告。判定锚定 SPDX 与 FSF/CC 官方分类。
version: 1.0.0
license: MIT
metadata: {"openclaw":{"requires":{"bins":["python3"]}}}
---

# 发布前侵权风险审核（Release Infringement Audit）

对即将发布到公共平台（npm / ClawHub / GitHub）的项目做侵权风险初筛。
**输出是结构化分级清单，不是泛泛而谈；每条发现都带证据、依据、处置建议。**

## 何时使用

- 发布插件/skill/仓库前的最后一道审核
- 用户问「这个能不能发」「有没有侵权/版权/许可证风险」
- 引入了新依赖、新素材、新图标之后

## 快速开始

> 已装 DSH 插件 `dsh-release-infringement-audit` 时，直接调用工具
> `release_infringement_audit(path)` 即可，不必手敲命令；下面是没装插件时的等价用法。

```bash
# 审核一个项目（在项目目录外运行）
python3 <skill目录>/scripts/release_audit.py /path/to/project

# 输出 JSON（供智能体进一步处理）
python3 <skill目录>/scripts/release_audit.py /path/to/project --format json

# 写入报告文件
python3 <skill目录>/scripts/release_audit.py /path/to/project --out audit-report.md
```

退出码：`0` 干净 · `1` 仅警告 · `2` 存在阻断项。

## 审核范围（五大类）

| 类别 | 内容 | 阻断示例 |
|---|---|---|
| A 开源许可证兼容性 | 依赖 license 与本项目冲突 | 依赖 GPL-3.0；依赖 CC-BY-NC 素材包；项目自身无许可证 |
| B 复制的第三方代码 | SPDX 头、版权行、copied-from 标记 | 源码文件带 `SPDX-License-Identifier: GPL-2.0-only` |
| C 文档/图片/字体 | 字体再分发、CC-NC 素材、无来源图片 | 无 OFL 说明的 .ttf；文档引用 NC 授权素材 |
| D 品牌与商标 | 项目名与知名商标冲突 | 命名含知名品牌（仅 WARN，描述性使用可抗辩） |
| E 密钥与隐私 | 有 check-secrets.sh 时委托它，否则内置规则 | sk-/ghp_/AKIA/私钥内容 |

## 结论分级

- **BLOCK** → 🚫 先处置再发布（退出码 2）
- **WARN** → 🟡 修复或书面确认后发布（退出码 1）
- **INFO** → ℹ️ 人工复核提示

## 智能体执行要点

1. 先跑 `selftest.py` 确认验证器本身有效（环境差异可能导致脚本损坏）：
   `python3 <skill目录>/scripts/selftest.py` —— 18 用例应全过
2. 跑审核，拿到 JSON/MD 报告
3. **逐条向用户念出 BLOCK/WARN 项**，不要只说「通过」
4. 对 INFO 项提醒人工复核范围：README 外链图片、大段引文、图标是否原创
5. 报告末尾有免责声明：自动化初筛 ≠ 法律意见

## 判定依据

见 [references/verdict-basis.md](references/verdict-basis.md)。
核心锚点：SPDX license list（spdx.org/licenses）、FSF GPL FAQ、
Creative Commons 官方「CC 不建议用于软件」、choosealicense.com 分类。

## 与工作区现有工具的关系

- **check-secrets.sh**（工作区根目录）：E 类密钥扫描优先委托它执行，规则同源不重复造轮子；项目里没有它时用内置同源模式
- **dsh-plugin-release skill**：管发布流程（平台选择/凭据/验证），本 skill 管「能不能发」的法律侧，二者互补
