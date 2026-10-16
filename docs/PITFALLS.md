# 踩坑记录（PITFALLS）

都是这次开发中真实发生的，不是推测。

## 1. pnpm 对同一路径的 `file:` 依赖会复用缓存

改完源码后执行 `dsh plugin --profile X add file:/path/to/plugin`，命令报成功，
但 profile 里的副本**还是旧的**：实测 `stat` 显示 inode 与源码不同（是复制而非硬链接），
`grep` 新规则标记得到 0。

对策：改源码后重新安装要 **bump version**，或换一个路径安装；
验证方式不是看安装命令的输出，而是到
`$DSH_HOME/profiles/<p>/node_modules/<pkg>/` 里 `grep` 新内容。

## 2. 依赖残留会让后续所有安装失败

删掉插件源目录（如 `/tmp/ria-bad`）后，profile 的依赖列表仍指向它，
于是后续 `add` 全部报：

```
[ENOENT] ENOENT: no such file or directory, scandir '/tmp/ria-bad'
```

对策：删目录前先 `dsh plugin --profile X remove <pkg>`；已经卡住就先 remove 再 add。

## 3. desktop profile 由 Electron 独占托管

`dsh --profile desktop --dump-config` 会被拒绝（AGENTS.md 已记录）。
安装插件本身没问题（`dsh plugin --profile desktop add ...`），但要**重启 App** 才生效。
验证插件是否真的注册，应在隔离 profile（如 `--from-default-profile web` + 独立 `DSH_HOME`）里做。

## 4. schema 必须显式声明 `additionalProperties`

官方 JSON schema 校验要求每个 object 显式 `additionalProperties: true|false`，否则 boot 报：

```
JsonSchemaError: unsupported JSON schema: schema.additionalProperties must be explicitly true or false
```

好在报错会点名插件与文件位置。**这条也顺手变成了验证资产**：它证明"boot 没报错"是有信息量的。

## 5. `defineTool` 返回的是编译后的定义

不要按 DSL 原样断言。实际拿到的是：

- `parameters` → 已是 JSON Schema：`{type:'object', properties:{...}, required:['path']}`
  （DSL 里的 `required: true` 被提升为对象级 `required` 数组）
- `output` → `{schema, render}`，`schema` 同样已编译
- 另有 `timeoutMs`、`execute`、`isConcurrencySafe`

## 6. 非零退出码是结论，不是异常

扫描器用 `0/1/2` 表达 干净/警告/阻断。踩到的具体形态：
测试里用 `execFileSync` 直调 CLI，遇到退出码 2 会**抛异常**，
必须从 `error.stdout` 里取报告，否则"有阻断项"会被误读成"命令失败"。

## 7. 插件注册是异步的：快退进程里查不到工具

在 `--help` 这种快速退出的 boot 中，探针插件在 `apply` 同步阶段查
`ctx.tools.schemas()` 得到 `total=0`；而正式插件在**其后**才注册。
必须让进程活着（web 模式常驻）再用定时器查询，才能拿到真实快照。

## 8. 载荷里的密钥形状字符串会触发仓库自己的检查

`selftest.py` 需要"看起来像密钥"的夹具才能测检测器，但直接写字面量会让
工作区 `check-secrets.sh` 把夹具当真实密钥拦下。夹具改为拼接生成：

```python
FAKE_SK = "sk-" + "proj-" + "a" * 24
```

同样地，`test/runner.test.mjs` 用 `sk-${'A'.repeat(24)}` 而不是字面量。

## 9. 第三方插件不要 import host 包（除工具定义外）

本机既有插件（voice-personal、pool-credits、skills-hub）运行时只用 `ctx` 服务，
不 import `@deepseek-ai/*`。但 `@deepseek-ai/dsh-tools` 是例外：
它是**工具定义**的来源，实测第三方插件 import 它可以正常解析（host 提供）。

对策：把它放进 `devDependencies`（只供单元测试），不要放进 `dependencies`，
以免装出第二份实例；运行时用 host 的那一份。
