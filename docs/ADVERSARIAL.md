# 对抗记录（ADVERSARIAL）

本文件记录"证明这个工具真的有效"的对抗过程。**只对好输入报通过的检查等于没有**，
所以每条结论都配了反例或对照实验。

## 1. 先证明扫描器有效：21 个已知坏输入

`skill/scripts/selftest.py` 构造 21 个一次性 fixture，逐个断言"类别 → 最高严重级"。
覆盖到的坏输入类型：

| 类别 | 已知坏输入 | 期望 |
|---|---|---|
| A | 依赖 GPL-3.0 / 依赖 CC-BY-NC / 项目无许可证 | BLOCK |
| A | 仅 package.json 字段无 LICENSE 文件 / 有 LICENSE 文件无字段 / 两处不一致 | WARN |
| A | 多许可文件并存（MIT + Apache 文本） | INFO |
| B | 源码文件带 `// SPDX-License-Identifier: GPL-2.0-only` | BLOCK |
| B | 他人版权行 | WARN |
| B | 自有版权行 + THIRD-PARTY-NOTICES | 不报（防误报） |
| B | 文档里引用 GPL 示例 / 字符串字面量里的 SPDX 头 | 不报（防误报） |
| C | 无许可说明的字体 / 署名文件声明 CC-BY-NC | WARN |
| C | 说明文档解释 NC 规则 | 只 INFO |
| D | 名称命中知名商标 / 描述性命名 | WARN / 绝不 BLOCK |
| E | 疑似 `sk-` 密钥 / `.pem` 私钥文件 | BLOCK |
| E | 干净项目（MIT + 宽松依赖） | 零发现 |

断言用"恰好等于"而非"至少"：既防漏报（本该 WARN 的类别静默无发现会失败），
也防误报升级（本应 INFO 的类别报成 WARN 同样失败）。

## 2. 证明运行器与扫描器不会漂移

`test/parity.test.mjs` 对同一 fixture 分别走"插件运行器"和"直接 CLI"，
**深比 `findings` 数组与 verdict**。若哪天有人在运行器里做过滤或改写，
这个用例会失败——而不是悄悄让两条路径给出不同结论。

## 3. 证明检查结果是真的（自审抓出 13 条误报）

用工具审它自己，第一轮得到 `🚫 不建议发布（BLOCK ×5, WARN ×7）`，全部是误报：

| 误报 | 根因 | 修法 |
|---|---|---|
| README/SKILL.md "标注强传染许可证" | 文档**举例**写出 `SPDX-License-Identifier: GPL-2.0-only` 被当成真许可证头 | B 类只扫源码文件（`SOURCE_EXTS`） |
| selftest.py 标注 GPL 头 | 测试夹具里的字符串字面量 | 再加"行首必须是注释标记" |
| selftest.py "疑似他人版权行" ×4 | 同上，夹具数据 | 同上 |
| release_audit.py "疑似复制自外部项目" | 正则表达式自身包含 `copied from` | 同上（该行不是注释行） |
| README/SKILL.md/verdict-basis.md "引用 NC/ND 授权素材" | 说明文档在**解释**规则 | NC/ND 仅在 LICENSE/CREDITS/NOTICE 类文件告警，散文降到 INFO |
| selftest.py "疑似密钥" + "私钥内容" | 夹具需要密钥形状才能测检测器 | 夹具改为拼接生成（`"sk-" + "proj-" + "a"*24`），源码里不再出现密钥形状 |

修完自审回到 `✅ 可发布（INFO ×3）`，剩下 3 条 INFO 正是"文档在解释 NC 规则"，准确。

**这条循环本身就是方法论**：自审 = 最便宜的对抗用例；误报不清零，工具就会被用户忽略。

## 4. 证明"没报错"是有信息量的

在隔离 profile 里 boot 插件，用一个探针插件查询 `ctx.tools.schemas()`：

- 正常插件：`[ria2] total=2 audit=true` —— 工具确实在运行时注册表里
- 对照实验：故意把 output schema 写成缺 `additionalProperties` 的对象 →
  boot 报 `JsonSchemaError: schema.additionalProperties must be explicitly true or false`

对照实验证明加载器对非法定义**会**报错，因此"boot 干净通过"不是沉默的失败。

## 5. 仍然没有证明的部分（如实列出）

- 图片相似度、图标是否抄袭：离线无法判定，只列为人工复核
- 整段改写后的代码抄袭：基于头/版权行/标记的检测查不出
- 商标近似（非同名词）：只做关键词初筛
