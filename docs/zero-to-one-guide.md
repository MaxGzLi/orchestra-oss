# Orchestra 从 0 到 1 使用指南

这份文档不是讲实现原理，而是讲你第一次打开 `Orchestra` 时，应该怎么真正把它用起来。

适合这样的人：

- 你知道大概想做什么功能，但还没有写 issue
- 你想把一个 feature 拆成任务并交给 agent
- 你现在打开页面，觉得元素很多，不知道先点哪里

---

## 1. 先理解 Orchestra 是干什么的

`Orchestra` 不是普通看板，也不是传统的 issue 管理器。

它的核心流程是：

1. 先输入一个 feature 想法
2. 系统生成任务图
3. 你挑出 ready 的任务
4. 交给 `Codex / Claude Code` 这样的执行 agent
5. 看执行结果、失败原因、重试和下一批

你可以把它理解成：

`feature brief -> task graph -> dispatch -> batch execution -> run history`

---

## 2. 第一次打开后，先看哪里

页面里最重要的是 4 个区域：

### A. 顶部工作区

这里决定你当前在推进哪个 feature。

你会看到：

- `Feature`
- `Problem / Brief`
- `Template`
- `Generate Plan`

如果你是第一次体验，先不要改太多，直接：

1. 选一个模板
2. 填一个 feature 名称
3. 填一句问题描述
4. 点 `生成计划`

### B. 任务图看板

这是主视图。

它会把任务分成几列：

- `需求入口`
- `规划图谱`
- `执行`
- `治理`

你主要在这里做三件事：

- 看任务是否合理
- 调整状态、依赖、优先级
- 挑出下一批要执行的任务

### C. 右侧 Inspector

这里是当前任务或当前 batch 的详情面板。

常用的是两个 tab：

- `任务`
- `执行`

你可以把它理解成：

- 左边看全局
- 右边做当前动作

### D. Portfolio / Dispatch 区

当你有多个 board 之后，这里用来做跨 feature 调度。

不是第一次必看，但后面会用到。

---

## 3. 第一次体验，建议按这个顺序走

这是最短上手路径。

### 第一步：定义一个 feature

在顶部填：

- `Feature`: 你想做的功能名
- `Problem / Brief`: 这个功能为什么值得做

例子：

- Feature: `Agent-native CRM Copilot`
- Problem / Brief: `销售和运营团队在多个聊天和表格里切换，导致跟进任务分散且难以自动交给 agent 执行。`

### 第二步：选一个模板

如果你不知道选哪个，就先用：

- `Delivery`

这适合大多数正常功能开发。

其他模板：

- `Release`: 更偏发布、QA、rollout
- `Support`: 更偏支持问题、修复和排查

### 第三步：点 `生成计划`

这一步之后，页面会根据你的 brief 生成任务图。

你不用先建 issue。

---

## 4. 生成计划后，先检查什么

不要急着跑 agent，先看任务图是不是合理。

重点检查 4 件事：

### 1. 是否有明显缺失的任务

比如：

- 少了 review
- 少了 rollout
- 少了验收标准

如果缺，就在右侧 `新增任务` 里补一个。

### 2. 是否有任务依赖不对

例如一个执行任务，其实应该依赖前面的 planning 任务。

这时去右侧 `任务` 详情里改依赖。

### 3. 任务 owner 是否合理

一般可以这样理解：

- `Codex`: 更适合明确编码任务
- `Claude Code`: 更适合分析、review、架构判断
- `Planner`: 更适合规划和拆解
- `Commander`: 更适合总控和交接

### 4. 哪些任务真的 ready

不是所有任务都能直接跑。

你应该优先找：

- `ready`
- 依赖已满足
- 验收标准比较清楚

---

## 5. 怎么把任务交给 agent

有两种方式。

### 方式 A：单任务交接

适合第一次体验。

步骤：

1. 在某张任务卡上点 `交接`
2. 右侧切到 `执行`
3. 查看生成的 handoff
4. 点 `立即运行`

这时候你看到的是：

- 结构化命令
- prompt
- shell preview
- run result

当前开源版默认还是安全模拟，不会真的起外部 CLI。

### 方式 B：批量执行

适合你已经确认多个任务都 ready。

步骤：

1. 在看板中勾选多张任务
2. 进入右侧 `执行`
3. 选 `Batch Strategy`
4. 点 `生成交接包`
5. 点 `立即运行`

如果你不确定策略，先用：

- `按依赖`

---

## 6. 什么是 Dispatch Queue

当你只有一个 board 时，可以先忽略。

当你开始维护多个 feature board 时，`Dispatch Queue` 很重要。

它的作用不是执行，而是：

- 先从多个 board 收集任务
- 再决定下一批先装载哪一组
- 最后送进右侧 batch console

可以理解成：

`Dispatch Queue = 跨 board 的待执行队列`

常见用法：

1. 在 portfolio 区域里看推荐任务
2. 把任务加入 queue
3. 选一种 queue 装载策略
4. 点 `Load Into Batch`
5. 再在执行区运行

---

## 7. 三种最常用的操作方式

### 场景 A：我只有一个新功能想法

按这个流程：

1. 写 feature 和 brief
2. 选 `Delivery`
3. 生成计划
4. 调整任务
5. 交接一个最明确的执行任务

这是最基础的用法。

### 场景 B：我有多个功能在并行

按这个流程：

1. 为每个 feature 建一个 board
2. 在顶部 `Boards` 区切换
3. 在 portfolio 区看风险和推荐优先级
4. 把多个 board 的 ready 任务放进 dispatch queue
5. 再按策略装载

### 场景 C：我想回看执行过程

按这个流程：

1. 打开右侧 `记录`
2. 先看 `Batch 摘要`
3. 再看 `Dispatch 历史`
4. 最后看单条 `Run History`

你可以：

- 看失败原因
- 重试失败任务
- 重新装载过去的 dispatch

---

## 8. 页面里最容易让人困惑的几个点

### “Generate Plan”和“Save As New Board”有什么区别

- `Generate Plan`: 重算当前 board 的任务图
- `Save As New Board`: 把当前内容分叉成一个新的 board

一个是刷新当前计划，一个是复制/分支工作区。

### “交接”和“运行”有什么区别

- `交接`: 生成给 agent 的 handoff
- `运行`: 在当前开源版里执行模拟 run

### “preview / armed / live” 是什么

- `preview`: 只生成，不执行
- `armed`: 接近真实执行，但仍是受控 stub
- `live`: 为未来真实执行预留的档位

在开源版里，`live` 依然不会真的直接起外部进程。

### 为什么会看到很多英文命令

因为这套系统最终面向的是：

- shell
- CLI
- agent handoff

但 UI 已经支持中英文切换；如果你更习惯中文，就切到中文模式用。

---

## 9. 如果你只是想快速试一遍

你可以只做下面这 7 步：

1. 打开页面
2. 保持 `Delivery` 模板
3. 填 `Feature`
4. 填 `Problem / Brief`
5. 点 `生成计划`
6. 在执行列里找一个 `ready` 任务并点 `交接`
7. 在右侧执行区点 `立即运行`

做到这里，你就已经走完了这套产品最核心的 0 到 1 流程。

---

## 10. 这套开源版当前的边界

你需要知道两件事：

### 已经有的

- 任务图
- 多 board
- dispatch queue
- batch execution
- retry
- run history
- 结构化 CLI bridge
- process runner contract stub

### 还没有真的做的

- 真正调用本地 `codex` 或 `claude-code`
- 真正的 `spawn/exec`
- 后端持久化
- 多人协作同步

所以现在这套更像：

**一个完整的 orchestration 原型 + 真实执行前的接口层**

---

## 11. 推荐的学习顺序

如果你想真正理解这个项目，建议顺序是：

1. 先按本文跑一遍最短流程
2. 再试多建几个 board
3. 再试 dispatch queue
4. 再看执行设置里的 bridge / runner profiles
5. 最后再去看代码

不要一上来先研究所有按钮和实现细节。

先把一次 feature 推进跑通，理解会快很多。
