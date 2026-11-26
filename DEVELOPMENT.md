# CardKit 开发计划

> 本文是 CardKit 的唯一开发大纲：语法规范、里程碑、验收口径与已知环境约束。
> 里程碑状态在实现过程中就地更新（M0 已完成项已标注）。

## 1. 项目定位

CardKit 把代码块渲染成卡片：包头用 YAML 描述元信息，包头之后是原文正文（代码、命令、payload）。
它是旧插件 `obsidian-payload-plugin` v1.0.2（```payload 微语法）的继任者，必须**零改动**兼容库里已有的
**2039 个 ```payload 块 / 409 篇笔记**（实测于 `D:\Documents\zhang`，只读参考）。

- 插件源码：`D:\code\obsidian-CardKit`（本仓库）
- 唯一测试库：`D:\code\obsidian\test`（插件只装这里）
- **禁止访问**：`D:\Documents\zhang`（只作为只读回归语料，绝不写入）

### 参考源码（只读）

| 位置 | 内容 | 用途 |
| --- | --- | --- |
| `D:\code\obsidian-payload-plugin` | v1.0.2：`main.ts` / `processor.ts` / `modal.ts` / `settings.ts` / `styles.css` | 旧微语法解析、卡片 DOM、编辑弹窗、变量替换、MD↔TXT 同步 |
| `D:\code\obsidian-api-designer-plugin` | `main.ts` / `add-endpoint-modal.ts` / `types.ts` | 端点卡（M9 移植） |

## 2. 已锁定决策

1. **包头用 A**：```card 块内以 `---` 开头的第一段是 YAML 头，**第二个 `---` 之后全部是正文**，正文内不再解释任何标记。
2. **主块名 `card`**；`payload` 作为**永久内建别名**保留（存量兼容，不做迁移、不做弃用倒计时）。
3. **notes 用映射式** `{kind, token, note}` 为准；`payload` 类型额外接受 `"kind | token | note"` 简写。
4. **自定义卡片类型只存插件 `data.json`**；设置页提供 JSON 导入/导出文本框（不写进笔记、不入库）。

### 决策 5（实现时新增，需知悉）

模板的 eslint 规则集里 `obsidianmd/no-plugin-as-component` 是 **error**，它明确禁止把插件实例当作
`MarkdownRenderer.render` 的第 5 个参数（"lifecycle is too long, which can cause memory leaks"），
同时也禁止内联 `new Component()`。

因此实现统一为：**每个代码块创建一个 `MarkdownRenderChild`，用 `ctx.addChild()` 注册，再把它交给
`MarkdownRenderer.render`**。这既满足规则，也比"用插件自身"更准确地绑定了块的生命周期。
（原约束"用插件自身作 Component，禁止 new Component()"中的前半句在 `obsidianmd.configs.recommended` 下无法通过 lint。）

## 3. 环境与基线（M0）

### 3.1 安装与构建

- 模板没有 `node_modules`，第一次必须 `npm install`。
- 本机沙箱下 `npm install` 的 `postinstall` 会因 `spawn EPERM` 失败（子进程管道被拒），
  用 `npm install --ignore-scripts` 可完成安装（310 个包，平台二进制 `@esbuild/win32-x64` 已就位）。
- 同理，`npm run build` 里 esbuild 要以管道方式启动子进程，**普通沙箱下必然 EPERM**；
  本地验证构建需要用放宽权限的方式执行（本仓库开发时按需申请）。
  这是**本机沙箱限制**，不是工程配置问题，`esbuild.config.mjs` 保持模板原样。

### 3.2 生效的 eslint 规则（`npx eslint --print-config src/main.ts`，共 174 条：104 error / 38 warn）

对实现有约束力的规则（error）：

| 规则 | 影响 |
| --- | --- |
| `obsidianmd/no-plugin-as-component` | 见决策 5；`MarkdownRenderer` 的组件必须是 `MarkdownRenderChild` |
| `obsidianmd/no-static-styles-assignment` | 禁止 `el.style.x = 'literal'`；动态样式用 `el.setCssProps({...})` |
| `obsidianmd/no-unsupported-api` | 用到的 API 的 `@since` 不得高于 `manifest.minAppVersion` |
| `obsidianmd/no-forbidden-elements` | 不许 `createElement('link'/'style')` |
| `obsidianmd/platform` | 不许 `navigator.userAgent`，平台判断用 `Platform` |
| `obsidianmd/regex-lookbehind` | 正则不许用 lookbehind |
| `obsidianmd/settings-tab/no-manual-html-headings` | 设置页标题只用 `Setting.setHeading()` |
| `obsidianmd/settings-tab/no-problematic-settings-headings` | 标题里不许出现 "settings" / "General" / 插件名 |
| `obsidianmd/rule-custom-message` | `console` 只允许 `warn` / `error` / `debug` |
| `@typescript-eslint/no-unsafe-*` | 任何 `any` 泄漏都报错：`parseYaml` / `JSON.parse` 的返回值必须先断言再收窄 |
| `@typescript-eslint/no-floating-promises` | Promise 必须 `await` 或 `void` |
| `obsidianmd/sample-names` / `no-sample-code` | 模板示例类名与示例代码必须清空 |

warn 级别（不阻塞，但目标保持 0）：`obsidianmd/vault/iterate`、`prefer-instanceof`、`no-tfile-tfolder-cast`、
`object-assign`、`prefer-create-el`、`prefer-window-timers`、`ui/sentence-case`、`validate-manifest`、`validate-license`。

### 3.3 `minAppVersion` 定为 **1.5.7**

依据是规则自带的 since-map（`node_modules/.cache/eslint-plugin-obsidianmd/since-map.json`，674 条 API→版本），
本插件实际使用与近期会用到的 API 里最高的几个：

| API | `@since` |
| --- | --- |
| `Plugin.registerMarkdownCodeBlockProcessor` | 0.9.7 |
| `MarkdownRenderChild` | 0.12.11 |
| `EditorSuggest` / `registerEditorSuggest`（M8 补全） | 0.12.17 / 0.12.7 |
| `FileManager.processFrontMatter`（M5 写入） | 1.4.4 |
| `AbstractInputSuggest`（M9 端点提示） | 1.4.10 |
| `Plugin.onExternalSettingsChange` / `Vault.getFileByPath` | 1.5.7 |
| `Setting.addComponent` / `SettingGroup`（1.11.0）、`App.secretStorage`（1.11.4） | **不使用** |

`parseYaml`、`MarkdownRenderer.render`、`setCssProps`、`setIcon`、`getSectionInfo` 在 since-map 里**没有 `@since`**，
不构成版本门槛（但从 `@typescript-eslint/no-unsafe-*` 的角度，包头解析仍改为自研小解析器，见 §4）。

> 已知残留告警：`obsidianmd/settings-tab/prefer-setting-definitions`（warn）。
> 声明式设置 API（`getSettingDefinitions`）需要 Obsidian 1.13.0，而当前 `obsidian` typings 是 **1.12.3**，类型里没有该 API，
> 采用就必须把 `minAppVersion` 抬到 1.13.0 并升级 typings。**决定：暂不采用**，等 typings 到位再评估。

### 3.4 M0 产出

- `manifest.json`：id `card-kit`、name `CardKit`、version `0.1.0`、minAppVersion `1.5.7`
- `package.json` / `versions.json` 同步；模板示例代码清空
- `src/core/` 六个模块 + 能渲染裸 ```card 块的最小闭环
- `npm run build` 通过、`npm run lint` 通过（仅上述 1 条已知 warn）
- `src/dev/grammar-smoke.ts` + `scripts/smoke.sh`：不依赖 Obsidian 的语法冒烟（当前 28 项检查）
- 已装进测试库 `D:\code\obsidian\test\.obsidian\plugins\card-kit\` 并在 `community-plugins.json` 里启用；
  冒烟笔记为测试库根目录的 `CardKit 测试.md`

### 3.5 本地验证命令

```bash
npm run build           # tsc -noEmit + esbuild 打包出 main.js
npm run lint            # eslint .
bash scripts/smoke.sh   # 打包并运行语法冒烟（纯函数，不需要 Obsidian）
bash scripts/corpus.sh  # 只读扫描一个库，与旧 v1 解析器逐字段对账（默认 D:/Documents/zhang）
```

装进测试库（本仓库之外唯一允许写入的位置）：

```bash
cp main.js manifest.json styles.css "D:/code/obsidian/test/.obsidian/plugins/card-kit/"
```

Obsidian 里的可视/结构验证（已在 M0 完成）：

```bash
explorer.exe "obsidian://open?vault=test"   # 打开测试库
obsidian vault=test plugins                 # 确认 card-kit 已被识别
obsidian vault=test open path="CardKit 测试.md"
obsidian dev:errors                         # No errors captured.
obsidian eval code='document.querySelectorAll(".card-kit").length'
```

M0 实测结果（测试库 `CardKit 测试.md`，三块）：

| 块 | 结果 |
| --- | --- |
| 带包头的 ```card | 标题「在线解码 JWT」、scope `web`、标签 2 个、notes 2 行（默认折叠）、lang `bash`、2 个按钮；正文里的 `# 注释` **没有被当成标题** |
| 裸 ```card | 无包头、无标题，整块作为代码渲染 |
| 旧 ```payload | 整块作为代码渲染（M0 不做 v1 微语法解析，M2 接管） |

`obsidian dev:errors` 为空；`--card-kit-accent` 解析为主题强调色，说明 `styles.css` 已生效。

**踩坑记录**：Obsidian 在**应用启动时**才扫描 `.obsidian/plugins/`。往插件目录里新放一个插件后，
`plugin:reload`、`reload`（重载库）都不会让它出现（CLI 报 "Plugin \"card-kit\" not found"），
必须重启一次应用。运营期改代码只需 `plugin:reload id=card-kit`。

补充：`obsidian eval` / `obsidian reload` 偶尔会把 CLI 卡住（应用忙时），批量验证时给命令留短超时。

### 3.6 M1 产出与验证（设置页 + 自定义类型）

设置项（`data.json`；`loadSettings` 会重新校验每一项，坏值回退默认）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `accentColor` | `""` | 卡片主色，空 = 跟随主题 |
| `notesDefaultOpen` | `false` | 「语法解析」面板在笔记里一开始是否展开 |
| `customTypes` | `[]` | 自定义卡片类型数组 |

设置页（**设置 → CardKit**）：卡片主色（文本框）、解析默认展开（开关）、
**自定义卡片类型 → JSON 定义**（12 行等宽文本框）+ 三个按钮「校验并保存 / 重新载入 / 清空」。
校验失败时把每条问题列在文本框下方并弹 Notice，**不写盘**。

JSON 形态（`src/core/card-types.ts`，纯函数，冒烟覆盖 17 项）：

```json
[
  { "id": "apicall", "name": "接口调用", "aliases": ["api"],
    "defaults": { "language": "bash", "scope": "web" } }
]
```

- 顶层接受数组，也接受 `{ "types": [...] }`；空文本框 = 清空自定义类型。
- 校验规则：id 与别名必须是 `[a-z0-9-]` 且以字母开头；不得占用内建块名 `card` / `payload`；
  同一份定义里 id 与别名不得重复；`defaults` 只认 `scope` / `language` / `description`。
- 保存成功后只注册"新出现"的块语言（`syncCardProcessors`）；**已打开的笔记重新打开后生效**。
- 加载 `data.json` 时走同一套校验，非法条目丢弃并用 `console.warn` 汇总，不影响插件启动。

实测（测试库，`obsidian plugin:reload id=card-kit` 后 `obsidian eval`）：

| 场景 | 结果 |
| --- | --- |
| `data.json` 写入 accent `#7c3aed`、`notesDefaultOpen: true`、自定义类型 `apicall`（别名 api，默认 bash + web） | 设置正确读入；```apicall 块渲染成卡片，scope `web`、lang `bash` 来自默认字段合并 |
| `notesDefaultOpen: true` | 折叠状态反转，`notesHidden: false` |
| `data.json` 混入 `id: "card"`（内建块名）、`"Bad Id"`（非法字符）、重复的 `dup` | 全部丢弃，只剩合法项 `["apicall","dup"]`；插件正常加载，`dev:errors` 为空 |
| 恢复干净 `data.json` | 回到 `["apicall"]`，无错误 |

### 3.7 M2 产出与验证（v1 兼容层 + 全局变量）

#### 语言与语法的对应

| 块语言 | 有 `---` 包头 | 没包头 |
| --- | --- | --- |
| `card` / 自定义类型 | v2 包头（YAML） | **纯代码**，不解释任何标记（v2 语义） |
| `payload` | v2 包头（YAML） | **v1 微语法**（存量兼容层） |

#### v1 切分规则（`src/core/legacy-parser.ts`）

元信息区从首行开始，遇到下面任一情况就结束，其余全部是正文：

1. **第一个空行**（正文从这里开始）；
2. **第一个不认识的标记行**（即第一行真正的代码）；
3. **第二个 `#` 标题行**——这正是旧解析器"正文里的 `#` 注释把标题覆盖掉"的修复；
4. 注解续行例外：上一行是 `?` 注解、且当前行含 `|` 并且是 `| ...` 或以 `# ` 开头时，
   它被视为该注解的说明续行（库里有大量 `? kind | token` 跨行写法）。

```text
# 1. 解码JWT          <- 标题（旧解析器会被下面的 "# 在线解码" 覆盖）
> 解码JWT令牌         <- 描述（可以多行）
@ all                <- scope（别名 platform / os）
$ bash               <- 语言（别名 lang）
[1]                  <- 步骤
? value | HEADER | JWT头部，包含算法信息
? 简写 | -v | 详细输出          <- payload 额外接受简写式
                     <- 空行：元信息区结束
# 在线解码            <- 正文，原样保留
https://jwt.io
```

#### 全库对账（`bash scripts/corpus.sh`，只读）

与旧 v1 算法（逐行照抄 1.0.2 的 `parsePayload`）在真实库上逐字段对比：

| 指标 | 数值 |
| --- | --- |
| 扫描笔记 | 1030 篇（含卡片块 413 篇；用户口径 409 篇 / 2039 块，库是活的，会随写作增长） |
| 卡片块 | 2068 个（全部 payload，全部走 legacy 分支） |
| 解析出的注解 | 2250 条 |
| 解析异常 / 正文丢行 | **0 / 0** |
| 与旧解析器的字段差异 | 758 处，落在 430 / 2068 个块上 |
| 未分类差异（OTHER / LOST） | **0** → 结果 PASS |

差异全部是**有意修复**，且都有类别名：

| 类别 | 数量 | 含义 |
| --- | --- | --- |
| title-旧解析器把正文标题当标题 | 303 | 第二个 `#` 不再覆盖标题，该行进正文 |
| body-被吞进包头的正文已归还 | 288 | 空行之后的正文不再被当成元信息吃掉 |
| notes-多保留了注解 | 132 | 旧解析器要求 `?` 行必须 3 段，少于 3 段的被丢弃；现在保留 |
| body-旧正文里的注解行归位为注解 | 15 | 跨行注解不再当成代码显示 |
| body-旧解析器正文为空 | 15 | 旧解析器把整块都当标题/描述，代码区空白；现在给出真正文 |
| body-旧解析器多做了首尾 trim | 3 | 旧解析器 `code.trim()` 会削掉首行缩进，现在原样保留 |
| title-旧解析器把注解续行当标题 | 2 | `# | 说明` 这种续行曾变成标题 |

对账脚本只读：不写库、不写笔记，产物落在 `node_modules/.cache/cardkit/`。

#### 真机验证（测试库）

| 样本 | 结果 |
| --- | --- |
| jwt-none-alg 第 1 块 | 标题 `1. 解码JWT`（**不再是"在线解码"**）、scope `all`、notes 2 行、正文首行 `# 在线解码`（注释留在代码里） |
| winpeas 第 1 块 | 标题 `全量扫描`、scope `Windows`、描述 `执行所有Windows提权检查`、正文 `winpeasany.exe` |
| python-reverse 第 1 块 | 标题 `Python反弹`、scope `Linux`、正文为整行 python 命令（`ATTACKER_IP` 占位符原样保留） |
| `obsidian dev:errors` | 无错误 |

**环境注意**：本机上 Obsidian 窗口始终是 `document.visibilityState === "hidden"`（Chromium 不为隐藏窗口排版），
阅读视图只渲染首个分块（约 2 个代码块）。所以样本验证改用小块笔记逐条确认；
全量覆盖靠 `scripts/corpus.sh`（纯函数，不依赖窗口）。

#### 全局变量

- 设置页「全局变量」：逐行填 key / 值，可增删；`data.json` 里是 `globalVariables: [{key, value}]`，加载时同样校验。
- 卡片页脚有「复制」（把 `{{key}}` 替换成值）与「复制原文」（未替换）；
  只有配置了变量时才出现「复制原文」，否则页脚只留一个按钮。
- 替换是纯字符串替换（不是正则），未配置的占位符原样保留，`{{}}` 被忽略。

### 3.8 M3 产出与验证（notes 面板打磨 + 字段缺省与错误提示）

#### 字段缺省

| 字段 | 缺省行为 |
| --- | --- |
| `title` / `description` / `scope` / `step` | 没写就是 `null`，元素不渲染；全空时整个标题区自动 `detach()` |
| `language` | 没给或不认识 → `plaintext`；`yak`→`python`、`shell`→`bash`、`ps1`→`powershell`、`cmd`→`batch` |
| `tags` / `notes` | 空数组，不渲染 |
| 自定义类型 `defaults` | 只在块自己没给该字段时补（`scope` / `language` / `description`） |
| `payload` 无包头 | 走 v1 微语法；`card` 无包头 = 纯代码（v2 语义） |

#### 错误提示（带行号）

- 每条问题都带行号：能拿到 `getSectionInfo()` 时是**笔记里的绝对行号**，否则退回块内行号。
- 覆盖范围：无法解析的包头行、拼错的字段名（编辑距离 ≤ 2 时给出"是不是想写 X？"）、
  `key:` 后面没值、`|` / `>` 多行块标量（不支持）、notes 写成行内、注解缺 `|`、
  `---` 未闭合、notes 里不认识的字段。
- 距离较远的陌生字段**不报警**，只放进 `header.extra`（自定义类型可读），避免对刻意扩展的块制造噪音。

实测（测试库 `M3 校验.md`，包头故意写坏）：

| 卡片 | 渲染结果 |
| --- | --- |
| 坏包头 | `第 6 行：未识别的字段 "titel"，是不是想写 "title"？` / `第 7 行："scope" 后面没有值` / `第 8 行：无法解析的表头行：这行没有冒号`——三处行号与文件实际行完全一致 |
| 注解面板 | 按钮文案 `收起解析 (3)`；面板 `role="list"`、行 `role="listitem"`、面板 `id` 与按钮 `aria-controls` 一致、`aria-expanded` 随折叠翻转；只有 token 没说明的行显示 `—` |

#### notes 面板

- 两列网格（token/kind 在左、说明在右），窄屏（≤480px）自动改单列；
- 长 token 省略号 + `title` 悬浮全文；长说明 `overflow-wrap: anywhere`；
- 左列为空（只有说明）时自动隐藏该列；说明为空显示 `—`；
- 折叠按钮是原生 `<button>`，带 `aria-expanded` / `aria-controls` 与 `:focus-visible` 描边，键盘可达。

### 3.9 M4 产出与验证（自定义类型的开关、骨架与表单）

#### 类型定义新增字段

| 字段 | 类型 | 缺省 | 说明 |
| --- | --- | --- | --- |
| `options.notes` | boolean | `true` | 是否渲染注解面板；关掉时连按钮一起没有，注解本身仍然解析 |
| `options.copy` | boolean | `true` | 是否显示复制按钮 |
| `skeleton` | string | `""` | 「插入骨架」命令用的正文；含围栏会被拒绝（会截断代码块） |

校验与序列化都在 `src/core/card-types.ts`：`options` 里不认识的键报错；`options` / `skeleton` 缺失补默认；
导出时 `skeleton` 为空就不写，保证 JSON 往返稳定。

#### 设置页

- 「自定义卡片类型」下现在是**可编辑表单列表**：显示名 / 别名（逗号分隔）/ 默认 scope / 默认语言 / 默认说明 /
  显示注解面板 / 显示复制按钮 / 删除，末尾「添加类型」（自动取 `newtype`、`newtype-2` 这类空闲 id）。
- 表单改动立即落盘并重注册处理器与命令；它会**丢弃未保存的 JSON 草稿**（表单与 JSON 是同一份数据的两个入口）。
- JSON 定义框保留为高级入口（`skeleton` 等字段走 JSON）。

#### 命令

每种块语言一条插入命令（`card-kit:insert-<语言>-skeleton`，自定义类型各一条；旧的 `payload` 别名故意不给命令）：

| 实测 | 结果 |
| --- | --- |
| 插入与定位 | 在 `M4 插入.md` 执行 `card-kit:insert-card-skeleton` 后正文为 ```card / --- / title: 新卡片 / --- / 正文写在这里 / ```，且**选中** `新卡片`（直接键入即替换） |
| 命令清单 | `card-kit:insert-card-skeleton`、`card-kit:insert-apicall-skeleton` |
| 骨架内容 | 纯函数 `buildCardSkeleton` 生成，只写类型真的设了的默认字段（避免新卡片一上来就报"某字段后面没有值"） |

#### 开关真机验证

测试库同一篇笔记里放 ```card 与 ```apicall（后者 `options.notes=false`、`options.copy=false`、默认 `language: bash`）：

| 卡片 | 按钮数 | 注解面板 | 语言徽标 | 页脚 |
| --- | --- | --- | --- | --- |
| ```card | 2（语法解析 + 复制） | 有 | 无 | 有 |
| ```apicall | 0 | 无 | `bash`（来自 defaults） | 有（只剩徽标） |

页脚在没有徽标、没有按钮、也没有问题时整条 `detach`。

### 3.10 M5 产出与验证（写回核心 + 规整命令）

#### 分层

| 文件 | 职责 |
| --- | --- |
| `src/core/write-ops.ts` | **纯函数**：定位光标所在块、块内替换（含冲突检测与换行风格保持）、按解析结果重建块内文本、规整（canonical 字段顺序） |
| `src/core/writer.ts` | Obsidian 侧：`locateCardBlock`（`getSectionInfo`）、`writeCardInner`（`Vault.process` 原子写）、`replaceCardBody` / `replaceCardHeader` |
| `src/commands/format-card.ts` | 命令「规整光标所在的卡片」：只改编辑器缓冲，一步可撤销 |

分层的理由很直接：纯函数能在 node 里被冒烟覆盖（含 CRLF、行号越界、冲突），只有真正需要 Obsidian 的调用留在 writer.ts
（`writer.ts` 里的 `instanceof TFile` 是运行时值，混进纯模块会让冒烟/对账脚本无法打包）。

#### 冲突策略

写入前先比对**调用方上次看到的块内文本**与磁盘上此刻的块内文本，不一致就**整块不写**并返回原因
（"卡片内容已经变化，为避免覆盖你的改动，本次不写入"）；范围不合理、端点不是围栏行同样拒绝。
写入走 `Vault.process`（读-改-写原子），行尾风格（`\n` / `\r\n`）原样保留。

#### 规整命令

对 `---` 包头块：字段按 `step / title / description / scope / language / tags / notes` 重排，只写**有值**的字段
（空值写回去会立刻变成"某字段后面没有值"的问题），未知字段跟在后面不丢，正文去掉尾部空白。
v1 `payload` 块**不会**被改成 YAML，只整正文边缘。

真机（测试库 `M5 校验.md`，光标放块内后执行 `card-kit:format-card`）：

| 项 | 结果 |
| --- | --- |
| 前 | `tags: [b, a]` / `title:   带空格的标题   ` / `language: bash` / 空行 / `body   ` |
| 后 | `title: 带空格的标题` / `language: bash` / `tags: [b, a]` / `---` / `body` |
| 撤销 | 命令走 `editor.replaceRange`，一次撤销即可整体回退 |

> 真机第一轮把闭合围栏粘到了正文末尾（`body````）：替换区间到闭合围栏的**行首**，而新文本没有结尾换行。已修并复验——
> 这类边界只有真机才会暴露，所以 M5 的验收放在应用里而不是只跑冒烟。

### 3.11 M6 产出与验证（卡片编辑弹窗）

#### 交互

卡片页脚现在是「编辑 / 语法解析 / 复制」：

- **编辑** 打开弹窗：包头（YAML 或 v1 微语法）与正文各一个等宽文本框；
- 保存走 `saveCardInner`：有打开的编辑器就改缓冲，否则改文件；
- **保存失败（冲突）时弹窗不关**，原因用 Notice 说出——读者刚敲的字还在框里，不能被关掉丢掉；
- 没有改动就直接关闭并提示；`Mod+Enter` 也能保存；解析问题在弹窗顶部一并列出；
- 定位：点击时才调 `getSectionInfo`（渲染那一刻元素还没挂到文档上，那时拿不到行号）。

#### 验证

| 项 | 结果 |
| --- | --- |
| 卡片页脚 | `["编辑","复制"]`（`options.copy=false` 的类型只剩「编辑」） |
| 点击编辑 | `dev:errors` 为空（构造与打开路径没抛异常） |
| 共享保存路径 | 规整命令改走 `applyToEditor` 后真机复验通过：`title: 带空格的标题` / `language: bash` / `tags: [b, a]` / `---` / `body`，闭合围栏完好 |

**环境限制（必须说明）**：本机 Obsidian 窗口始终是 `document.visibilityState === "hidden"`，这种状态下**弹窗不会真的渲染**：
`app.setting.open()` 与 `Modal.open()` 之后，全文档里 "modal" 类名元素数为 0。因此

- 弹窗**内部**的观感、以及"在弹窗里改字再保存"这一步没能无头确认，需要你手动点一次；
- 能确认的是：编辑按钮存在、点击不报错、它调用的保存逻辑（`applyToEditor`）在真机走通；
- 文件分支（`writeCardInner` / `Vault.process`）目前仍只有冒烟覆盖——它的全部判断逻辑都在 `applyBlockInner` 里，剩下的只是十几行胶水。

### 3.12 M9 产出与验证（端点卡）

#### 形态

```api-endpoints 是**内建**块语言（自定义类型不能占用这个 id），内容是 JSON：数组，或带 `endpoints` 数组的对象，或单个端点对象。

```json
[
  {
    "method": "post",
    "endpoint": "/api/login",
    "condition": "填表 -> 提交 -> 拿 token",
    "examples": [
      {
        "requestBody": { "user": "admin" },
        "requestMetadata": ["application/json", { "text": "需要登录", "color": "#e03131" }],
        "responseBody": "{\"token\":\"abc\"}",
        "responseType": "json",
        "responseHighlights": [{ "line": 1, "start": 0, "end": 5, "color": "#ff0" }]
      }
    ]
  }
]
```

- 手写体（没有 `examples`）会把顶层 `requestBody` / `responseBody` 当成一个示例，兼容旧插件数据；
- 请求/响应体可以是对象（自动序列化）或字符串；没写内容类型时按形状判断（`{...}` / `[...]` 当 JSON）。

#### 分层

| 文件 | 职责 |
| --- | --- |
| `src/core/endpoint-parser.ts` | **纯函数**：JSON 解析 + 逐端点校验（方法、地址、示例、标签、高亮），错误带行号 |
| `src/core/body-format.ts` | **纯函数**：美化 JSON / XML、挑围栏语言、把高亮切成着色片段 |
| `src/core/endpoint-renderers.ts` | DOM 渲染：流程条、方法徽标、地址、请求/响应面板、标签、着色代码 |
| `src/ui/buttons.ts` | 复制按钮（从 processor 抽出，与卡片页脚共用） |

#### 与旧插件的差异（有意为之）

| 旧插件 | CardKit | 原因 |
| --- | --- | --- |
| 就地改 method / endpoint 并写回笔记 | 不移植 | 写入统一走 M5/M6 的 `saveCardInner`（冲突检查 + 编辑器优先），不在渲染层各自写 |
| 「发送请求」按钮（`requestUrl` 真发 HTTP） | 不移植 | 渲染不该发网络请求；按 AGENTS.md，网络能力要显式说明并授权，需要就单独做开关 |
| `window.Prism` + `innerHTML` 高亮 | Obsidian 的 `MarkdownRenderer`；只有存在高亮片段时才自己拼 DOM（`createSpan`，不写 innerHTML） | 少一个全局依赖，也避开 `no-unsanitized/property`（本项目 error 级） |
| 方法配色放进设置项 | 方法色是 CSS 变量 `--ck-get/post/put/delete`，主题或 snippet 可覆盖 | 少 4 个设置项 |

#### 验证

| 项 | 结果 |
| --- | --- |
| 真机渲染 | 方法 `POST`（原文小写自动转大写）、地址 `/api/login`、流程拆成 3 个 chip + 箭头、标签 `application/json` 与 `需要登录`、请求/响应两个面板、响应面板类型 `json`、两个复制按钮 |
| 高亮 | 响应体第 1 行 0–5 列着色成 `rgb(255,255,0)`，切出的片段是 `  "to`，与美化后的 JSON 对齐 |
| 坏块 | `第 26 行：JSON 解析失败：...` —— 行号指向真正出错的那一行 |
| 冒烟 | 151 项（新增端点解析 14 项、正文格式化 5 项、高亮切片 5 项） |

### 3.13 M8 产出与验证（包头补全）

#### 实现选择：EditorSuggest 而不是裸 CodeMirror

计划里写的是"CodeMirror 补全"（模板 esbuild external 已含 `@codemirror/*`），实现时改成了 Obsidian 原生的 `EditorSuggest`：

| | EditorSuggest（采用） | 裸 CodeMirror 补全源 |
| --- | --- | --- |
| 依赖 | 无（`obsidian` 自带） | `@codemirror/autocomplete` + `@codemirror/view`，还要跟随 Obsidian 的版本 |
| 生效范围 | 源码模式与实时预览都行 | 要自己判断编辑器上下文 |
| 生命周期 | `registerEditorSuggest` 随插件卸载 | 要自己注册 / 注销扩展 |
| 候选生成 | 同样能做成纯函数 | 同样 |

功能等价，代价是少一个可控点：浮层样式只能用 Obsidian 的。候选列表本身放在 `src/core/header-suggest.ts`（纯函数），
以后真要换回 CodeMirror，只换 UI 层即可。

#### 触发与候选

- 只在**卡片块的 `---` 包头内**触发（`api-endpoints`、没有包头或包头未闭合的块都不触发）；当前行有内容才弹，避免移动光标就跳出来。
- 顶层键：`step / title / description / scope / language / tags / notes`，**已经写过的键不再提示**。
- 取值：`scope`（all / Linux / Windows / macOS / web / Android / iOS）与
  `language`（bash / powershell / cmd / python / javascript / typescript / json / yaml / xml / sql / plaintext）。
- 注解：`- ` 提示 `kind / token / note`，`- kind: ` 提示注解类型；`token` / `note` 是自由文本，不提示。
- 键名按前缀过滤；取值列表不做前缀过滤（列表本来就短）。

#### 验证

| 项 | 结果 |
| --- | --- |
| 注册 | `app.workspace.editorSuggest.suggests` 里有一条属于 `card-kit` 的建议器；`dev:errors` 为空 |
| 候选 | 冒烟 164 项（新增 13 项：键名、已用键排除、scope / language 取值、缩进行替换列、注解字段与类型、自由文本与未知键不提示、两种过滤） |
| 回归 | 重载后端点卡与卡片渲染均正常 |

**环境限制**：补全浮层在隐藏窗口下不会渲染，"弹出来长什么样"需要你手动敲一次；能确认的是注册、候选生成与无报错。

### 3.14 M7 发布准备

#### 版本与产物

| 项 | 值 |
| --- | --- |
| 版本 | `0.1.0`（`manifest.json` / `package.json` / `versions.json` 三处一致） |
| minAppVersion | `1.5.7`（推导见 §3.3） |
| isDesktopOnly | `false`：没有 Node / Electron API，剪贴板、Modal、EditorSuggest 在移动端都可用 |
| 产物 | `main.js` **43 KB**（minify 后）、`styles.css` 9.7 KB、`manifest.json` |
| 运行时依赖 | 只有 `obsidian`（external）；`main.js` 里没有 `require("node:*")`，也没有 `fs` / `path` |
| 开发代码不进包 | `main.js` 里搜不到 `语法冒烟` / `corpus`（`src/dev/*` 只被脚本引用，esbuild 按可达性裁剪） |
| 源码规模 | 29 个 `.ts`，约 4100 行（含两个 harness 与全部注释） |

#### 启动开销

`onload` 只做：读一次 `data.json`、注册设置页、按语言注册代码块处理器（2 个内建 + 1 个端点语言 + 自定义类型）、
注册插入 / 规整命令、注册一个 EditorSuggest。**没有**全库扫描、没有定时器、没有网络请求；
渲染路径只解析当前块自己的文本，不碰别的文件。

#### 发布流程（模板自带，已核对）

1. **先补 `manifest.json` 的 `author` / `authorUrl`**——现在是占位值 `"Obsidian User"`，上架前必须换成真实信息；
2. 改版本：`npm version 0.2.0 --no-git-tag-version`（或直接改 `package.json`），再 `node version-bump.mjs`
   把 `manifest.json` 与 `versions.json` 一起更新；
3. 三连：`npm run build` → `npm run lint` → `bash scripts/smoke.sh`（另可选 `bash scripts/corpus.sh` 做回归）；
4. 提交后打 tag（**不带 `v` 前缀**，与 manifest 版本号一致）并推送：`.github/workflows/release.yml` 会
   `npm ci && npm run build`，然后创建 **draft** release，附 `main.js` / `manifest.json` / `styles.css`；
5. 在 GitHub 发布该 draft，再按 obsidian-releases 的流程提交上架（首次需要）。

`lint.yml` 在 Node 20 / 22 / 24 上跑构建；本地开发用 `npm run dev`（esbuild watch）。

#### 用户文档

- `README.md`：功能、三种块语法（含可直接抄的例子）、设置、命令、**隐私声明**（无网络 / 无遥测 / 只在保存时写当前笔记）、已知限制；
- `CHANGELOG.md`：0.1.0 的交付清单；
- 本文件：面向维护者的开发与验收口径（§3.1–§3.14 是每个里程碑的实测记录）。

#### 保存路径（M6 起统一）

`saveCardInner` 先看这篇笔记有没有打开的编辑器：有就走编辑器缓冲（`applyToEditor`，一次撤销，且不会与编辑器即将落盘的改动打架），
没有才走文件（`writeCardInner` + `Vault.process`）。两条路共用同一个 `applyBlockInner` 冲突检查。
（M5 预备的 `replaceCardBody` / `replaceCardHeader` 两个包装在 M6 统一成"一次整块写入"后删除，不留没有调用方的代码。）

## 4. 语法规范（v2）

````text
```card
---
step: 1                 # 可选，序号徽标
title: JWT none 算法校验  # 可选，标题
description: >           # 可选，支持行内 Markdown（不支持多行块标量）
  说明文字，可用 **加粗**、[[双链]]
scope: web               # 可选，平台/环境；别名 platform / os
language: python         # 可选，高亮语言；别名 lang；缺省 plaintext
tags: [jwt, 认证]         # 可选，行内或块状列表
notes:                   # 可选，语法解析
  - kind: 参数            #   映射式（推荐）
    token: -a
    note: 指定算法
  - 简写 | -v | 详细输出   #   payload 类型额外接受简写式
---
# 这里开始全是正文，原样渲染，不再解释任何标记
print("hello")
```
````

**切分规则**（`src/core/block-splitter.ts`）

1. 块内第一个非空行是 `---` → 进入包头模式；否则整块都是正文（裸块/旧块）。
2. 包头结束于**下一个** `---`（允许缩进/尾随空格）；其后所有行都是正文，正文里可以随便出现 `---`。
3. 找不到结束 `---` → 不当包头处理，整块当正文，并在卡片上标注问题（不静默吞内容）。
4. 正文首尾的空行会被裁掉，**正文内部的缩进与空行一律保留**。

**包头解析**（`src/core/header-parser.ts`，自研 YAML 子集）

- 支持：`key: value`、单双引号、`[a, b]` 行内列表、`- ` 块状列表、notes 的映射式与 `kind | token | note` 简写。
- 不支持（会在卡片上给出提示，而不是静默丢弃）：锚点、嵌套映射、`|` / `>` 多行块标量、notes 的行内写法。
- 未识别的 key 进入 `header.extra`（`Map<string,string>`），留给自定义类型。
- 选择自研而不是 `parseYaml`：`parseYaml` 返回 `any`，会直接撞上 `@typescript-eslint/no-unsafe-*`（error），
  而卡片头的语法本身就是固定的小子集，自己解析可给出精确的错误提示。

**块语言与类型**

- `card`：主块名。`payload`：永久别名。自定义类型 id/alias 由 `data.json` 决定，注册在插件加载时。
- 无包头块：当作纯代码卡渲染；若正文首行是 `# 标题`，M0 先用它做标题（M2 起由 v1 微语法接管）。

## 5. 目录结构

```text
src/
  main.ts                  插件生命周期（onload / 设置 / 注册处理器与命令）
  settings.ts              设置类型、默认值、设置页
  commands/
    insert-card.ts         每种块语言的「插入骨架」命令
  ui/
    custom-types-editor.ts 自定义类型的可编辑表单
  core/
    types.ts               数据模型（CardHeader / CardBlock / CardNote / CardTypeDefinition）
    json.ts                未知 JSON 值的收窄守卫（纯函数）
    card-types.ts          自定义类型的 JSON 校验与序列化（纯函数）
    block-splitter.ts      包头/正文切分（纯函数）
    header-parser.ts       YAML 子集解析 + notes 两种写法（纯函数）
    legacy-parser.ts       v1 payload 微语法（纯函数）
    card-block.ts          语言→语法编排，纯函数入口 buildCardBlock
    variables.ts           全局变量校验与 {{x}} 替换（纯函数）
    skeleton.ts            插入骨架生成（纯函数，含光标定位）
    field-renderers.ts     字段渲染（标题、序号、scope、标签、notes、问题提示）
    shell.ts               卡片 DOM 外壳与类名
    markdown.ts            安全围栏 + MarkdownRenderer 包装
    processor.ts           代码块处理器注册与渲染编排
    writer.ts              回写笔记（M5）
  dev/
    grammar-smoke.ts       语法冒烟（77 项，不需要 Obsidian）
    corpus-check.ts        全库对账（只读；node 侧开发脚本，永不进 main.js）
scripts/
  smoke.sh                 打包并运行语法冒烟
  corpus.sh                打包并运行全库对账
styles.css                 卡片样式（全部走主题变量）
```

## 6. 里程碑

| 里程碑 | 内容 | 验收 |
| --- | --- | --- |
| **M0** ✅ | 基线：npm install、build/lint 基线、规则清单固化、manifest/package/versions、清示例、core 空壳 + 裸 card 最小闭环、本文件 | `npm run build` 通过、`npm run lint` 通过（1 条已知 warn）、测试库能看到裸 card 块渲染 |
| **M1** ✅ | 设置页：data.json 读写、自定义类型 JSON 导入/导出与校验、主色、默认折叠状态 | 导入非法 JSON 不写盘且有明确报错；重载后设置保留（实测见 §3.6） |
| **M2** ✅ | payload v1 微语法兼容层：`[n]` `#` `>` `@` `$` `?`、全局变量 `{{x}}` 复制替换 | 全库 2068 个存量块对账 0 异常 / 0 丢内容 / 0 未分类差异；三个回归样本逐项对照（见 §3.7） |
| **M3** ✅ | notes 面板打磨（排版 / 条数 / 键盘可达）、字段缺省与**带行号**的错误提示 | 注解两种写法正确且含 `|` 不串列；坏包头报到具体行（见 §3.8） |
| **M4** ✅ | 自定义卡片类型：默认字段合并、类型别名、**行为开关**（注解 / 复制）、每类型骨架与「插入骨架」命令、设置页表单 + JSON 闭环 | 自定义 id 与别名可渲染；JSON 往返稳定；开关与命令真机生效（见 §3.9） |
| **M5** ✅ | 写回核心：块内替换与冲突检测（纯函数）、`Vault.process` 原子写入、规整命令 | 冲突时拒绝写入；规整命令真机生效（见 §3.10） |
| **M6** ✅ | 卡片编辑弹窗：包头 + 正文编辑、保存前冲突检查、编辑器/文件双路径 | 编辑按钮在卡片上且点击无异常；共享保存路径真机走通（弹窗渲染受本机环境限制，见 §3.11） |
| **M7** ✅ | 发布准备：README / CHANGELOG、release 流程核对、`isDesktopOnly` 与体积复核 | 冷启动只做注册与一次 `data.json` 读取；体积与依赖记录在案（见 §3.14） |
| **M8** ✅ | 包头补全（改用 Obsidian `EditorSuggest`）：键名 / scope / language / 注解字段与类型 | 候选列表冒烟覆盖；建议器已注册且无报错（见 §3.13） |
| **M9** ✅ | 端点卡移植：```api-endpoints（JSON）、method / endpoint / condition、示例与高亮 | 真机渲染正确（见 §3.12）；联网发请求与就地编辑有意不移植 |

## 7. 回归样本（`D:\Documents\zhang`，只读）

| 样本 | 旧解析器的问题 | CardKit 的期望 |
| --- | --- | --- |
| `024 WebPayload/019 JWT安全/jwt-none-alg.md` | 代码首行的 `# 注释` 被当成标题，标题被覆盖成"在线解码" | 标题只来自包头；正文 `#` 注释原样留在代码里 |
| `026 工具命令/007 反弹shell/python-reverse.md` | 同篇多块 + `ATTACKER_UPPER` 占位符 | 多块各自独立；占位符在复制时替换，渲染保持原文 |
| `026 工具命令/005 内网渗透工具/winpeas.md` | 重 `?` 注解 + `@ Windows` | notes 行数不串、scope 正确识别为 win |

验收方式：把样本复制到测试库（`D:\code\obsidian\test`）渲染，与原文对照，**不修改源库任何文件**。

## 8. 风险与开放问题

1. **沙箱**：构建（esbuild 管道子进程）在本机沙箱下需要放宽权限；不改变工程配置，只在本地验证时申请。
2. **声明式设置 API**：typing 落后（1.12.3），保持 `display()` + 1 条 warn；typings 更新后再评估。
3. **包头兼容**：`payload` 块里若有人把 `---` 当正文分隔线使用，会被识别成包头。切分器只在**首个非空行是 `---`** 时才启用包头模式，且 M2 的兼容层会用旧的微语法结果做交叉校验。
4. **回写安全**：M5 的写回以行号定位，必须与编辑器缓冲比对；任何不一致都拒绝写入（宁可不动，不破坏笔记）。
