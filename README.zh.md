# Apex Arc

<p align="center"><strong>Apex Arc: Where Models and Agents Co-Evolve</strong></p>

<p align="center">
  中文 | <a href="README.md">English</a>
</p>

---

Apex Arc 是一个终端原生的 AI 编程助手。它能读写代码、执行命令、管理 Git，通过持久化记忆系统，在多次会话间保持对你项目的深度理解，并自我进化。

---

## 快速开始

```bash
# 通过 npm 安装（全平台）
# 镜像源（如 cnpm/淘宝源）平台包同步可能滞后，建议使用官方源
npm install -g @apex-arc/cli --registry https://registry.npmjs.org

# 运行
apex-arc
```

首次启动自动引导配置。支持：
- **从 Claude Code 导入** — 一键迁移已有认证
- **自定义 Provider** — TUI 内添加任意 OpenAI 兼容 API

<details>
<summary><strong>WSL：剪贴板问题</strong></summary>

如果在 WSL 上复制出现乱码，安装 `xsel`：
```bash
sudo apt install xsel
```
</details>

<details>
<summary><strong>Windows：shell 输出中文（CJK）乱码</strong></summary>

在系统区域为非 UTF-8 的 Windows 上（如简体中文，活动代码页为 936/GBK），命令输出里的
中日韩字符可能显示为乱码。Apex Arc 已为 PowerShell/cmd 子进程强制开启 UTF-8 输出。
如果在尚未覆盖的场景下仍遇到乱码，可以开启 Windows 的系统级 UTF-8 支持：

**设置 → 时间和语言 → 语言和区域 → 管理语言设置 → 更改系统区域设置 →
勾选「Beta 版: 使用 Unicode UTF-8 提供全球语言支持」→ 重启。**

这会把活动代码页（ACP）切换为 UTF-8（65001），所有程序都生效，子进程不再继承旧代码页。
注意这是系统级 Beta 开关，可能导致部分老的非 Unicode 程序显示异常，建议作为临时方案。
</details>

---

## 核心特性

### 多智能体

| 智能体 | 说明 |
|--------|------|
| **build** | 默认。完整工具权限，用于开发 |
| **plan** | 只读分析模式，适合代码探索和方案设计 |
| **compose** | 编排模式，适合 specs-driven 开发和 Skill 驱动流程 |

按 `Tab` 在主智能体间切换。子智能体由系统按需生成。

### 持久化记忆

基于 SQLite FTS5 全文搜索的跨会话记忆：

- **项目记忆** (`MEMORY.md`) — 跨会话持久的项目知识、规则、架构决策
- **会话检查点** (`checkpoint.md`) — 结构化状态快照，由 checkpoint-writer 子智能体自动维护
- **笔记暂存** (`notes.md`) — Agent 临时记录区
- **任务进展** (`tasks/<id>/progress.md`) — 逐任务日志

记忆自动在会话恢复时注入上下文，agent 无需重新理解项目背景。

### 智能上下文管理

- **自动检查点** — 根据模型上下文窗口自动决定什么时候保存会话状态
- **上下文重建** — 当上下文接近上限时，从最新 checkpoint、项目记忆、任务进展和保留的近期消息重建上下文，让 agent 继续当前任务
- **预算化注入** — 用 token budget 控制 checkpoint / memory / notes 注入上下文的大小，按重要性排序

### 任务追踪

树状任务系统（T1, T1.1, T1.2…），自动与检查点系统联动，恢复会话时任务进度不丢失。

### 子智能体系统

主智能体可按需生成子智能体，共享当前会话上下文并行工作，支持生命周期追踪、取消机制和后台执行。

### Goal / 停止条件

`/goal` 命令为会话设置停止条件。当 agent 想停下来时，由独立裁判模型评估对话内容，判断条件是否真正满足——防止自主工作中的"乐观停止"。

### Compose 编排模式

Compose 模式提供结构化的 specs-driven 开发流程，内置规划、执行、代码审查、TDD、调试、验证、合并等技能——编排从 spec 到交付的完整开发生命周期。

### Dream & Distill

- **`/dream`** — 扫描近期会话轨迹，提取持久知识到项目记忆，清理过时条目
- **`/distill`** — 发现近期工作中重复的手动工作流，将高置信度候选打包成可复用的 skill、subagent 或 command

---

## 配置

Apex Arc 使用 JSON/JSONC 配置文件，并提供 JSON Schema 以获得编辑器自动补全和校验。

### 文件位置

| 文件 | 项目级 | 全局 |
|------|--------|------|
| 主配置 | `.apex-arc/config.jsonc` | `~/.config/apex-arc/config.json` |
| TUI 配置 | `.apex-arc/tui.json` | `~/.config/apex-arc/tui.json` |
| 认证凭据 | — | `~/.local/share/apex-arc/auth.json` |

> Windows 下 XDG 路径位于 `%LOCALAPPDATA%\apex-arc\`。可通过 `ARC_HOME` 环境变量覆盖所有路径。

<details>
<summary><strong>数据目录</strong></summary>

除配置文件外，Apex Arc 在 XDG 路径（或 `$ARC_HOME`）下存储运行时数据：

| 目录 | 默认路径（Linux） | 内容 |
|------|------------------|------|
| data | `~/.local/share/apex-arc/` | SQLite 数据库、认证凭据（`auth.json`）、记忆、日志 |
| state | `~/.local/state/apex-arc/` | TUI 偏好设置（`kv.json`）、最近使用模型（`model.json`） |
| cache | `~/.cache/apex-arc/` | 语言服务器、缓存的模型目录、技能 |

如需删除已存储的凭据，删除 data 目录下的 `auth.json` 即可。macOS 下 XDG data 默认为 `~/Library/Application Support/apex-arc/`。

</details>

### 主要选项

- Provider 和模型选择
- Agent 权限和自定义 Agent
- 检查点和记忆行为
- MCP 服务器连接
- 快捷键和主题

Max Mode（并行 best-of-N 推理 + 裁判选优）可通过配置中的 `experimental.maxMode` 开启。

<details>
<summary><strong>允许访问系统临时目录（<code>/tmp</code>）</strong></summary>

默认情况下，读写项目工作目录之外的文件会触发 `external_directory` 权限询问——系统临时目录也不例外。
这是有意为之：Apex Arc 不会静默放宽权限，你始终掌控模型在项目之外能触碰什么。

临时目录之所以经常被用到，是因为多数模型习惯把它当作临时工作空间（比如临时脚本、一次性数据文件）。
如果你信任所处环境、不想每次都被询问，可以在配置中主动放行：

```json title=".apex-arc/config.json"
{
  "permission": {
    "external_directory": {
      "/tmp/**": "allow"
    }
  }
}
```

**此设置存在已知风险——使用风险由你自行承担。** 临时目录对所有用户 and 进程可写，与机器上的其他进程
共享。自动放行意味着模型无需确认即可在其中读写，这会扩大你对“可预测临时路径 / 软链替换”一类攻击的
暴露面（例如其他进程提前把 `/tmp/foo` 创建为指向敏感文件的软链）。因此仅建议在单人、可控的环境或
容器内使用。请尽量缩小放行范围。

</details>

---

## 开发

```bash
bun install              # 安装依赖
bun run dev              # 开发模式运行
bun turbo typecheck      # 类型检查
```

---

## 与 OpenCode 的关系

Apex Arc 基于 [OpenCode](https://github.com/anomalyco/opencode) fork 构建，保留其全部核心能力（多 Provider、TUI、LSP、MCP、插件），并在此基础上构建了持久化记忆、智能上下文管理、子智能体编排、目标驱动的自主循环、Compose 工作流，以及通过 dream/distill 实现的自我进化。

---

## 许可证

源代码基于 [MIT 许可证](./LICENSE) 开源。

使用 Apex Arc 还需遵守[使用限制](./USE_RESTRICTIONS.md)。
