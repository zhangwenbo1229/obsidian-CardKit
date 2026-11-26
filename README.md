# CardKit

把代码块渲染成卡片。三种内建块 + 自定义类型，包头用 YAML 描述元信息，包头之后是**原样保留**的正文。

- **卡片** `card`：标题 / 序号 / 平台 / 标签 / 说明（支持行内 Markdown）/ 语法解析面板 / 复制 / 编辑
- **v1 兼容** `payload`：旧插件的微语法继续可用，库里 2000+ 存量块零改动
- **端点卡** `api-endpoints`：method 徽标、调用流程、请求 / 响应示例、内容类型标签、高亮
- **自定义类型**：默认字段、别名、注解与复制开关、插入骨架，全部存在插件 `data.json`
- 包头补全：`step` / `title` / `scope` / `language` … 以及 scope、language 的取值

## 块语法

### 卡片

```card
---
step: 1
title: JWT none 算法校验
description: 说明支持 **加粗**、`行内代码` 与 [[双链]]
scope: web
language: python
tags: [jwt, 认证]
notes:
  - kind: 参数
    token: -a
    note: 指定算法
  - 简写 | -v | 详细输出
---
# 这里开始是正文，原样渲染：代码里的 # 注释不会被当成标题
print("hello")
```

规则：块内第一个非空行是 `---` 才进入包头模式；**第二个 `---` 之后全部是正文**，正文里可以随便出现 `---`；没有包头时整块都是正文。

### 旧写法（payload）

```payload
# 全量扫描
> 执行所有 Windows 提权检查
@ Windows
? 参数 | -v | 详细输出

winpeasany.exe
```

元信息区在**第一个空行**结束，其余都是正文；`[n]` 序号、`#` 标题、`>` 描述、`@` 平台、`$` 语言、`?` 注解都继续可用。
正文里的 `#` 注释不会再被当成标题（这是旧解析器的老毛病）。

### 端点卡

```api-endpoints
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
        "responseType": "json"
      }
    ]
  }
]
```

内容是 JSON：数组、`{ "endpoints": [...] }`、或单个端点对象都行；手写体（没有 `examples`）会把顶层 `requestBody` / `responseBody` 当成一个示例。

### 自定义类型

设置页里直接加（显示名 / 别名 / 默认字段 / 注解与复制开关），或者写 JSON：

```json
[
  { "id": "apicall", "name": "接口调用", "aliases": ["api"],
    "defaults": { "language": "bash", "scope": "web" },
    "options": { "notes": false, "copy": false },
    "skeleton": "curl -s https://example.com" }
]
```

`id` 就是代码块语言（小写字母开头，可含数字和短横线），校验不过会逐条列出原因且**不写盘**。

## 安装

手动安装：把 `main.js`、`manifest.json`、`styles.css` 放进 `<库>/.obsidian/plugins/card-kit/`，再到 **设置 → 第三方插件** 启用。

## 设置（设置 → CardKit）

| 设置 | 说明 |
| --- | --- |
| 卡片主色 | 留空跟随主题，可填 `#7c3aed` |
| 解析默认展开 | 「语法解析」面板打开笔记时是否已展开 |
| 自定义卡片类型 | 表单逐项编辑 + JSON 定义（导入 / 导出） |
| 全局变量 | `{{key}}` → 值；点「复制」时替换，另有「复制原文」 |

## 命令

- **插入卡片骨架** / **插入 <类型> 骨架**：在光标处插入带头包的块，并选中标题占位符
- **规整光标所在的卡片**：字段按固定顺序重排、正文去尾部空白（一次撤销可回退）

卡片页脚：**编辑**（包头 + 正文的弹窗）、**语法解析**（注解面板）、**复制** / **复制原文**。

## 隐私

- **不发任何网络请求**，没有遥测，没有外部服务；端点卡也不会去请求你写的接口（这是有意不做）
- 不读取、不索引你没打开的笔记；不写任何你没在编辑的笔记
- 只有在点保存 / 规整时改你正在编辑的那篇笔记，且写前比对内容，冲突就整块拒写
- 全部设置存在库内的 `data.json`

## 开发

```bash
npm install             # 沙箱环境用 npm install --ignore-scripts
npm run dev             # esbuild watch
npm run build           # tsc -noEmit + 打包出 main.js
npm run lint            # eslint（eslint-plugin-obsidianmd recommended）
bash scripts/smoke.sh   # 语法冒烟（164 项，不需要 Obsidian）
bash scripts/corpus.sh  # 只读全库对账：与旧 v1 解析器逐字段比对
```

完整的开发计划、语法规范、里程碑与验收口径见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 已知限制

- 包头是 YAML **子集**：支持 `key: value`、引号、行内列表、块状列表、notes 的两种写法；不支持锚点、嵌套映射、`|` / `>` 多行块标量（会给出提示，不会静默丢弃）
- 端点卡只渲染，不在卡片上就地改 method / URL，也不发真实请求
- 设置页暂未采用声明式设置 API（`getSettingDefinitions` 需要 Obsidian 1.13，当前 typings 是 1.12.3）

## 许可

0-BSD（见 [LICENSE](LICENSE)）。