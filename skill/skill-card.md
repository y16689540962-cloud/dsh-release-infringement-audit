# skill: release-infringement-audit

## Description

发布前侵权/法律风险审核技能。给智能体一套可执行的检查流程与脚本：扫描一个项目目录，
按五大类（开源许可证兼容性、复制的第三方代码、文档/图片/字体素材、品牌商标、密钥泄漏）
输出带证据与处置建议的分级清单（BLOCK / WARN / INFO）。

判定锚定 SPDX license list、FSF GPL FAQ、Creative Commons 官方立场与 choosealicense
分类，不依赖模型直觉；输出为自动化初筛，**不构成法律意见**。

## Publisher

justin（DSH 工作台）

## License

MIT

## Use Case

- 把插件发布到 npm、把技能发布到 ClawHub、把项目开源到 GitHub **之前**的最后一道审核
- 引入新依赖、新图标、新字体素材之后
- 用户问「这个能不能发」「有没有侵权风险」

## 运行方式

```bash
# 一键审核（退出码 0 干净 / 1 仅警告 / 2 存在阻断项）
python3 scripts/release_audit.py /path/to/project

# JSON 输出，供智能体进一步处理
python3 scripts/release_audit.py /path/to/project --format json

# 先证明验证器本身有效（21 个已知坏输入用例）
python3 scripts/selftest.py
```

## 依赖

- `python3`（仅标准库；无第三方包）
- 可选：被审项目根目录若有 `check-secrets.sh`，密钥扫描会委托它执行

## 已知局限

- 图片/图标来源与相似度无法离线判定，只列为人工复核项
- 商标检测是关键词初筛，命中 ≠ 侵权（指示性使用通常可抗辩）
- 代码抄袭检测基于许可证头/版权行/来源标记，不做大规模指纹比对
- 依赖未安装且无网络时，部分依赖许可证无法解析（报 INFO）

## 配套插件

DSH 插件 `dsh-release-infringement-audit` 注册工具 `release_infringement_audit(path)`，
装插件后无需手敲命令。
