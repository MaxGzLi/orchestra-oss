"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  Clipboard,
  Cpu,
  Copy,
  Flag,
  GitPullRequestArrow,
  Lightbulb,
  GripVertical,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  buildCommandPacket,
  type CommandPacket,
  type CommandTemplateConfig,
} from "@/lib/orchestra/commander";
import { getDefaultOrchestraBoard, orchestraAgents, orchestraScenarios } from "@/lib/orchestra/data";
import {
  executorAdapters,
  runBatchWithAdapter,
  simulatedExecutorAdapter,
  type ExecutorRunResult,
} from "@/lib/orchestra/executor";
import { buildBoardFromIdea, orchestraTemplates, summarizeByOwner } from "@/lib/orchestra/planner";
import { cn } from "@/lib/utils";
import type {
  OrchestraBoard,
  OrchestraExecutor,
  OrchestraFeatureIdea,
  OrchestraTaskComment,
  OrchestraTaskPriority,
  OrchestraRunRecord,
  OrchestraBoardSnapshot,
  OrchestraScenario,
  OrchestraTask,
  OrchestraTaskState,
  OrchestraTemplateId,
  OrchestraTimelineEvent,
  OrchestraWorkspaceState,
} from "@/lib/orchestra/types";

type Locale = "zh" | "en";
type BatchStrategy = "manual" | "dependency" | "owner" | "priority";
type QuickFilter = "all" | "ready" | "blocked" | "critical";
type ExecutorAdapterMode = "simulated-local" | "cli-preview" | "reviewer-preview";
type ExecutionStage = "preview" | "armed" | "live";
type BatchRunSummary = {
  id: string;
  createdAt: string;
  strategy: BatchStrategy;
  adapterMode: ExecutorAdapterMode;
  total: number;
  succeeded: number;
  failed: number;
  taskIds: string[];
};
type DemoResult = ExecutorRunResult;
type DispatchQueueItem = {
  boardId: string;
  boardName: string;
  taskId: string;
  title: string;
  owner: OrchestraExecutor;
  priority: OrchestraTaskPriority;
};
type DispatchQueueStrategy = "board" | "owner" | "priority";
type DispatchHistoryEntry = {
  id: string;
  createdAt: string;
  boardId: string;
  boardName: string;
  strategy: DispatchQueueStrategy;
  taskIds: string[];
};
type RunStatusFilter = "all" | "succeeded" | "failed";

const LOCALE_KEY = "orchestra-oss-locale";
const STATE_KEY = "orchestra-oss-state";

function createBoardSnapshot(params: {
  id: string;
  name: string;
  template: OrchestraTemplateId;
  updatedAt?: string;
  board: OrchestraBoard;
  selectedTaskId: string;
  runHistory: OrchestraRunRecord[];
  batchSummaries: BatchRunSummary[];
  timeline: OrchestraTimelineEvent[];
  selectedCommandTaskIds: string[];
}): OrchestraBoardSnapshot {
  return {
    id: params.id,
    name: params.name,
    template: params.template,
    updatedAt: params.updatedAt ?? new Date().toISOString(),
    board: params.board,
    selectedTaskId: params.selectedTaskId,
    runHistory: params.runHistory,
    batchSummaries: params.batchSummaries,
    timeline: params.timeline,
    selectedCommandTaskIds: params.selectedCommandTaskIds,
  };
}

function createWorkspaceBoardId() {
  return `board-${Date.now().toString(36)}`;
}

function normalizeBatchSummaries(
  summaries: OrchestraBoardSnapshot["batchSummaries"] | undefined,
): BatchRunSummary[] {
  return (summaries ?? []).map((summary) => ({
    ...summary,
    strategy: ["manual", "dependency", "owner", "priority"].includes(summary.strategy)
      ? summary.strategy as BatchStrategy
      : "manual",
    adapterMode: ["simulated-local", "cli-preview", "reviewer-preview"].includes(summary.adapterMode)
      ? summary.adapterMode as ExecutorAdapterMode
      : "simulated-local",
  }));
}

const localeLabel: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
};

const batchStrategyLabel: Record<Locale, Record<BatchStrategy, string>> = {
  zh: {
    manual: "手动顺序",
    dependency: "按依赖",
    owner: "按执行者",
    priority: "按优先级",
  },
  en: {
    manual: "Manual",
    dependency: "Dependencies",
    owner: "Executor",
    priority: "Priority",
  },
};

const quickFilterLabel: Record<Locale, Record<QuickFilter, string>> = {
  zh: {
    all: "全部",
    ready: "就绪",
    blocked: "阻塞",
    critical: "最高优先级",
  },
  en: {
    all: "All",
    ready: "Ready",
    blocked: "Blocked",
    critical: "Critical",
  },
};

const executionStageLabel: Record<Locale, Record<ExecutionStage, string>> = {
  zh: {
    preview: "预览",
    armed: "已布防",
    live: "实时",
  },
  en: {
    preview: "Preview",
    armed: "Armed",
    live: "Live",
  },
};

const statusLabel: Record<Locale, Record<OrchestraTaskState, string>> = {
  zh: {
    intake: "待接入",
    planning: "规划中",
    ready: "就绪",
    in_progress: "进行中",
    review: "评审中",
    done: "完成",
    blocked: "阻塞",
  },
  en: {
    intake: "intake",
    planning: "planning",
    ready: "ready",
    in_progress: "in_progress",
    review: "review",
    done: "done",
    blocked: "blocked",
  },
};

const priorityLabel: Record<Locale, Record<OrchestraTaskPriority, string>> = {
  zh: {
    low: "低",
    medium: "中",
    high: "高",
    critical: "最高",
  },
  en: {
    low: "low",
    medium: "medium",
    high: "high",
    critical: "critical",
  },
};

const stateTone: Record<OrchestraTaskState, string> = {
  intake: "bg-white/80 text-slate-700 border-slate-200",
  planning: "bg-amber-50 text-amber-700 border-amber-200",
  ready: "bg-sky-50 text-sky-700 border-sky-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  review: "bg-violet-50 text-violet-700 border-violet-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  blocked: "bg-rose-50 text-rose-700 border-rose-200",
};

const ownerTone: Record<OrchestraExecutor, string> = {
  commander: "bg-slate-950 text-white",
  planner: "bg-amber-500 text-white",
  codex: "bg-sky-600 text-white",
  claude_code: "bg-violet-600 text-white",
  portfolio: "bg-emerald-600 text-white",
  human: "bg-zinc-400 text-white",
};

const priorityTone: Record<OrchestraTaskPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-600",
  medium: "border-sky-200 bg-sky-50 text-sky-700",
  high: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

const laneOrder: Array<OrchestraTask["lane"]> = ["strategy", "planning", "execution", "governance"];

const laneLabels: Record<Locale, Record<OrchestraTask["lane"], string>> = {
  zh: {
    strategy: "需求入口",
    planning: "规划图谱",
    execution: "执行团队",
    governance: "全局监督",
  },
  en: {
    strategy: "Feature Intake",
    planning: "Planning Graph",
    execution: "Execution Team",
    governance: "Portfolio Oversight",
  },
};

const laneDescriptions: Record<Locale, Record<OrchestraTask["lane"], string>> = {
  zh: {
    strategy: "把模糊想法变成明确目标和约束。",
    planning: "把目标拆成可执行、可验证的任务切片。",
    execution: "真正推进实现、评审和交付。",
    governance: "审视风险、节奏和产品价值。",
  },
  en: {
    strategy: "Turn vague ideas into clear goals and constraints.",
    planning: "Split goals into executable and reviewable slices.",
    execution: "Drive implementation, review, and delivery.",
    governance: "Review risk, momentum, and product value.",
  },
};

const laneTone: Record<OrchestraTask["lane"], string> = {
  strategy: "border-amber-200/80 bg-[linear-gradient(180deg,_rgba(255,251,235,0.92)_0%,_rgba(255,255,255,0.98)_100%)]",
  planning: "border-sky-200/80 bg-[linear-gradient(180deg,_rgba(240,249,255,0.92)_0%,_rgba(255,255,255,0.98)_100%)]",
  execution: "border-indigo-200/80 bg-[linear-gradient(180deg,_rgba(238,242,255,0.92)_0%,_rgba(255,255,255,0.98)_100%)]",
  governance: "border-emerald-200/80 bg-[linear-gradient(180deg,_rgba(236,253,245,0.92)_0%,_rgba(255,255,255,0.98)_100%)]",
};

const protocolRows: Record<Locale, Array<{ route: string; when: string; why: string }>> = {
  zh: [
    {
      route: "Commander -> Codex",
      when: "任务以代码实现为主、局限在仓库内、并且可以通过测试验证",
      why: "Codex 适合明确、可验证的实现类任务。",
    },
    {
      route: "Commander -> Claude Code",
      when: "任务存在歧义、涉及架构判断，或者偏评审和高上下文推理",
      why: "Claude Code 更适合长上下文理解、设计判断和评审型工作。",
    },
    {
      route: "Executor -> Commander",
      when: "任务需要重新拆分、改边界或者重新分配归属",
      why: "只有 Commander 可以修改任务边界和 owner。",
    },
  ],
  en: [
    {
      route: "Commander -> Codex",
      when: "Task is code-heavy, repo-local, and testable",
      why: "Codex is the default executor for concrete implementation slices.",
    },
    {
      route: "Commander -> Claude Code",
      when: "Task is ambiguous, architecture-sensitive, or review-heavy",
      why: "Claude Code is better for longer reasoning and design-sensitive review.",
    },
    {
      route: "Executor -> Commander",
      when: "A task needs to be re-scoped or split",
      why: "Only Commander should change task boundaries or ownership.",
    },
  ],
};

function getInitialLocale(): Locale {
  return "zh";
}

function ownerLabel(owner: OrchestraTask["owner"], locale: Locale): string {
  if (locale === "en") {
    switch (owner) {
      case "claude_code":
        return "Claude Code";
      case "codex":
        return "Codex";
      case "commander":
        return "Commander";
      case "human":
        return "Human";
      case "portfolio":
        return "Portfolio";
      case "planner":
        return "Planner";
    }
  }

  switch (owner) {
    case "claude_code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "commander":
      return "指挥官";
    case "human":
      return "人工";
    case "portfolio":
      return "Portfolio";
    case "planner":
      return "规划器";
  }
}

function suggestDependenciesForLane(
  tasks: OrchestraTask[],
  lane: OrchestraTask["lane"],
  selectedTaskId?: string,
  excludeTaskId?: string,
): string[] {
  const orderedTasks = tasks.filter((task) => task.id !== excludeTaskId);
  const selectedTask = selectedTaskId ? orderedTasks.find((task) => task.id === selectedTaskId) : null;

  const preferSelectedTask =
    selectedTask &&
    selectedTask.lane !== lane &&
    laneOrder.indexOf(selectedTask.lane) <= laneOrder.indexOf(lane);

  if (preferSelectedTask) {
    return [selectedTask.id];
  }

  if (lane === "strategy") {
    return [];
  }

  const previousLane = laneOrder[laneOrder.indexOf(lane) - 1];
  if (!previousLane) {
    return [];
  }

  const previousLaneTasks = orderedTasks.filter((task) => task.lane === previousLane);
  if (!previousLaneTasks.length) {
    return [];
  }

  if (lane === "governance") {
    return previousLaneTasks.map((task) => task.id);
  }

  const doneCandidate = [...previousLaneTasks].reverse().find((task) => task.state === "done");
  return [doneCandidate?.id ?? previousLaneTasks[previousLaneTasks.length - 1].id];
}

function kindLabel(kind: OrchestraTask["kind"], locale: Locale): string {
  if (locale === "en") {
    return kind;
  }

  switch (kind) {
    case "brief":
      return "简报";
    case "research":
      return "研究";
    case "spec":
      return "规格";
    case "implementation":
      return "实现";
    case "review":
      return "评审";
    case "launch":
      return "发布";
  }
}

function translateTask(task: OrchestraTask, locale: Locale) {
  if (locale === "en") {
    return task;
  }

  const dictionary: Record<
    string,
    {
      source: { title: string; summary: string; acceptance: string[] };
      target: { title: string; summary: string; acceptance: string[] };
    }
  > = {
    "brief-clarify": {
      source: {
        title: "Clarify feature brief",
        summary: "Turn the raw feature request into explicit goals, constraints, and rollout intent.",
        acceptance: ["Goals and constraints are explicit", "Downstream agents can plan without guessing"],
      },
      target: {
        title: "澄清功能简报",
        summary: "把原始功能请求整理成明确的目标、约束和上线意图。",
        acceptance: ["目标和约束已明确", "下游 agent 无需猜测即可继续规划"],
      },
    },
    "plan-graph": {
      source: {
        title: "Generate task graph",
        summary: "Split work into planning, implementation, and review slices with dependency edges.",
        acceptance: ["Tasks are sequenced", "Each task has a clear executor"],
      },
      target: {
        title: "生成任务图",
        summary: "把工作拆成规划、实现和评审切片，并明确依赖关系。",
        acceptance: ["任务顺序清晰", "每个任务都有明确执行者"],
      },
    },
    "exec-board-ui": {
      source: {
        title: "Build orchestration board UI",
        summary: "Create the board surface where agents, progress, and feature planning are visible.",
        acceptance: ["Board view renders lanes", "Agent roster is visible", "Planning input is editable"],
      },
      target: {
        title: "构建编排看板 UI",
        summary: "创建用于展示 agents、进度和功能规划的看板界面。",
        acceptance: ["看板视图已渲染", "Agent roster 可见", "规划输入可编辑"],
      },
    },
    "exec-command-protocol": {
      source: {
        title: "Define Commander handoff protocol",
        summary: "Specify how Commander routes concrete work to Codex versus Claude Code.",
        acceptance: ["Executor choice is explicit", "Review path is defined", "Ambiguous tasks escalate correctly"],
      },
      target: {
        title: "定义 Commander 交接协议",
        summary: "明确 Commander 如何把任务分派给 Codex 或 Claude Code。",
        acceptance: ["执行者选择规则清晰", "评审路径已定义", "歧义任务会升级回 Commander"],
      },
    },
    "review-governance": {
      source: {
        title: "Run portfolio review",
        summary: "Assess whether the board helps with product prioritization and commercial decision-making.",
        acceptance: ["Risks are surfaced", "Business opportunities are documented"],
      },
      target: {
        title: "进行 Portfolio Review",
        summary: "从产品和商业角度评估这个 board 是否真正提升了决策效率。",
        acceptance: ["风险已暴露", "商业机会已记录"],
      },
    },
  };

  const translated = dictionary[task.id];
  if (!translated) {
    return {
      title: task.title,
      summary: task.summary,
      acceptance: task.acceptance,
    };
  }

  const matchesSource =
    task.title === translated.source.title &&
    task.summary === translated.source.summary &&
    task.acceptance.length === translated.source.acceptance.length &&
    task.acceptance.every((criterion, index) => criterion === translated.source.acceptance[index]);

  return matchesSource
    ? translated.target
    : {
    title: task.title,
    summary: task.summary,
    acceptance: task.acceptance,
  };
}

function timelineLabel(type: OrchestraTimelineEvent["eventType"], locale: Locale): string {
  if (locale === "en") {
    return type;
  }

  switch (type) {
    case "queued":
      return "已排队";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "board_saved":
      return "看板已更新";
    case "comment_added":
      return "已添加评论";
  }
}

function buildBatchCommand(packetList: CommandPacket[]): string {
  return packetList.map((packet) => packet.suggestedCommand).join("\n");
}

function getPriorityRank(priority: OrchestraTaskPriority): number {
  switch (priority) {
    case "critical":
      return 0;
    case "high":
      return 1;
    case "medium":
      return 2;
    case "low":
      return 3;
  }
}

function getOwnerRank(owner: OrchestraExecutor): number {
  switch (owner) {
    case "planner":
      return 0;
    case "commander":
      return 1;
    case "codex":
      return 2;
    case "claude_code":
      return 3;
    case "portfolio":
      return 4;
    case "human":
      return 5;
  }
}

function sortTasksByDependency(tasks: OrchestraTask[]): OrchestraTask[] {
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: OrchestraTask[] = [];

  function visit(task: OrchestraTask) {
    if (visited.has(task.id)) {
      return;
    }
    if (visiting.has(task.id)) {
      result.push(task);
      visited.add(task.id);
      return;
    }

    visiting.add(task.id);
    task.dependsOn
      .map((dependencyId) => taskMap.get(dependencyId))
      .filter((dependency): dependency is OrchestraTask => Boolean(dependency))
      .forEach(visit);
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  }

  tasks.forEach(visit);
  return result;
}

function sortCommandTasks(
  tasks: OrchestraTask[],
  strategy: BatchStrategy,
  selectedIds: string[],
): OrchestraTask[] {
  const manualOrder = new Map(selectedIds.map((id, index) => [id, index]));
  const base = [...tasks].sort((a, b) => (manualOrder.get(a.id) ?? 0) - (manualOrder.get(b.id) ?? 0));

  switch (strategy) {
    case "manual":
      return base;
    case "dependency":
      return sortTasksByDependency(base);
    case "owner":
      return [...base].sort((a, b) => {
        const ownerRank = getOwnerRank(a.owner) - getOwnerRank(b.owner);
        if (ownerRank !== 0) {
          return ownerRank;
        }
        return (manualOrder.get(a.id) ?? 0) - (manualOrder.get(b.id) ?? 0);
      });
    case "priority":
      return [...base].sort((a, b) => {
        const priorityRank = getPriorityRank(a.priority) - getPriorityRank(b.priority);
        if (priorityRank !== 0) {
          return priorityRank;
        }
        return (manualOrder.get(a.id) ?? 0) - (manualOrder.get(b.id) ?? 0);
      });
  }
}

function buildRunRecord(taskId: string, result: ExecutorRunResult): OrchestraRunRecord {
  return {
    id: `${taskId}-${Date.now()}`,
    taskId,
    executor: result.executor,
    mode: result.mode,
    status: "succeeded",
    command: result.command.split(" ")[0] ?? result.command,
    args: result.command.split(" ").slice(1),
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: null,
    createdAt: new Date().toISOString(),
    durationMs: result.durationMs,
  };
}

function buildTimeline(taskId: string, runId: string, locale: Locale): OrchestraTimelineEvent[] {
  return [
    {
      id: `${runId}-queued`,
      taskId,
      runId,
      eventType: "queued",
      title: locale === "zh" ? "Run 已排队" : "Run queued",
      detail: locale === "zh" ? "Commander 已生成交接包并进入模拟执行。" : "Commander generated a handoff and moved into simulated execution.",
      createdAt: new Date().toISOString(),
    },
    {
      id: `${runId}-done`,
      taskId,
      runId,
      eventType: "completed",
      title: locale === "zh" ? "Run 已完成" : "Run completed",
      detail: locale === "zh" ? "开源版使用本地模拟模式，不会真的启动外部 CLI。" : "The open-source demo uses local simulation mode and does not invoke external CLIs.",
      createdAt: new Date().toISOString(),
    },
  ];
}

function buildCommentTimeline(taskId: string, comment: OrchestraTaskComment, locale: Locale): OrchestraTimelineEvent {
  return {
    id: `${taskId}-${comment.id}`,
    taskId,
    eventType: "comment_added",
    title: locale === "zh" ? "新增评论" : "Comment added",
    detail: `${ownerLabel(comment.author, locale)}: ${comment.body}`,
    createdAt: comment.createdAt,
  };
}

function updateTaskState(task: OrchestraTask): OrchestraTask {
  if (task.kind === "implementation") {
    return { ...task, state: "review" };
  }
  return { ...task, state: "done" };
}

function updateTask(board: OrchestraBoard, taskId: string, updates: Partial<OrchestraTask>): OrchestraBoard {
  return {
    ...board,
    tasks: board.tasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
  };
}

function moveTask(board: OrchestraBoard, taskId: string, targetLane: OrchestraTask["lane"], targetIndex?: number): OrchestraBoard {
  const tasks = [...board.tasks];
  const sourceIndex = tasks.findIndex((task) => task.id === taskId);
  if (sourceIndex === -1) {
    return board;
  }

  const [task] = tasks.splice(sourceIndex, 1);
  const nextTask = { ...task, lane: targetLane };

  const laneIndexes = tasks
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.lane === targetLane)
    .map(({ index }) => index);

  if (laneIndexes.length === 0) {
    const insertAfter = tasks.map((candidate) => candidate.lane).lastIndexOf(targetLane);
    if (insertAfter === -1) {
      tasks.push(nextTask);
    } else {
      tasks.splice(insertAfter + 1, 0, nextTask);
    }
    return { ...board, tasks };
  }

  const safeIndex = targetIndex == null ? laneIndexes.length : Math.max(0, Math.min(targetIndex, laneIndexes.length));
  const insertAt = safeIndex >= laneIndexes.length ? laneIndexes[laneIndexes.length - 1] + 1 : laneIndexes[safeIndex];
  tasks.splice(insertAt, 0, nextTask);

  return { ...board, tasks };
}

function createTaskId(title: string): string {
  return `task-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || Date.now()}`;
}

function parseAcceptance(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeBoard(board: OrchestraBoard): OrchestraBoard {
  return {
    ...board,
    tasks: board.tasks.map((task) => ({
      ...task,
      comments: task.comments ?? [],
    })),
  };
}

function buildPortfolioSignals(board: OrchestraBoard, locale: Locale) {
  const blockedTasks = board.tasks.filter((task) => task.state === "blocked");
  const readyTasks = board.tasks.filter((task) => task.state === "ready");
  const executionTasks = board.tasks.filter((task) => task.lane === "execution");
  const uncommentedExecutionTasks = executionTasks.filter((task) => task.comments.length === 0);
  const criticalTasks = board.tasks.filter((task) => task.priority === "critical");
  const doneTasks = board.tasks.filter((task) => task.state === "done");
  const completionRate = board.tasks.length ? Math.round((doneTasks.length / board.tasks.length) * 100) : 0;

  return [
    locale === "zh"
      ? {
          title: "交付健康度",
          tone: blockedTasks.length ? "rose" : "emerald",
          detail: blockedTasks.length
            ? `${blockedTasks.length} 个任务处于阻塞状态，建议先清理依赖或重新拆分。`
            : `当前没有阻塞任务，整体交付链路比较健康。`,
        }
      : {
          title: "Delivery health",
          tone: blockedTasks.length ? "rose" : "emerald",
          detail: blockedTasks.length
            ? `${blockedTasks.length} tasks are blocked. Clear dependencies or re-scope them first.`
            : "No tasks are currently blocked, so the delivery graph looks healthy.",
        },
    locale === "zh"
      ? {
          title: "执行面负载",
          tone: readyTasks.length > 3 ? "amber" : "sky",
          detail:
            readyTasks.length > 3
              ? `有 ${readyTasks.length} 个 ready 任务等待执行，适合继续做批量分发。`
              : `当前 ready 任务是 ${readyTasks.length} 个，执行负载仍然可控。`,
        }
      : {
          title: "Execution load",
          tone: readyTasks.length > 3 ? "amber" : "sky",
          detail:
            readyTasks.length > 3
              ? `${readyTasks.length} ready tasks are waiting. A larger execution batch makes sense now.`
              : `${readyTasks.length} tasks are ready, so executor load is still manageable.`,
        },
    locale === "zh"
      ? {
          title: "协作记录",
          tone: uncommentedExecutionTasks.length ? "slate" : "emerald",
          detail:
            uncommentedExecutionTasks.length
              ? `${uncommentedExecutionTasks.length} 个执行任务还没有评论，建议记录决策和风险。`
              : "执行任务都已经有评论记录，协作上下文比较完整。",
        }
      : {
          title: "Collaboration trail",
          tone: uncommentedExecutionTasks.length ? "slate" : "emerald",
          detail:
            uncommentedExecutionTasks.length
              ? `${uncommentedExecutionTasks.length} execution tasks still have no comments. Capture decisions and risks there.`
              : "All execution tasks already have comments, so collaboration context looks solid.",
        },
    locale === "zh"
      ? {
          title: "业务推进感知",
          tone: criticalTasks.length && completionRate < 50 ? "amber" : "sky",
          detail:
            criticalTasks.length && completionRate < 50
              ? `还有 ${criticalTasks.length} 个最高优先级任务未完全消化，当前完成度约 ${completionRate}%。`
              : `当前整体完成度约 ${completionRate}%，可以开始关注下一阶段机会。`,
        }
      : {
          title: "Portfolio signal",
          tone: criticalTasks.length && completionRate < 50 ? "amber" : "sky",
          detail:
            criticalTasks.length && completionRate < 50
              ? `${criticalTasks.length} critical tasks are still active and completion is about ${completionRate}%.`
              : `Overall completion is about ${completionRate}%, so you can start looking at follow-on opportunities.`,
        },
  ];
}

function matchesTaskSearch(task: OrchestraTask, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    task.title,
    task.summary,
    ...task.acceptance,
    ...task.comments.map((comment) => comment.body),
  ]
    .join("\n")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

export function OrchestraBoard() {
  const defaultBoard = getDefaultOrchestraBoard();
  const defaultBoardId = "board-default";
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [activeBoardId, setActiveBoardId] = useState(defaultBoardId);
  const [boardSnapshots, setBoardSnapshots] = useState<OrchestraBoardSnapshot[]>([
    createBoardSnapshot({
      id: defaultBoardId,
      name: defaultBoard.feature.title,
      template: orchestraScenarios[0]?.template ?? "delivery",
      board: defaultBoard,
      selectedTaskId: defaultBoard.tasks[0]?.id ?? "",
      runHistory: [],
      batchSummaries: [],
      timeline: [],
      selectedCommandTaskIds: [],
    }),
  ]);
  const [board, setBoard] = useState<OrchestraBoard>(defaultBoard);
  const [title, setTitle] = useState(board.feature.title);
  const [problem, setProblem] = useState(board.feature.problem);
  const [goals, setGoals] = useState(board.feature.goals.join("\n"));
  const [constraints, setConstraints] = useState(board.feature.constraints.join("\n"));
  const [selectedTaskId, setSelectedTaskId] = useState(defaultBoard.tasks[0]?.id ?? "");
  const [packet, setPacket] = useState<CommandPacket | null>(null);
  const [runResult, setRunResult] = useState<DemoResult | null>(null);
  const [runHistory, setRunHistory] = useState<OrchestraRunRecord[]>([]);
  const [batchSummaries, setBatchSummaries] = useState<BatchRunSummary[]>([]);
  const [timeline, setTimeline] = useState<OrchestraTimelineEvent[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"task" | "batch" | "runs" | "deps">("task");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(orchestraScenarios[0]?.id ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<OrchestraTemplateId>(orchestraScenarios[0]?.template ?? "delivery");
  const [boardSearchQuery, setBoardSearchQuery] = useState("");
  const [boardNameDraft, setBoardNameDraft] = useState(defaultBoard.feature.title);
  const [dispatchQueue, setDispatchQueue] = useState<DispatchQueueItem[]>([]);
  const [dispatchStrategy, setDispatchStrategy] = useState<DispatchQueueStrategy>("board");
  const [dispatchHistory, setDispatchHistory] = useState<DispatchHistoryEntry[]>([]);
  const [autoLoadNextBatch, setAutoLoadNextBatch] = useState(false);
  const [runStatusFilter, setRunStatusFilter] = useState<RunStatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [laneFilter, setLaneFilter] = useState<OrchestraTask["lane"] | "all">("all");
  const [stateFilter, setStateFilter] = useState<OrchestraTaskState | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<OrchestraExecutor | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<OrchestraTaskPriority | "all">("all");
  const [selectedCommandTaskIds, setSelectedCommandTaskIds] = useState<string[]>([]);
  const [batchStrategy, setBatchStrategy] = useState<BatchStrategy>("manual");
  const [adapterMode, setAdapterMode] = useState<ExecutorAdapterMode>("simulated-local");
  const [executionStage, setExecutionStage] = useState<ExecutionStage>("preview");
  const [commandTemplates, setCommandTemplates] = useState<CommandTemplateConfig>({
    codex: 'codex exec "{title}: {summary}"',
    claude_code: 'claude-code run "{title}: {summary}"',
  });
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<OrchestraTask["lane"] | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [newCommentBody, setNewCommentBody] = useState("");
  const [newCommentAuthor, setNewCommentAuthor] = useState<OrchestraExecutor>("human");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskSummary, setNewTaskSummary] = useState("");
  const [newTaskLane, setNewTaskLane] = useState<OrchestraTask["lane"]>("execution");
  const [newTaskOwner, setNewTaskOwner] = useState<OrchestraExecutor>("codex");
  const [newTaskPriority, setNewTaskPriority] = useState<OrchestraTaskPriority>("medium");
  const draftFeature = useMemo<OrchestraFeatureIdea>(() => ({
    ...board.feature,
    title: title.trim() || board.feature.title,
    problem: problem.trim() || board.feature.problem,
    goals: goals.split("\n").map((line) => line.trim()).filter(Boolean),
    constraints: constraints.split("\n").map((line) => line.trim()).filter(Boolean),
  }), [board.feature, constraints, goals, problem, title]);
  const draftBoard = useMemo<OrchestraBoard>(
    () => ({
      ...board,
      feature: draftFeature,
    }),
    [board, draftFeature],
  );

  const taskCounts = useMemo(() => summarizeByOwner(board.tasks), [board.tasks]);
  const portfolioSignals = useMemo(() => buildPortfolioSignals(board, locale), [board, locale]);
  const dependencyMap = useMemo(
    () =>
      board.tasks
        .filter((task) => task.dependsOn.length > 0)
        .map((task) => ({
          task,
          dependencies: task.dependsOn
            .map((dependencyId) => board.tasks.find((candidate) => candidate.id === dependencyId))
            .filter((dependency): dependency is OrchestraTask => Boolean(dependency)),
        })),
    [board.tasks],
  );
  const reverseDependencyMap = useMemo(
    () =>
      board.tasks
        .map((task) => ({
          task,
          dependents: board.tasks.filter((candidate) => candidate.dependsOn.includes(task.id)),
        }))
        .filter((entry) => entry.dependents.length > 0),
    [board.tasks],
  );
  const visibleTasks = useMemo(() => board.tasks.filter((task) => {
    if (quickFilter === "ready" && task.state !== "ready") {
      return false;
    }
    if (quickFilter === "blocked" && task.state !== "blocked") {
      return false;
    }
    if (quickFilter === "critical" && task.priority !== "critical") {
      return false;
    }
    if (laneFilter !== "all" && task.lane !== laneFilter) {
      return false;
    }
    if (stateFilter !== "all" && task.state !== stateFilter) {
      return false;
    }
    if (ownerFilter !== "all" && task.owner !== ownerFilter) {
      return false;
    }
    if (priorityFilter !== "all" && task.priority !== priorityFilter) {
      return false;
    }
    return matchesTaskSearch(task, searchQuery);
  }), [board.tasks, laneFilter, ownerFilter, priorityFilter, quickFilter, searchQuery, stateFilter]);
  const laneMap = useMemo(
    () => laneOrder.map((lane) => {
      const tasks = visibleTasks.filter((task) => task.lane === lane);
      return {
        lane,
        tasks,
        readyCount: tasks.filter((task) => task.state === "ready").length,
        blockedCount: tasks.filter((task) => task.state === "blocked").length,
      };
    }),
    [visibleTasks],
  );
  const selectedTask = useMemo(
    () => board.tasks.find((task) => task.id === selectedTaskId) ?? board.tasks[0] ?? null,
    [board.tasks, selectedTaskId],
  );
  const selectedTimeline = timeline.filter((event) => event.taskId === selectedTaskId);
  const commandTasks = useMemo(
    () => board.tasks.filter((task) => selectedCommandTaskIds.includes(task.id)),
    [board.tasks, selectedCommandTaskIds],
  );
  const orderedCommandTasks = useMemo(
    () => sortCommandTasks(commandTasks, batchStrategy, selectedCommandTaskIds),
    [batchStrategy, commandTasks, selectedCommandTaskIds],
  );
  const selectedAdapter = useMemo(
    () => executorAdapters.find((adapter) => adapter.id === adapterMode) ?? simulatedExecutorAdapter,
    [adapterMode],
  );
  const suggestedNewTaskDependencies = useMemo(
    () => suggestDependenciesForLane(board.tasks, newTaskLane, selectedTaskId),
    [board.tasks, newTaskLane, selectedTaskId],
  );
  const suggestedSelectedTaskDependencies = useMemo(
    () => selectedTask
      ? suggestDependenciesForLane(board.tasks, selectedTask.lane, selectedTaskId, selectedTask.id)
      : [],
    [board.tasks, selectedTask, selectedTaskId],
  );
  const environmentChecks = useMemo(
    () => [
      {
        id: "codex",
        label: "Codex CLI",
        ok: commandTemplates.codex.includes("codex"),
        detail: locale === "zh"
          ? "模板里已经包含 Codex 命令前缀。"
          : "The configured template includes a Codex command prefix.",
      },
      {
        id: "claude",
        label: "Claude Code CLI",
        ok: commandTemplates.claude_code.includes("claude"),
        detail: locale === "zh"
          ? "模板里已经包含 Claude Code 命令前缀。"
          : "The configured template includes a Claude Code command prefix.",
      },
      {
        id: "stage",
        label: locale === "zh" ? "运行档位" : "Execution Stage",
        ok: executionStage !== "live",
        detail: executionStage === "live"
          ? (locale === "zh" ? "当前仍为开源演示仓库，live 仅作为未来接入占位。" : "Live remains a placeholder in this open-source demo.")
          : (locale === "zh" ? "当前档位仍然是安全模式，不会调用外部进程。" : "Current stage is still safe and will not invoke external processes."),
      },
    ],
    [commandTemplates.claude_code, commandTemplates.codex, executionStage, locale],
  );
  const commandPackets = useMemo(
    () => orderedCommandTasks.map((task) => buildCommandPacket(board.feature, task, task.owner, commandTemplates)),
    [board.feature, commandTemplates, orderedCommandTasks],
  );
  const runnableVisibleTaskIds = useMemo(
    () =>
      visibleTasks
        .filter((task) =>
          task.state === "ready" &&
          task.dependsOn.every((dependencyId) => {
            const dependency = board.tasks.find((candidate) => candidate.id === dependencyId);
            return dependency?.state === "done";
          }),
        )
        .map((task) => task.id),
    [board.tasks, visibleTasks],
  );
  const runnableTaskCount = useMemo(
    () =>
      orderedCommandTasks.filter((task) =>
        task.state === "ready" &&
        task.dependsOn.every((dependencyId) => {
          const dependency = board.tasks.find((candidate) => candidate.id === dependencyId);
          return dependency?.state === "done";
        }),
      ).length,
    [board.tasks, orderedCommandTasks],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedLocale = window.localStorage.getItem(LOCALE_KEY);
      if (storedLocale === "zh" || storedLocale === "en") {
        setLocale(storedLocale);
      }

      const raw = window.localStorage.getItem(STATE_KEY);
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as OrchestraWorkspaceState & {
          board?: OrchestraBoard;
          selectedTaskId?: string;
          runHistory?: OrchestraRunRecord[];
          batchSummaries?: BatchRunSummary[];
          timeline?: OrchestraTimelineEvent[];
          selectedCommandTaskIds?: string[];
          dispatchQueue?: DispatchQueueItem[];
          dispatchStrategy?: DispatchQueueStrategy;
          dispatchHistory?: DispatchHistoryEntry[];
          autoLoadNextBatch?: boolean;
          runStatusFilter?: RunStatusFilter;
          selectedTemplateId?: OrchestraTemplateId;
          batchStrategy?: BatchStrategy;
          adapterMode?: ExecutorAdapterMode;
          executionStage?: ExecutionStage;
          commandTemplates?: CommandTemplateConfig;
        };

        const parsedBoards = Array.isArray(parsed.boards) && parsed.boards.length
          ? parsed.boards.map((snapshot) => ({
            ...snapshot,
            board: normalizeBoard(snapshot.board),
            batchSummaries: normalizeBatchSummaries(snapshot.batchSummaries),
          }))
          : parsed.board
            ? [createBoardSnapshot({
              id: defaultBoardId,
              name: parsed.board.feature.title,
              template: parsed.selectedTemplateId ?? orchestraScenarios[0]?.template ?? "delivery",
              board: normalizeBoard(parsed.board),
              selectedTaskId: parsed.selectedTaskId ?? parsed.board.tasks[0]?.id ?? "",
              runHistory: parsed.runHistory ?? [],
              batchSummaries: parsed.batchSummaries ?? [],
              timeline: parsed.timeline ?? [],
              selectedCommandTaskIds: parsed.selectedCommandTaskIds ?? [],
            })]
            : [];

        if (parsedBoards.length) {
          const nextActiveBoardId = parsed.activeBoardId && parsedBoards.find((snapshot) => snapshot.id === parsed.activeBoardId)
            ? parsed.activeBoardId
            : parsedBoards[0].id;
          const activeSnapshot = parsedBoards.find((snapshot) => snapshot.id === nextActiveBoardId) ?? parsedBoards[0];

          setBoardSnapshots(parsedBoards);
          setActiveBoardId(nextActiveBoardId);
          setBoard(activeSnapshot.board);
          setSelectedTaskId(activeSnapshot.selectedTaskId || activeSnapshot.board.tasks[0]?.id || "");
          setRunHistory(activeSnapshot.runHistory ?? []);
          setBatchSummaries(normalizeBatchSummaries(activeSnapshot.batchSummaries));
          setTimeline(activeSnapshot.timeline ?? []);
          setSelectedCommandTaskIds(activeSnapshot.selectedCommandTaskIds ?? []);
          setSelectedTemplateId(activeSnapshot.template ?? orchestraScenarios[0]?.template ?? "delivery");
          setTitle(activeSnapshot.board.feature.title);
          setProblem(activeSnapshot.board.feature.problem);
          setGoals(activeSnapshot.board.feature.goals.join("\n"));
          setConstraints(activeSnapshot.board.feature.constraints.join("\n"));
          setBoardNameDraft(activeSnapshot.name);
        }

        setDispatchQueue(parsed.dispatchQueue ?? []);
        setDispatchStrategy(parsed.dispatchStrategy ?? "board");
        setDispatchHistory(parsed.dispatchHistory ?? []);
        setAutoLoadNextBatch(parsed.autoLoadNextBatch ?? false);
        setRunStatusFilter(parsed.runStatusFilter ?? "all");
        setBatchStrategy(parsed.batchStrategy ?? "manual");
        setAdapterMode(parsed.adapterMode ?? "simulated-local");
        setExecutionStage(parsed.executionStage ?? "preview");
        setCommandTemplates(parsed.commandTemplates ?? {
          codex: 'codex exec "{title}: {summary}"',
          claude_code: 'claude-code run "{title}: {summary}"',
        });
      } catch {
        // Ignore invalid local state.
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);
  const selectedScenario = orchestraScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? orchestraScenarios[0];
  const sortedBoardSnapshots = useMemo(
    () => [...boardSnapshots].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [boardSnapshots],
  );
  const visibleBoardSnapshots = useMemo(() => {
    if (!boardSearchQuery.trim()) {
      return sortedBoardSnapshots;
    }

    const query = boardSearchQuery.toLowerCase();
    return sortedBoardSnapshots.filter((snapshot) => {
      const haystack = [
        snapshot.name,
        snapshot.board.feature.title,
        snapshot.board.feature.problem,
      ].join("\n").toLowerCase();
      return haystack.includes(query);
    });
  }, [boardSearchQuery, sortedBoardSnapshots]);
  const portfolioOverview = useMemo(() => {
    const boardCount = boardSnapshots.length;
    const totals = boardSnapshots.reduce((acc, snapshot) => {
      const tasks = snapshot.board.tasks;
      acc.tasks += tasks.length;
      acc.ready += tasks.filter((task) => task.state === "ready").length;
      acc.blocked += tasks.filter((task) => task.state === "blocked").length;
      acc.done += tasks.filter((task) => task.state === "done").length;
      acc.inFlight += tasks.filter((task) => task.state === "in_progress" || task.state === "review").length;
      return acc;
    }, { tasks: 0, ready: 0, blocked: 0, done: 0, inFlight: 0 });

    const riskyBoards = [...boardSnapshots]
      .map((snapshot) => {
        const blocked = snapshot.board.tasks.filter((task) => task.state === "blocked").length;
        const criticalOpen = snapshot.board.tasks.filter((task) => task.priority === "critical" && task.state !== "done").length;
        const ready = snapshot.board.tasks.filter((task) => task.state === "ready").length;
        const done = snapshot.board.tasks.filter((task) => task.state === "done").length;
        const completionRate = snapshot.board.tasks.length ? Math.round((done / snapshot.board.tasks.length) * 100) : 0;
        return {
          id: snapshot.id,
          name: snapshot.name,
          blocked,
          criticalOpen,
          ready,
          completionRate,
        };
      })
      .sort((left, right) => (right.blocked * 3 + right.criticalOpen * 2) - (left.blocked * 3 + left.criticalOpen * 2))
      .slice(0, 3);

    const recentlyActiveBoards = sortedBoardSnapshots.slice(0, 4).map((snapshot) => ({
      id: snapshot.id,
      name: snapshot.name,
      updatedAt: snapshot.updatedAt,
      ready: snapshot.board.tasks.filter((task) => task.state === "ready").length,
      blocked: snapshot.board.tasks.filter((task) => task.state === "blocked").length,
    }));

    return {
      boardCount,
      ...totals,
      riskyBoards,
      recentlyActiveBoards,
    };
  }, [boardSnapshots, sortedBoardSnapshots]);
  const portfolioActionPlan = useMemo(() => {
    const priorityScore: Record<OrchestraTaskPriority, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 5,
    };
    const nextBoards = boardSnapshots
      .map((snapshot) => {
        const tasks = snapshot.board.tasks;
        const blocked = tasks.filter((task) => task.state === "blocked").length;
        const criticalOpen = tasks.filter((task) => task.priority === "critical" && task.state !== "done").length;
        const runnable = tasks.filter((task) =>
          task.state === "ready" &&
          task.dependsOn.every((dependencyId) => tasks.find((candidate) => candidate.id === dependencyId)?.state === "done"),
        ).length;
        return {
          id: snapshot.id,
          name: snapshot.name,
          score: criticalOpen * 5 + blocked * 3 + runnable,
          blocked,
          runnable,
          criticalOpen,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);

    const executorLoad = (["commander", "planner", "codex", "claude_code", "portfolio", "human"] as OrchestraExecutor[])
      .map((executor) => {
        const active = boardSnapshots.reduce((sum, snapshot) => (
          sum + snapshot.board.tasks.filter((task) =>
            task.owner === executor &&
            ["ready", "in_progress", "review", "blocked"].includes(task.state),
          ).length
        ), 0);
        const blocked = boardSnapshots.reduce((sum, snapshot) => (
          sum + snapshot.board.tasks.filter((task) => task.owner === executor && task.state === "blocked").length
        ), 0);
        return { executor, active, blocked };
      })
      .filter((entry) => entry.active > 0)
      .sort((left, right) => right.active - left.active);

    const suggestedBatch = boardSnapshots
      .flatMap((snapshot) => snapshot.board.tasks
        .filter((task) =>
          task.state === "ready" &&
          task.dependsOn.every((dependencyId) => snapshot.board.tasks.find((candidate) => candidate.id === dependencyId)?.state === "done"),
        )
        .map((task) => ({
          boardId: snapshot.id,
          boardName: snapshot.name,
          taskId: task.id,
          title: task.title,
          owner: task.owner,
          priority: task.priority,
          score: priorityScore[task.priority] + (task.lane === "execution" ? 2 : 0),
        })))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);

    return {
      nextBoards,
      executorLoad,
      suggestedBatch,
    };
  }, [boardSnapshots]);
  const nextDispatchTarget = useMemo(() => {
    const priorityScore: Record<OrchestraTaskPriority, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    if (!dispatchQueue.length) {
      return null;
    }

    const orderedQueue = [...dispatchQueue].sort((left, right) => {
      if (dispatchStrategy === "priority") {
        return priorityScore[right.priority] - priorityScore[left.priority];
      }
      if (dispatchStrategy === "owner") {
        return left.owner.localeCompare(right.owner) || left.boardName.localeCompare(right.boardName);
      }
      return left.boardName.localeCompare(right.boardName);
    });

    const first = orderedQueue[0];
    if (!first) {
      return null;
    }

    const items = orderedQueue.filter((item) => (
      dispatchStrategy === "owner" ? item.owner === first.owner : item.boardId === first.boardId
    ));

    return {
      strategy: dispatchStrategy,
      boardId: first.boardId,
      boardName: first.boardName,
      owner: first.owner,
      items,
      orderedQueue,
    };
  }, [dispatchQueue, dispatchStrategy]);
  const batchPreflight = useMemo(() => {
    const warnings: string[] = [];
    const checks = [
      {
        label: locale === "zh" ? "已选任务" : "Selected tasks",
        ok: orderedCommandTasks.length > 0,
        detail: locale === "zh"
          ? `当前批次包含 ${orderedCommandTasks.length} 个任务。`
          : `${orderedCommandTasks.length} tasks are in the current batch.`,
      },
      {
        label: locale === "zh" ? "命令模板" : "Command templates",
        ok: Boolean(commandTemplates.codex.trim() && commandTemplates.claude_code.trim()),
        detail: locale === "zh"
          ? "Codex 和 Claude Code 模板都已配置。"
          : "Both Codex and Claude Code templates are configured.",
      },
      {
        label: locale === "zh" ? "执行模式" : "Execution mode",
        ok: executionStage !== "live",
        detail: executionStage === "live"
          ? (locale === "zh" ? "当前仍是安全演示仓库，live 只作为占位。" : "This is still a safe demo repo; live is placeholder only.")
          : (locale === "zh" ? "当前模式仍然不会调用外部进程。" : "Current mode still avoids external process execution."),
      },
      {
        label: locale === "zh" ? "可运行任务" : "Runnable tasks",
        ok: runnableTaskCount > 0,
        detail: locale === "zh"
          ? `${runnableTaskCount} 个任务满足依赖，可以真正进入批量执行。`
          : `${runnableTaskCount} tasks satisfy dependencies and can execute in this batch.`,
      },
    ];

    if (!orderedCommandTasks.length) {
      warnings.push(locale === "zh" ? "先从看板或 dispatch queue 里挑出一批任务。" : "Select tasks from the board or dispatch queue first.");
    }
    if (!runnableTaskCount && orderedCommandTasks.length) {
      warnings.push(locale === "zh" ? "当前批次里没有 ready 且依赖满足的任务。" : "No tasks in the batch are ready with satisfied dependencies.");
    }
    if (executionStage === "live") {
      warnings.push(locale === "zh" ? "live 仍是占位模式，适合演示接口，不适合期待真实 CLI 运行。" : "Live is still a placeholder mode for demoing the interface, not real CLI execution.");
    }

    return {
      checks,
      warnings,
      ready: orderedCommandTasks.length > 0 && runnableTaskCount > 0,
    };
  }, [commandTemplates.claude_code, commandTemplates.codex, executionStage, locale, orderedCommandTasks.length, runnableTaskCount]);
  const visibleRunHistory = useMemo(
    () => runHistory.filter((record) => runStatusFilter === "all" || record.status === runStatusFilter),
    [runHistory, runStatusFilter],
  );

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    // This keeps the active workspace snapshot in sync with task edits and run history.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBoardSnapshots((current) => {
      const existing = current.find((snapshot) => snapshot.id === activeBoardId);
      const nextSnapshot = createBoardSnapshot({
        id: activeBoardId,
        name: draftFeature.title,
        template: selectedTemplateId,
        updatedAt: existing?.updatedAt ?? new Date().toISOString(),
        board: draftBoard,
        selectedTaskId,
        runHistory,
        batchSummaries,
        timeline,
        selectedCommandTaskIds,
      });
      const hasChanged = !existing
        || JSON.stringify({
          name: existing.name,
          template: existing.template,
          board: existing.board,
          selectedTaskId: existing.selectedTaskId,
          runHistory: existing.runHistory,
          batchSummaries: existing.batchSummaries,
          timeline: existing.timeline,
          selectedCommandTaskIds: existing.selectedCommandTaskIds,
        }) !== JSON.stringify({
          name: nextSnapshot.name,
          template: nextSnapshot.template,
          board: nextSnapshot.board,
          selectedTaskId: nextSnapshot.selectedTaskId,
          runHistory: nextSnapshot.runHistory,
          batchSummaries: nextSnapshot.batchSummaries,
          timeline: nextSnapshot.timeline,
          selectedCommandTaskIds: nextSnapshot.selectedCommandTaskIds,
        });

      if (!hasChanged) {
        return current;
      }

      const updatedSnapshot = { ...nextSnapshot, updatedAt: new Date().toISOString() };
      return current.some((snapshot) => snapshot.id === activeBoardId)
        ? current.map((snapshot) => snapshot.id === activeBoardId ? updatedSnapshot : snapshot)
        : [updatedSnapshot, ...current];
    });
  }, [activeBoardId, batchSummaries, draftBoard, draftFeature.title, runHistory, selectedCommandTaskIds, selectedTaskId, selectedTemplateId, timeline]);

  useEffect(() => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        activeBoardId,
        boards: boardSnapshots,
        dispatchQueue,
        dispatchStrategy,
        dispatchHistory,
        autoLoadNextBatch,
        runStatusFilter,
        selectedTemplateId,
        batchStrategy,
        adapterMode,
        executionStage,
        commandTemplates,
      }),
    );
  }, [activeBoardId, adapterMode, autoLoadNextBatch, batchStrategy, boardSnapshots, commandTemplates, dispatchHistory, dispatchQueue, dispatchStrategy, executionStage, runStatusFilter, selectedTemplateId]);

  function handleGeneratePlan() {
    const idea: OrchestraFeatureIdea = {
      id: `idea-${Date.now()}`,
      title,
      problem,
      goals: goals.split("\n").map((line) => line.trim()).filter(Boolean),
      constraints: constraints.split("\n").map((line) => line.trim()).filter(Boolean),
      notes: [locale === "zh" ? "由开源版 Orchestra 生成。" : "Generated by the open-source Orchestra demo."],
    };

    const nextBoard = buildBoardFromIdea(idea, selectedTemplateId);
    setBoard(nextBoard);
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setPacket(null);
    setRunResult(null);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
    setAdapterMode("simulated-local");
    setExecutionStage("preview");
  }

  function applyScenario(scenario: OrchestraScenario) {
    setSelectedScenarioId(scenario.id);
    setSelectedTemplateId(scenario.template ?? "delivery");
    setTitle(scenario.feature.title);
    setProblem(scenario.feature.problem);
    setGoals(scenario.feature.goals.join("\n"));
    setConstraints(scenario.feature.constraints.join("\n"));

    const nextBoard = buildBoardFromIdea(scenario.feature, scenario.template ?? "delivery");
    setBoard(nextBoard);
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setPacket(null);
    setRunResult(null);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
    setAdapterMode("simulated-local");
    setExecutionStage("preview");
  }

  function resetDemo() {
    const nextBoard = getDefaultOrchestraBoard();
    setBoard(nextBoard);
    setTitle(nextBoard.feature.title);
    setProblem(nextBoard.feature.problem);
    setGoals(nextBoard.feature.goals.join("\n"));
    setConstraints(nextBoard.feature.constraints.join("\n"));
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setPacket(null);
    setRunResult(null);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedScenarioId(orchestraScenarios[0]?.id ?? "");
    setSelectedTemplateId(orchestraScenarios[0]?.template ?? "delivery");
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
    setAdapterMode("simulated-local");
    setExecutionStage("preview");
  }

  function hydrateFromSnapshot(snapshot: OrchestraBoardSnapshot) {
    setActiveBoardId(snapshot.id);
    setBoard(snapshot.board);
    setSelectedTaskId(snapshot.selectedTaskId || snapshot.board.tasks[0]?.id || "");
    setRunHistory(snapshot.runHistory ?? []);
    setBatchSummaries(normalizeBatchSummaries(snapshot.batchSummaries));
    setTimeline(snapshot.timeline ?? []);
    setSelectedCommandTaskIds(snapshot.selectedCommandTaskIds ?? []);
    setSelectedTemplateId(snapshot.template);
    setTitle(snapshot.board.feature.title);
    setProblem(snapshot.board.feature.problem);
    setGoals(snapshot.board.feature.goals.join("\n"));
    setConstraints(snapshot.board.feature.constraints.join("\n"));
    setBoardNameDraft(snapshot.name);
    setPacket(null);
    setRunResult(null);
    setExpandedRunId(null);
    setInspectorTab("task");
  }

  function handleSwitchBoardSnapshot(snapshotId: string) {
    const snapshot = boardSnapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) {
      return;
    }

    hydrateFromSnapshot(snapshot);
  }

  function handleOpenPortfolioTask(snapshotId: string, taskId: string) {
    const snapshot = boardSnapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) {
      return;
    }

    hydrateFromSnapshot({
      ...snapshot,
      selectedTaskId: taskId,
    });
  }

  function handleQueueDispatchItem(item: DispatchQueueItem) {
    setDispatchQueue((current) => (
      current.some((entry) => entry.boardId === item.boardId && entry.taskId === item.taskId)
        ? current
        : [...current, item]
    ));
  }

  function handleQueueSuggestedBatch() {
    setDispatchQueue((current) => {
      const next = [...current];
      portfolioActionPlan.suggestedBatch.forEach((task) => {
        if (!next.some((entry) => entry.boardId === task.boardId && entry.taskId === task.taskId)) {
          next.push({
            boardId: task.boardId,
            boardName: task.boardName,
            taskId: task.taskId,
            title: task.title,
            owner: task.owner,
            priority: task.priority,
          });
        }
      });
      return next;
    });
  }

  function handleRemoveDispatchItem(boardId: string, taskId: string) {
    setDispatchQueue((current) => current.filter((item) => !(item.boardId === boardId && item.taskId === taskId)));
  }

  function handleClearDispatchQueue() {
    setDispatchQueue([]);
  }

  function handleLoadDispatchQueue() {
    if (!nextDispatchTarget) {
      return;
    }

    const snapshot = boardSnapshots.find((candidate) => candidate.id === nextDispatchTarget.boardId);
    if (!snapshot) {
      return;
    }

    const queueItems = nextDispatchTarget.strategy === "priority"
      ? nextDispatchTarget.orderedQueue
        .filter((item) => item.boardId === nextDispatchTarget.boardId)
        .slice(0, 5)
      : nextDispatchTarget.items;

    const taskIds = queueItems
      .map((item) => item.taskId)
      .filter((taskId) => snapshot.board.tasks.some((task) => task.id === taskId));
    const leadTask = snapshot.board.tasks.find((task) => task.id === taskIds[0]);

    hydrateFromSnapshot({
      ...snapshot,
      selectedTaskId: leadTask?.id ?? snapshot.selectedTaskId,
      selectedCommandTaskIds: taskIds,
    });
    if (leadTask) {
      setPacket(buildCommandPacket(snapshot.board.feature, leadTask, leadTask.owner, commandTemplates));
    }
    setInspectorTab("batch");
    setDispatchHistory((current) => [{
      id: `dispatch-${Date.now()}`,
      createdAt: new Date().toISOString(),
      boardId: snapshot.id,
      boardName: snapshot.name,
      strategy: dispatchStrategy,
      taskIds,
    }, ...current].slice(0, 20));
    setDispatchQueue((current) => current.filter((item) => !queueItems.some((queued) => queued.boardId === item.boardId && queued.taskId === item.taskId)));
  }

  function handleCreateBoardSnapshot() {
    const nextBoardId = createWorkspaceBoardId();
    const nextBoard = {
      ...draftBoard,
      feature: {
        ...draftBoard.feature,
        id: `idea-${Date.now()}`,
      },
    };
    const nextSnapshot = createBoardSnapshot({
      id: nextBoardId,
      name: nextBoard.feature.title,
      template: selectedTemplateId,
      board: nextBoard,
      selectedTaskId: nextBoard.tasks[0]?.id ?? "",
      runHistory: [],
      batchSummaries: [],
      timeline: [],
      selectedCommandTaskIds: [],
    });
    setBoardSnapshots((current) => [nextSnapshot, ...current]);
    setActiveBoardId(nextBoardId);
    setBoard(nextBoard);
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setBoardNameDraft(nextSnapshot.name);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedCommandTaskIds([]);
    setPacket(null);
    setRunResult(null);
    setExpandedRunId(null);
    setInspectorTab("task");
  }

  function handleRenameBoard() {
    const nextName = boardNameDraft.trim();
    if (!nextName) {
      return;
    }

    setBoardSnapshots((current) => current.map((snapshot) => (
      snapshot.id === activeBoardId
        ? { ...snapshot, name: nextName, updatedAt: new Date().toISOString() }
        : snapshot
    )));
    setBoardNameDraft(nextName);
  }

  function handleDuplicateBoard(snapshotId: string) {
    const snapshot = boardSnapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) {
      return;
    }

    const duplicate = createBoardSnapshot({
      id: createWorkspaceBoardId(),
      name: locale === "zh" ? `${snapshot.name} 副本` : `${snapshot.name} Copy`,
      template: snapshot.template,
      board: snapshot.board,
      selectedTaskId: snapshot.selectedTaskId,
      runHistory: snapshot.runHistory,
      batchSummaries: normalizeBatchSummaries(snapshot.batchSummaries),
      timeline: snapshot.timeline,
      selectedCommandTaskIds: snapshot.selectedCommandTaskIds,
    });

    setBoardSnapshots((current) => [duplicate, ...current]);
    hydrateFromSnapshot(duplicate);
  }

  function handleDeleteBoard(snapshotId: string) {
    if (boardSnapshots.length <= 1) {
      return;
    }

    const nextSnapshots = boardSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setBoardSnapshots(nextSnapshots);

    if (snapshotId !== activeBoardId) {
      return;
    }

    const fallbackSnapshot = nextSnapshots[0];
    if (fallbackSnapshot) {
      hydrateFromSnapshot(fallbackSnapshot);
    }
  }

  function handleGenerateHandoff(task: OrchestraTask) {
    setSelectedTaskId(task.id);
    setPacket(buildCommandPacket(board.feature, task, task.owner));
    setSelectedCommandTaskIds([task.id]);
    setRunResult(null);
    setInspectorTab("batch");
  }

  function handleGenerateBatchHandoff() {
    if (!commandTasks.length) {
      return;
    }

    setSelectedTaskId(orderedCommandTasks[0]?.id ?? "");
    setPacket(commandPackets[0] ?? null);
    setRunResult(null);
    setInspectorTab("batch");
  }

  function executeCurrentBatch() {
    if (!commandPackets.length) {
      return;
    }

    const executionLog = runBatchWithAdapter({
      adapter: selectedAdapter,
      board,
      tasks: orderedCommandTasks,
      packets: commandPackets,
    });

    if (!executionLog.length) {
      return;
    }

    const records = executionLog.map(({ task, result, status }) => ({
      ...buildRunRecord(task.id, result),
      status,
    }));
    const batchSummary: BatchRunSummary = {
      id: `batch-${Date.now()}`,
      createdAt: new Date().toISOString(),
      strategy: batchStrategy,
      adapterMode,
      total: executionLog.length,
      succeeded: executionLog.filter((item) => item.status === "succeeded").length,
      failed: executionLog.filter((item) => item.status === "failed").length,
      taskIds: executionLog.map((item) => item.task.id),
    };
    const nextTimeline = executionLog.flatMap(({ task, result }, index) => {
      const runId = records[index].id;
      if (records[index].status === "failed") {
        return [
          {
            id: `${runId}-failed`,
            taskId: task.id,
            runId,
            eventType: "failed" as const,
            title: locale === "zh" ? "任务已跳过" : "Task skipped",
            detail: locale === "zh" ? `未执行。原因：${result.stderr}` : `Not executed. Reason: ${result.stderr}`,
            createdAt: records[index].createdAt,
          },
        ];
      }
      return buildTimeline(task.id, runId, locale);
    });

    setRunResult({
      executor: executionLog[executionLog.length - 1]?.result.executor ?? "commander",
      mode: "dry_run",
      command: commandPackets.length > 1 ? buildBatchCommand(commandPackets) : commandPackets[0]?.suggestedCommand ?? "",
      stdout: [
        locale === "zh" ? `批次总任务数：${executionLog.length}` : `Batch tasks: ${executionLog.length}`,
        locale === "zh"
          ? `成功执行：${executionLog.filter((item) => item.status === "succeeded").length}`
          : `Executed: ${executionLog.filter((item) => item.status === "succeeded").length}`,
        locale === "zh"
          ? `已跳过：${executionLog.filter((item) => item.status === "failed").length}`
          : `Skipped: ${executionLog.filter((item) => item.status === "failed").length}`,
      ].join("\n"),
      stderr:
        executionLog
          .filter((item) => item.status === "failed")
          .map((item) => `${item.task.title}: ${item.result.stderr}`)
          .join("\n") || (locale === "zh" ? "无" : "None"),
      durationMs: executionLog.reduce((sum, item) => sum + item.result.durationMs, 0),
    });
    setRunHistory((current) => [...records.reverse(), ...current].slice(0, 20));
    setBatchSummaries((current) => [batchSummary, ...current].slice(0, 10));
    setTimeline((current) => [...nextTimeline.reverse(), ...current].slice(0, 80));
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (
        executionLog.find((item) => item.task.id === task.id)?.shouldAdvance
          ? updateTaskState(task)
          : executionLog.find((item) => item.task.id === task.id)?.status === "failed" && task.state === "ready"
            ? { ...task, state: "blocked" }
            : task
      )),
    }));
  }

  function handleRunPacket() {
    executeCurrentBatch();
  }

  function handleRunAndLoadNext() {
    executeCurrentBatch();
    if (autoLoadNextBatch && nextDispatchTarget) {
      handleLoadDispatchQueue();
    }
  }

  function handleRetryRun(record: OrchestraRunRecord) {
    const task = board.tasks.find((candidate) => candidate.id === record.taskId);
    if (!task) {
      return;
    }

    setSelectedTaskId(task.id);
    setSelectedCommandTaskIds([task.id]);
    setPacket(buildCommandPacket(board.feature, task, task.owner, commandTemplates));
    setRunResult(null);
    setInspectorTab("batch");
  }

  function handleRetryFailedRuns() {
    const failedTaskIds = runHistory.filter((record) => record.status === "failed").map((record) => record.taskId);
    const nextTaskIds = Array.from(new Set(failedTaskIds)).filter((taskId) => board.tasks.some((task) => task.id === taskId));
    if (!nextTaskIds.length) {
      return;
    }

    setSelectedCommandTaskIds(nextTaskIds);
    setSelectedTaskId(nextTaskIds[0] ?? "");
    const leadTask = board.tasks.find((task) => task.id === nextTaskIds[0]);
    if (leadTask) {
      setPacket(buildCommandPacket(board.feature, leadTask, leadTask.owner, commandTemplates));
    }
    setRunResult(null);
    setInspectorTab("batch");
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function handleTaskFieldChange<K extends "state" | "owner" | "priority">(
    field: K,
    value: OrchestraTask[K],
  ) {
    if (!selectedTask) {
      return;
    }

    setBoard((current) => updateTask(current, selectedTask.id, { [field]: value } as Partial<OrchestraTask>));
  }

  function handleTaskContentChange(updates: Partial<Pick<OrchestraTask, "title" | "summary" | "acceptance">>) {
    if (!selectedTask) {
      return;
    }

    setBoard((current) => updateTask(current, selectedTask.id, updates));
  }

  function handleDependencyToggle(dependencyId: string) {
    if (!selectedTask || dependencyId === selectedTask.id) {
      return;
    }

    const nextDependsOn = selectedTask.dependsOn.includes(dependencyId)
      ? selectedTask.dependsOn.filter((id) => id !== dependencyId)
      : [...selectedTask.dependsOn, dependencyId];

    setBoard((current) => updateTask(current, selectedTask.id, { dependsOn: nextDependsOn }));
  }

  function handleApplySuggestedDependencies(taskId: string, dependencyIds: string[]) {
    setBoard((current) => updateTask(current, taskId, { dependsOn: dependencyIds }));
  }

  function handleCreateTask() {
    const title = newTaskTitle.trim();
    const summary = newTaskSummary.trim();

    if (!title || !summary) {
      return;
    }

    const task: OrchestraTask = {
      id: createTaskId(title),
      title,
      summary,
      state: "ready",
      kind: newTaskLane === "planning" ? "spec" : newTaskLane === "governance" ? "review" : "implementation",
      priority: newTaskPriority,
      owner: newTaskOwner,
      dependsOn: suggestedNewTaskDependencies,
      acceptance: [locale === "zh" ? "补充验收标准" : "Add acceptance criteria"],
      lane: newTaskLane,
      comments: [],
    };

    setBoard((current) => ({ ...current, tasks: [...current.tasks, task] }));
    setSelectedTaskId(task.id);
    setPacket(null);
    setRunResult(null);
    setSelectedCommandTaskIds((current) => [...new Set([...current, task.id])]);
    setNewTaskTitle("");
    setNewTaskSummary("");
    setNewTaskLane("execution");
    setNewTaskOwner("codex");
    setNewTaskPriority("medium");
    setInspectorTab("task");
  }

  function handleDeleteTask() {
    if (!selectedTask) {
      return;
    }

    const nextSelectedId = board.tasks.find((task) => task.id !== selectedTask.id)?.id ?? "";

    setBoard((current) => ({
      ...current,
      tasks: current.tasks
        .filter((task) => task.id !== selectedTask.id)
        .map((task) => ({
          ...task,
          dependsOn: task.dependsOn.filter((id) => id !== selectedTask.id),
        })),
    }));
    setTimeline((current) => current.filter((event) => event.taskId !== selectedTask.id));
    setRunHistory((current) => current.filter((run) => run.taskId !== selectedTask.id));
    setSelectedTaskId(nextSelectedId);
    setSelectedCommandTaskIds((current) => current.filter((id) => id !== selectedTask.id));
    setPacket(null);
    setRunResult(null);
    setExpandedRunId(null);
  }

  function handleOpenTask(taskId: string) {
    setSelectedTaskId(taskId);
    setInspectorTab("task");
  }

  function handleTaskSelection(taskId: string, checked: boolean) {
    setSelectedCommandTaskIds((current) => (
      checked ? [...new Set([...current, taskId])] : current.filter((id) => id !== taskId)
    ));
  }

  function handleSelectRunnableTasks() {
    setSelectedCommandTaskIds(runnableVisibleTaskIds);
    setInspectorTab("batch");
  }

  function handleClearTaskSelection() {
    setSelectedCommandTaskIds([]);
    setPacket(null);
    setRunResult(null);
  }

  function handleSelectLaneTasks(lane: OrchestraTask["lane"]) {
    const laneTaskIds = visibleTasks.filter((task) => task.lane === lane).map((task) => task.id);
    setSelectedCommandTaskIds(laneTaskIds);
    if (laneTaskIds.length) {
      setInspectorTab("batch");
    }
  }

  function handleAddComment() {
    if (!selectedTask) {
      return;
    }

    const body = newCommentBody.trim();
    if (!body) {
      return;
    }

    const comment: OrchestraTaskComment = {
      id: `comment-${Date.now()}`,
      author: newCommentAuthor,
      body,
      createdAt: new Date().toISOString(),
    };

    setBoard((current) => updateTask(current, selectedTask.id, {
      comments: [...selectedTask.comments, comment],
    }));
    setTimeline((current) => [buildCommentTimeline(selectedTask.id, comment, locale), ...current].slice(0, 80));
    setNewCommentBody("");
  }

  function handleTaskDrop(targetLane: OrchestraTask["lane"], targetIndex?: number) {
    if (!draggedTaskId) {
      return;
    }

    setBoard((current) => moveTask(current, draggedTaskId, targetLane, targetIndex));
    setDraggedTaskId(null);
    setDragOverLane(null);
    setDragOverIndex(null);
  }

  function handleMoveSelectedTask(direction: "up" | "down" | "left" | "right") {
    if (!selectedTask) {
      return;
    }

    if (direction === "left" || direction === "right") {
      const currentLaneIndex = laneOrder.indexOf(selectedTask.lane);
      const nextLaneIndex = direction === "left" ? currentLaneIndex - 1 : currentLaneIndex + 1;
      const nextLane = laneOrder[nextLaneIndex];
      if (!nextLane) {
        return;
      }
      setBoard((current) => moveTask(current, selectedTask.id, nextLane));
      return;
    }

    const laneTasks = board.tasks.filter((task) => task.lane === selectedTask.lane);
    const currentIndex = laneTasks.findIndex((task) => task.id === selectedTask.id);
    if (currentIndex === -1) {
      return;
    }
    const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= laneTasks.length) {
      return;
    }
    setBoard((current) => moveTask(current, selectedTask.id, selectedTask.lane, nextIndex));
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 pb-10">
      <section className="grid gap-3">
        <Card className="border-slate-200/80 bg-[linear-gradient(135deg,_#ffffff_0%,_#f8fbff_58%,_#f8fafc_100%)] shadow-[0_14px_30px_-26px_rgba(15,23,42,0.2)]">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white shadow-sm">
                  {locale === "zh" ? "Orchestra 工作台" : "Orchestra Workspace"}
                </Badge>
                <span className="text-sm text-slate-500">
                  {locale === "zh" ? "定义目标，筛选任务，直接执行。" : "Define the goal, filter the work, and execute."}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                  {(["zh", "en"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setLocale(value)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs transition-colors",
                        locale === value ? "bg-slate-950 text-white" : "text-slate-600",
                      )}
                    >
                      {localeLabel[value]}
                    </button>
                  ))}
                </div>
                <Button onClick={handleGeneratePlan} className="rounded-full bg-slate-950 px-4 text-white shadow-sm hover:bg-slate-800">
                  <Sparkles className="h-4 w-4" />
                  {locale === "zh" ? "生成计划" : "Generate Plan"}
                </Button>
                <Button variant="outline" className="rounded-full border-slate-200 bg-white shadow-sm" onClick={() => applyScenario(selectedScenario)}>
                  {locale === "zh" ? "载入示例" : "Load Scenario"}
                </Button>
                <Button variant="ghost" className="rounded-full text-slate-600" onClick={resetDemo}>
                  {locale === "zh" ? "重置" : "Reset"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_auto]">
              <div className="rounded-[20px] border border-slate-200 bg-white/88 px-4 py-3 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "Feature" : "Feature"}
                </div>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 h-9 border-0 bg-transparent px-0 text-base font-semibold text-slate-950 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="rounded-[20px] border border-slate-200 bg-white/88 px-4 py-3 shadow-sm">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "问题 / Brief" : "Problem / Brief"}
                </div>
                <Textarea
                  value={problem}
                  onChange={(event) => setProblem(event.target.value)}
                  className="mt-1 min-h-[72px] resize-none border-0 bg-transparent px-0 py-0 text-sm leading-6 text-slate-700 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="grid min-w-[250px] grid-cols-3 gap-2 xl:grid-cols-3">
                <MetricCard icon={Clipboard} label={locale === "zh" ? "可见" : "Visible"} value={`${visibleTasks.length}/${board.tasks.length}`} compact />
                <MetricCard icon={Cpu} label={locale === "zh" ? "进行中" : "In Flight"} value={String(board.tasks.filter((task) => task.state === "in_progress" || task.state === "review").length)} compact />
                <MetricCard icon={CheckCircle2} label={locale === "zh" ? "完成" : "Done"} value={String(board.tasks.filter((task) => task.state === "done").length)} compact />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {locale === "zh" ? "任务模板" : "Template"}
              </span>
              <div className="flex flex-wrap gap-2">
                {orchestraTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      selectedTemplateId === template.id
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-600",
                    )}
                    title={template.description}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "Boards" : "Boards"}
                </span>
                {sortedBoardSnapshots.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => handleSwitchBoardSnapshot(snapshot.id)}
                    className={cn(
                      "max-w-[220px] truncate rounded-full border px-3 py-1.5 text-sm transition-colors",
                      snapshot.id === activeBoardId
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900",
                    )}
                    title={snapshot.name}
                  >
                    {snapshot.name}
                  </button>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-slate-200 bg-white shadow-sm"
                onClick={handleCreateBoardSnapshot}
              >
                <Plus className="h-4 w-4" />
                {locale === "zh" ? "另存为新 Board" : "Save As New Board"}
              </Button>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {locale === "zh" ? "Portfolio 总览" : "Portfolio Overview"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {locale === "zh"
                        ? "跨 board 看当前组合的交付压力。"
                        : "Track delivery pressure across active boards."}
                    </div>
                  </div>
                  <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                    {locale === "zh" ? `${portfolioOverview.boardCount} 个 feature` : `${portfolioOverview.boardCount} features`}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-4">
                  <MetricCard icon={Clipboard} label={locale === "zh" ? "总任务" : "Tasks"} value={String(portfolioOverview.tasks)} compact />
                  <MetricCard icon={Sparkles} label={locale === "zh" ? "Ready" : "Ready"} value={String(portfolioOverview.ready)} compact />
                  <MetricCard icon={Cpu} label={locale === "zh" ? "进行中" : "In Flight"} value={String(portfolioOverview.inFlight)} compact />
                  <MetricCard icon={CheckCircle2} label={locale === "zh" ? "阻塞" : "Blocked"} value={String(portfolioOverview.blocked)} compact />
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "最近活跃" : "Recently Active"}
                </div>
                <div className="mt-3 space-y-2">
                  {portfolioOverview.recentlyActiveBoards.map((snapshot) => (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => handleSwitchBoardSnapshot(snapshot.id)}
                      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/90 px-3 py-2 text-left transition-colors hover:border-slate-300"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{snapshot.name}</div>
                        <div className="text-xs text-slate-500">
                          {snapshot.updatedAt.slice(0, 10)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">
                          {locale === "zh" ? `就绪 ${snapshot.ready}` : `Ready ${snapshot.ready}`}
                        </Badge>
                        <Badge variant="outline" className="rounded-full border-rose-200 text-rose-700">
                          {locale === "zh" ? `阻塞 ${snapshot.blocked}` : `Blocked ${snapshot.blocked}`}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "需要关注的 Feature" : "Boards Needing Attention"}
                </div>
                <span className="text-xs text-slate-500">
                  {locale === "zh" ? "按阻塞和高优先级未完成排序" : "Ranked by blocked and critical open work"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {portfolioOverview.riskyBoards.map((snapshot) => (
                  <button
                    key={snapshot.id}
                    type="button"
                    onClick={() => handleSwitchBoardSnapshot(snapshot.id)}
                    className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 text-left transition-colors hover:border-slate-300"
                  >
                    <div className="truncate text-sm font-semibold text-slate-950">{snapshot.name}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <Badge variant="outline" className="rounded-full border-rose-200 text-rose-700">
                        {locale === "zh" ? `阻塞 ${snapshot.blocked}` : `Blocked ${snapshot.blocked}`}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-amber-200 text-amber-700">
                        {locale === "zh" ? `关键 ${snapshot.criticalOpen}` : `Critical ${snapshot.criticalOpen}`}
                      </Badge>
                      <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                        {locale === "zh" ? `完成 ${snapshot.completionRate}%` : `${snapshot.completionRate}% done`}
                      </Badge>
                    </div>
                    <div className="mt-3 text-xs text-slate-500">
                      {locale === "zh"
                        ? `还有 ${snapshot.ready} 个 ready 任务可以推进。`
                        : `${snapshot.ready} ready tasks can move immediately.`}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 xl:grid-cols-3">
              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "建议先推进" : "Recommended Next Boards"}
                </div>
                <div className="mt-3 space-y-2">
                  {portfolioActionPlan.nextBoards.map((snapshot) => (
                    <button
                      key={snapshot.id}
                      type="button"
                      onClick={() => handleSwitchBoardSnapshot(snapshot.id)}
                      className="w-full rounded-2xl border border-slate-200 bg-white/90 px-3 py-3 text-left transition-colors hover:border-slate-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="truncate text-sm font-semibold text-slate-950">{snapshot.name}</div>
                        <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                          {snapshot.score}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs">
                        <Badge variant="outline" className="rounded-full border-emerald-200 text-emerald-700">
                          {locale === "zh" ? `Ready ${snapshot.runnable}` : `Ready ${snapshot.runnable}`}
                        </Badge>
                        <Badge variant="outline" className="rounded-full border-rose-200 text-rose-700">
                          {locale === "zh" ? `阻塞 ${snapshot.blocked}` : `Blocked ${snapshot.blocked}`}
                        </Badge>
                        <Badge variant="outline" className="rounded-full border-amber-200 text-amber-700">
                          {locale === "zh" ? `关键 ${snapshot.criticalOpen}` : `Critical ${snapshot.criticalOpen}`}
                        </Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "执行者负载" : "Executor Load"}
                </div>
                <div className="mt-3 space-y-2">
                  {portfolioActionPlan.executorLoad.map((entry) => (
                    <div
                      key={entry.executor}
                      className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge className={cn("rounded-full", ownerTone[entry.executor])}>
                          {entry.executor}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {locale === "zh" ? `${entry.active} 个活跃任务` : `${entry.active} active tasks`}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {entry.blocked > 0
                          ? (locale === "zh" ? `${entry.blocked} 个阻塞任务需要卸载或协助。` : `${entry.blocked} blocked tasks need relief or support.`)
                          : (locale === "zh" ? "当前没有阻塞任务，负载可控。" : "No blocked tasks right now; load is manageable.")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  {locale === "zh" ? "推荐下一批执行" : "Suggested Cross-Board Batch"}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    {locale === "zh" ? `已排队 ${dispatchQueue.length} 个任务` : `${dispatchQueue.length} queued`}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={handleQueueSuggestedBatch}
                    disabled={!portfolioActionPlan.suggestedBatch.length}
                  >
                    {locale === "zh" ? "整批加入队列" : "Queue All"}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {portfolioActionPlan.suggestedBatch.map((task) => (
                    <div
                      key={`${task.boardId}-${task.taskId}`}
                      className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenPortfolioTask(task.boardId, task.taskId)}
                        className="w-full text-left"
                      >
                        <div className="truncate text-sm font-semibold text-slate-950">{task.title}</div>
                      </button>
                      <div className="mt-1 text-xs text-slate-500">{task.boardName}</div>
                      <div className="mt-2 flex flex-wrap gap-1 text-xs">
                        <Badge className={cn("rounded-full", ownerTone[task.owner])}>{task.owner}</Badge>
                        <Badge variant="outline" className={cn("rounded-full", priorityTone[task.priority])}>
                          {locale === "zh" ? `优先级 ${priorityLabel[locale][task.priority]}` : `Priority ${priorityLabel[locale][task.priority]}`}
                        </Badge>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleOpenPortfolioTask(task.boardId, task.taskId)}
                        >
                          {locale === "zh" ? "查看任务" : "Open Task"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                          onClick={() => handleQueueDispatchItem({
                            boardId: task.boardId,
                            boardName: task.boardName,
                            taskId: task.taskId,
                            title: task.title,
                            owner: task.owner,
                            priority: task.priority,
                          })}
                        >
                          {locale === "zh" ? "加入调度队列" : "Queue Dispatch"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {locale === "zh" ? "Dispatch Queue" : "Dispatch Queue"}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {nextDispatchTarget
                      ? (locale === "zh"
                        ? `下一步会装载 ${nextDispatchTarget.boardName} 的 ${nextDispatchTarget.items.length} 个任务到执行区。`
                        : `Next load will send ${nextDispatchTarget.items.length} tasks from ${nextDispatchTarget.boardName} into the batch console.`)
                      : (locale === "zh"
                        ? "先从上面的推荐批次中把任务加入队列。"
                        : "Queue tasks from the suggested batch above first.")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={dispatchStrategy}
                    onChange={(event) => setDispatchStrategy(event.target.value as DispatchQueueStrategy)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    <option value="board">{locale === "zh" ? "按 board 装载" : "Load by board"}</option>
                    <option value="owner">{locale === "zh" ? "按执行者装载" : "Load by executor"}</option>
                    <option value="priority">{locale === "zh" ? "按优先级装载" : "Load by priority"}</option>
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={handleClearDispatchQueue}
                    disabled={!dispatchQueue.length}
                  >
                    {locale === "zh" ? "清空队列" : "Clear Queue"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    onClick={handleLoadDispatchQueue}
                    disabled={!nextDispatchTarget}
                  >
                    {locale === "zh" ? "装载到执行区" : "Load Into Batch"}
                  </Button>
                </div>
              </div>
              {nextDispatchTarget ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600">
                  {nextDispatchTarget.strategy === "owner"
                    ? (locale === "zh"
                      ? `下一批将按执行者 ${nextDispatchTarget.owner} 装载 ${nextDispatchTarget.items.length} 个任务。`
                      : `Next load will group ${nextDispatchTarget.items.length} tasks for ${nextDispatchTarget.owner}.`)
                    : nextDispatchTarget.strategy === "priority"
                      ? (locale === "zh"
                        ? `下一批将从 ${nextDispatchTarget.boardName} 装载最高优先级任务。`
                        : `Next load will take the highest-priority tasks from ${nextDispatchTarget.boardName}.`)
                      : (locale === "zh"
                        ? `下一批将装载 ${nextDispatchTarget.boardName} 的 ${nextDispatchTarget.items.length} 个任务。`
                        : `Next load will take ${nextDispatchTarget.items.length} tasks from ${nextDispatchTarget.boardName}.`)}
                </div>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {dispatchQueue.map((item) => (
                  <div
                    key={`${item.boardId}-${item.taskId}`}
                    className="rounded-2xl border border-slate-200 bg-white/90 px-3 py-3"
                  >
                    <div className="truncate text-sm font-semibold text-slate-950">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.boardName}</div>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs">
                      <Badge className={cn("rounded-full", ownerTone[item.owner])}>{item.owner}</Badge>
                      <Badge variant="outline" className={cn("rounded-full", priorityTone[item.priority])}>
                        {priorityLabel[locale][item.priority]}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full"
                        onClick={() => handleOpenPortfolioTask(item.boardId, item.taskId)}
                      >
                        {locale === "zh" ? "查看" : "Open"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-full text-slate-500"
                        onClick={() => handleRemoveDispatchItem(item.boardId, item.taskId)}
                      >
                        {locale === "zh" ? "移除" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {!dispatchQueue.length ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-sm text-slate-500">
                  {locale === "zh" ? "队列为空。先把跨 board 的 ready 任务排进来，再统一装载执行。" : "The queue is empty. Queue ready tasks across boards, then load them into the batch console."}
                </div>
              ) : null}
            </div>

            <div className="rounded-[20px] border border-slate-200/80 bg-slate-50/80 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-200 bg-white px-3">
                  <Search className="h-4 w-4 text-slate-400" />
                  <Input
                    value={boardSearchQuery}
                    onChange={(event) => setBoardSearchQuery(event.target.value)}
                    placeholder={locale === "zh" ? "搜索 board 名称或 brief" : "Search boards or briefs"}
                    className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={boardNameDraft}
                    onChange={(event) => setBoardNameDraft(event.target.value)}
                    className="h-9 w-full min-w-[220px] rounded-full border-slate-200 bg-white lg:w-[260px]"
                    placeholder={locale === "zh" ? "当前 board 名称" : "Current board name"}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={handleRenameBoard}
                  >
                    {locale === "zh" ? "重命名" : "Rename"}
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {visibleBoardSnapshots.map((snapshot) => (
                  <div
                    key={snapshot.id}
                    className={cn(
                      "rounded-2xl border px-3 py-3 transition-colors",
                      snapshot.id === activeBoardId
                        ? "border-slate-950 bg-white shadow-sm"
                        : "border-slate-200 bg-white/80",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleSwitchBoardSnapshot(snapshot.id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">
                            {snapshot.name}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {snapshot.board.feature.problem}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 rounded-full",
                            snapshot.id === activeBoardId
                              ? "border-slate-950 text-slate-950"
                              : "border-slate-300 text-slate-500",
                          )}
                        >
                          {snapshot.board.tasks.length}
                        </Badge>
                      </div>
                    </button>
                    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {locale === "zh" ? "更新于" : "Updated"} {snapshot.updatedAt.slice(0, 10)}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-slate-500"
                          onClick={() => handleDuplicateBoard(snapshot.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-full text-slate-500"
                          onClick={() => handleDeleteBoard(snapshot.id)}
                          disabled={boardSnapshots.length <= 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!visibleBoardSnapshots.length ? (
                <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-sm text-slate-500">
                  {locale === "zh" ? "没有匹配的 board，试试清空搜索或另存一个新的。" : "No matching boards. Clear the search or save a new board."}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Flag className="h-3.5 w-3.5 text-emerald-600" />
              {(locale === "zh"
                ? [
                    "1. 定义目标",
                    "2. 生成任务图",
                    "3. 选任务并编辑",
                    "4. 批量执行",
                  ]
                : [
                    "1. Define goal",
                    "2. Generate graph",
                    "3. Select and edit",
                    "4. Run batch",
                  ]).map((step) => (
                <span key={step} className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1">
                  {step}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-3">
        <div className="rounded-[24px] border border-slate-200 bg-white/88 px-4 py-3 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.14)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {locale === "zh" ? "当前焦点" : "Current Focus"}
              </span>
              <Badge className="rounded-full bg-slate-950 text-white">
                {selectedTask ? translateTask(selectedTask, locale).title : (locale === "zh" ? "未选择任务" : "No task selected")}
              </Badge>
              <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                {locale === "zh" ? `批次 ${commandTasks.length}` : `Batch ${commandTasks.length}`}
              </Badge>
              <Badge
                className={cn(
                  "rounded-full border",
                  runnableTaskCount > 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700",
                )}
              >
                {runnableTaskCount > 0
                  ? (locale === "zh" ? `可运行 ${runnableTaskCount}` : `Runnable ${runnableTaskCount}`)
                  : (locale === "zh" ? "待准备" : "Pending")}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setInspectorTab("task")}
              >
                {locale === "zh" ? "查看当前任务" : "Open Task"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-slate-200 bg-white"
                onClick={() => {
                  setInspectorTab("batch");
                  if (!packet && selectedTask) {
                    handleGenerateHandoff(selectedTask);
                  }
                }}
              >
                {locale === "zh" ? "打开执行区" : "Open Batch"}
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                onClick={() => {
                  setInspectorTab("batch");
                  if (!packet && selectedTask) {
                    handleGenerateHandoff(selectedTask);
                    return;
                  }
                  if (commandPackets.length) {
                    handleRunPacket();
                  }
                }}
                disabled={!selectedTask}
              >
                {locale === "zh" ? "立即执行" : "Run Now"}
              </Button>
            </div>
          </div>
        </div>
      </section>

      <details className="group rounded-[28px] border border-slate-200 bg-slate-50/70 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.14)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-medium text-slate-900">
          <span>{locale === "zh" ? "工作台设置与低频信息" : "Workspace Setup and Secondary Panels"}</span>
          <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
          <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
        </summary>
        <div className="grid gap-6 border-t border-slate-200 px-5 py-5 xl:grid-cols-2">
          <Card className="border-slate-200/80 shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Flag className="h-5 w-5 text-emerald-600" />
                {locale === "zh" ? "示例场景" : "Sample Scenarios"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {orchestraScenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={cn(
                    "rounded-2xl border p-4 transition-all",
                    selectedScenario?.id === scenario.id
                      ? "border-slate-300 bg-slate-50 ring-2 ring-slate-950/5"
                      : "border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{scenario.title}</div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{scenario.summary}</p>
                    </div>
                    <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white shadow-sm" onClick={() => applyScenario(scenario)}>
                      {locale === "zh" ? "载入" : "Load"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-slate-200/80 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <Lightbulb className="h-5 w-5 text-amber-500" />
                  {locale === "zh" ? "规划输入" : "Planning Inputs"}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "目标" : "Goals"}</span>
                  <Textarea value={goals} onChange={(event) => setGoals(event.target.value)} className="min-h-28" />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "约束" : "Constraints"}</span>
                  <Textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} className="min-h-28" />
                </label>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 shadow-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950">
                  <Bot className="h-5 w-5 text-violet-500" />
                  {locale === "zh" ? "指挥协议" : "Command Protocol"}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {protocolRows[locale].map((row) => (
                  <div key={row.route} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="text-sm font-medium text-slate-900">{row.route}</div>
                    <p className="mt-2 text-sm text-slate-600">{row.when}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{row.why}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </details>

      <section className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200/80 bg-white/92 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.18)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <GitPullRequestArrow className="h-5 w-5 text-sky-600" />
              {locale === "zh" ? "任务图看板" : "Task Graph Board"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[26px] border border-slate-200 bg-slate-50/65 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-slate-900">{locale === "zh" ? "任务筛选" : "Task Filters"}</div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setSearchQuery("");
                    setQuickFilter("all");
                    setLaneFilter("all");
                    setStateFilter("all");
                    setOwnerFilter("all");
                    setPriorityFilter("all");
                  }}
                >
                  {locale === "zh" ? "清空筛选" : "Clear Filters"}
                </Button>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.45fr)_repeat(4,minmax(0,0.8fr))]">
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder={locale === "zh" ? "搜索标题、摘要、评论、验收标准" : "Search title, summary, comments, acceptance"}
                    aria-label={locale === "zh" ? "搜索任务" : "Search tasks"}
                    className="w-full bg-transparent text-sm text-slate-700 outline-none"
                  />
                </div>
                <select
                  value={stateFilter}
                  onChange={(event) => setStateFilter(event.target.value as OrchestraTaskState | "all")}
                  aria-label={locale === "zh" ? "按状态筛选" : "Filter by state"}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                >
                  <option value="all">{locale === "zh" ? "状态：全部" : "State: All"}</option>
                  {(Object.keys(statusLabel.en) as OrchestraTaskState[]).map((state) => (
                    <option key={state} value={state}>
                      {statusLabel[locale][state]}
                    </option>
                  ))}
                </select>
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value as OrchestraExecutor | "all")}
                  aria-label={locale === "zh" ? "按归属筛选" : "Filter by owner"}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                >
                  <option value="all">{locale === "zh" ? "归属：全部" : "Owner: All"}</option>
                  {(["planner", "commander", "codex", "claude_code", "portfolio", "human"] as OrchestraExecutor[]).map((owner) => (
                    <option key={owner} value={owner}>
                      {ownerLabel(owner, locale)}
                    </option>
                  ))}
                </select>
                <select
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value as OrchestraTaskPriority | "all")}
                  aria-label={locale === "zh" ? "按优先级筛选" : "Filter by priority"}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                >
                  <option value="all">{locale === "zh" ? "优先级：全部" : "Priority: All"}</option>
                  {(["low", "medium", "high", "critical"] as OrchestraTaskPriority[]).map((priority) => (
                    <option key={priority} value={priority}>
                      {priorityLabel[locale][priority]}
                    </option>
                  ))}
                </select>
                <select
                  value={laneFilter}
                  onChange={(event) => setLaneFilter(event.target.value as OrchestraTask["lane"] | "all")}
                  aria-label={locale === "zh" ? "按泳道筛选" : "Filter by lane"}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                >
                  <option value="all">{locale === "zh" ? "泳道：全部" : "Lane: All"}</option>
                  {laneOrder.map((lane) => (
                    <option key={lane} value={lane}>
                      {laneLabels[locale][lane]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2">
                  {(["all", "ready", "blocked", "critical"] as QuickFilter[]).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setQuickFilter(filter)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs transition-colors",
                        quickFilter === filter
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-600",
                      )}
                    >
                      {quickFilterLabel[locale][filter]}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={handleSelectRunnableTasks}
                    disabled={!runnableVisibleTaskIds.length}
                  >
                    {locale === "zh" ? "选择可执行任务" : "Select Runnable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full"
                    onClick={handleClearTaskSelection}
                    disabled={!selectedCommandTaskIds.length}
                  >
                    {locale === "zh" ? "清空勾选" : "Clear Selection"}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
            {laneMap.map(({ lane, tasks, readyCount, blockedCount }) => (
              <div
                key={lane}
                className={cn(
                  "rounded-[26px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-all",
                  laneTone[lane],
                  dragOverLane === lane && "border-sky-300 bg-[linear-gradient(180deg,_rgba(240,249,255,0.95)_0%,_rgba(239,246,255,0.98)_100%)] ring-2 ring-sky-100",
                )}
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-medium text-slate-900">{laneLabels[locale][lane]}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{laneDescriptions[locale][lane]}</p>
                    </div>
                    <Badge variant="outline" className="rounded-full border-slate-300 bg-white/90 text-slate-700">
                      {tasks.length} {locale === "zh" ? "项" : "items"}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-600 shadow-sm">
                      {locale === "zh" ? `可执行 ${readyCount}` : `Ready ${readyCount}`}
                    </div>
                    <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-600 shadow-sm">
                      {locale === "zh" ? `阻塞 ${blockedCount}` : `Blocked ${blockedCount}`}
                    </div>
                    <div className="rounded-full bg-white/90 px-2.5 py-1 text-xs text-slate-600 shadow-sm">
                      {locale === "zh" ? `总计 ${tasks.length}` : `Total ${tasks.length}`}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 rounded-full bg-white/90 px-3 text-xs text-slate-600 hover:bg-white"
                      onClick={() => handleSelectLaneTasks(lane)}
                      disabled={!tasks.length}
                    >
                      {locale === "zh" ? "选中本列" : "Select Lane"}
                    </Button>
                  </div>
                </div>
                <div
                  className="space-y-3 rounded-[22px] border border-white/70 bg-white/45 p-2.5"
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverLane(lane);
                    setDragOverIndex(tasks.length);
                  }}
                  onDragLeave={() => {
                    setDragOverLane((current) => (current === lane ? null : current));
                    setDragOverIndex((current) => (dragOverLane === lane ? null : current));
                  }}
                  onDrop={() => handleTaskDrop(lane, tasks.length)}
                >
                  {tasks.map((task, index) => {
                    const translatedTask = translateTask(task, locale);
                    return (
                      <div key={task.id} className="space-y-2">
                        {dragOverLane === lane && dragOverIndex === index ? (
                          <div className="h-1.5 rounded-full bg-sky-500/70 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]" />
                        ) : null}
                        <div
                          draggable
                          onDragStart={() => setDraggedTaskId(task.id)}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverLane(null);
                            setDragOverIndex(null);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverLane(lane);
                            setDragOverIndex(index);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            handleTaskDrop(lane, index);
                          }}
                          className={cn(
                            "rounded-2xl border border-slate-200 bg-white/94 p-3.5 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.18)] transition-all",
                            selectedTaskId === task.id && "border-slate-300 ring-2 ring-slate-950/10",
                            draggedTaskId === task.id && "scale-[0.985] opacity-60",
                            dragOverLane === lane && dragOverIndex === index && "border-sky-300",
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start gap-2.5">
                                <button
                                  type="button"
                                  className="mt-0.5 text-slate-300 transition-colors hover:text-slate-500"
                                  aria-label={locale === "zh" ? "拖拽任务" : "Drag task"}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <label className="mt-0.5">
                                  <input
                                    type="checkbox"
                                    checked={selectedCommandTaskIds.includes(task.id)}
                                    onChange={(event) => handleTaskSelection(task.id, event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                </label>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="truncate text-[15px] font-semibold text-slate-900">{translatedTask.title}</div>
                                    <Badge className={cn("rounded-full border", stateTone[task.state])}>{statusLabel[locale][task.state]}</Badge>
                                  </div>
                                  <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{translatedTask.summary}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge className={cn("rounded-full", ownerTone[task.owner])}>{ownerLabel(task.owner, locale)}</Badge>
                            <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                              {kindLabel(task.kind, locale)}
                            </Badge>
                            <Badge className={cn("rounded-full border", priorityTone[task.priority])}>
                              {priorityLabel[locale][task.priority]}
                            </Badge>
                            {task.dependsOn.length > 0 ? (
                              <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                                {locale === "zh" ? `依赖 ${task.dependsOn.length}` : `${task.dependsOn.length} deps`}
                              </Badge>
                            ) : null}
                          </div>
                          {translatedTask.acceptance.length > 0 ? (
                            <div className="mt-3 rounded-xl bg-slate-50/80 px-3 py-2">
                              <div className="space-y-1">
                                {translatedTask.acceptance.slice(0, 2).map((criterion) => (
                                  <div key={criterion} className="text-xs leading-5 text-slate-500">{criterion}</div>
                                ))}
                                {translatedTask.acceptance.length > 2 ? (
                                  <div className="text-xs leading-5 text-slate-400">
                                    {locale === "zh"
                                      ? `还有 ${translatedTask.acceptance.length - 2} 条验收标准`
                                      : `${translatedTask.acceptance.length - 2} more acceptance checks`}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <div className="text-xs text-slate-500">
                              {locale === "zh" ? "交接目标：" : "Target: "} {ownerLabel(task.owner, locale)}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button size="sm" className="h-8 rounded-full bg-slate-950 px-3 text-white hover:bg-slate-800" onClick={() => handleGenerateHandoff(task)}>
                                {locale === "zh" ? "交接" : "Handoff"}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-slate-600 hover:bg-slate-50" onClick={() => handleOpenTask(task.id)}>
                                {locale === "zh" ? "查看" : "Inspect"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {dragOverLane === lane && dragOverIndex === tasks.length ? (
                    <div className="h-1.5 rounded-full bg-sky-500/70 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]" />
                  ) : null}
                </div>
              </div>
            ))}
            </div>
            {!visibleTasks.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                <div className="font-medium text-slate-900">
                  {locale === "zh"
                    ? "当前筛选条件下没有任务。"
                    : "No tasks match the current filters."}
                </div>
                <div className="mt-2">
                  {locale === "zh"
                    ? "你可以先清空筛选，或者去右侧新增任务。"
                    : "Clear the filters or create a new task from the inspector."}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={() => {
                      setSearchQuery("");
                      setQuickFilter("all");
                      setLaneFilter("all");
                      setStateFilter("all");
                      setOwnerFilter("all");
                      setPriorityFilter("all");
                    }}
                  >
                    {locale === "zh" ? "清空筛选" : "Clear Filters"}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                    onClick={() => setInspectorTab("task")}
                  >
                    {locale === "zh" ? "打开新增任务" : "Open Composer"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid content-start gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-2 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.14)]">
            <div className="grid grid-cols-4 gap-2">
              {([
                ["task", locale === "zh" ? "任务" : "Task"],
                ["batch", locale === "zh" ? "执行" : "Batch"],
                ["deps", locale === "zh" ? "依赖" : "Deps"],
                ["runs", locale === "zh" ? "记录" : "Runs"],
              ] as const).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setInspectorTab(tab)}
                  className={cn(
                    "rounded-full px-3 py-2 text-sm transition-colors",
                    inspectorTab === tab ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-600",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {inspectorTab === "task" ? <Card className="border-slate-200/80 bg-white/92 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.18)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Clipboard className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "任务详情" : "Task Detail"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedTask ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{translateTask(selectedTask, locale).title}</div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{translateTask(selectedTask, locale).summary}</p>
                      </div>
                      <Badge className={cn("rounded-full border", stateTone[selectedTask.state])}>{statusLabel[locale][selectedTask.state]}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge className={cn("rounded-full", ownerTone[selectedTask.owner])}>{ownerLabel(selectedTask.owner, locale)}</Badge>
                      <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">{kindLabel(selectedTask.kind, locale)}</Badge>
                      <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">{laneLabels[locale][selectedTask.lane]}</Badge>
                      <Badge className={cn("rounded-full border", priorityTone[selectedTask.priority])}>
                        {locale === "zh" ? "优先级" : "Priority"}: {priorityLabel[locale][selectedTask.priority]}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" className="rounded-full bg-slate-950 text-white hover:bg-slate-800" onClick={() => handleGenerateHandoff(selectedTask)}>
                        {locale === "zh" ? "立即交接" : "Handoff Now"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-slate-200 bg-white"
                        onClick={() => {
                          handleGenerateHandoff(selectedTask);
                          setInspectorTab("batch");
                        }}
                      >
                        {locale === "zh" ? "打开执行区" : "Open Batch"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-slate-700">{locale === "zh" ? "任务状态" : "Task State"}</span>
                      <select
                        value={selectedTask.state}
                        onChange={(event) => handleTaskFieldChange("state", event.target.value as OrchestraTaskState)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                      >
                        {(Object.keys(statusLabel.en) as OrchestraTaskState[]).map((state) => (
                          <option key={state} value={state}>
                            {statusLabel[locale][state]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-slate-700">{locale === "zh" ? "执行归属" : "Owner"}</span>
                      <select
                        value={selectedTask.owner}
                        onChange={(event) => handleTaskFieldChange("owner", event.target.value as OrchestraExecutor)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                      >
                        {(["planner", "commander", "codex", "claude_code", "portfolio", "human"] as OrchestraExecutor[]).map((owner) => (
                          <option key={owner} value={owner}>
                            {ownerLabel(owner, locale)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm">
                      <span className="font-medium text-slate-700">{locale === "zh" ? "任务优先级" : "Priority"}</span>
                      <select
                        value={selectedTask.priority}
                        onChange={(event) => handleTaskFieldChange("priority", event.target.value as OrchestraTaskPriority)}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                      >
                        {(["low", "medium", "high", "critical"] as OrchestraTaskPriority[]).map((priority) => (
                          <option key={priority} value={priority}>
                            {priorityLabel[locale][priority]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{locale === "zh" ? "依赖" : "Dependencies"}</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedTask.dependsOn.length ? selectedTask.dependsOn.map((dep) => {
                          const dependency = board.tasks.find((task) => task.id === dep);
                          return dependency ? (
                            <button
                              key={dep}
                              type="button"
                              onClick={() => handleOpenTask(dep)}
                              className="block text-left transition-colors hover:text-sky-700"
                            >
                              {translateTask(dependency, locale).title}
                            </button>
                          ) : <div key={dep}>{dep}</div>;
                        }) : <div>{locale === "zh" ? "无依赖" : "No dependencies"}</div>}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{locale === "zh" ? "验收标准" : "Acceptance"}</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {translateTask(selectedTask, locale).acceptance.map((criterion) => <div key={criterion}>{criterion}</div>)}
                      </div>
                    </div>
                  </div>

                  <details className="group rounded-2xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
                      <span>{locale === "zh" ? "内容编辑" : "Content Editing"}</span>
                      <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
                      <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
                    </summary>
                    <div className="grid gap-3 border-t border-slate-200 p-4">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "任务标题" : "Task Title"}</span>
                        <Input
                          value={selectedTask.title}
                          onChange={(event) => handleTaskContentChange({ title: event.target.value })}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "任务摘要" : "Task Summary"}</span>
                        <Textarea
                          value={selectedTask.summary}
                          onChange={(event) => handleTaskContentChange({ summary: event.target.value })}
                          className="min-h-24"
                        />
                      </label>
                    </div>
                  </details>

                  <details className="group rounded-2xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
                      <span>{locale === "zh" ? "深入编辑" : "Advanced Editing"}</span>
                      <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
                      <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
                    </summary>
                    <div className="grid gap-4 border-t border-slate-200 p-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                          {locale === "zh" ? "任务位置" : "Task Position"}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white" onClick={() => handleMoveSelectedTask("up")}>
                            {locale === "zh" ? "上移" : "Move Up"}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white" onClick={() => handleMoveSelectedTask("down")}>
                            {locale === "zh" ? "下移" : "Move Down"}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white" onClick={() => handleMoveSelectedTask("left")}>
                            {locale === "zh" ? "移到上一列" : "Move Left"}
                          </Button>
                          <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white" onClick={() => handleMoveSelectedTask("right")}>
                            {locale === "zh" ? "移到下一列" : "Move Right"}
                          </Button>
                        </div>
                      </div>

                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "验收标准" : "Acceptance Criteria"}</span>
                        <Textarea
                          value={selectedTask.acceptance.join("\n")}
                          onChange={(event) => handleTaskContentChange({ acceptance: parseAcceptance(event.target.value) })}
                          className="min-h-28"
                        />
                        <span className="text-xs text-slate-500">
                          {locale === "zh" ? "每行一条验收标准。" : "Use one acceptance criterion per line."}
                        </span>
                      </label>

                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {locale === "zh" ? "依赖编辑" : "Dependencies Editor"}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            onClick={handleDeleteTask}
                          >
                            <Trash2 className="h-4 w-4" />
                            {locale === "zh" ? "删除任务" : "Delete Task"}
                          </Button>
                        </div>
                        {suggestedSelectedTaskDependencies.length ? (
                          <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs font-medium text-sky-800">
                                {locale === "zh" ? "建议依赖" : "Suggested Dependencies"}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 rounded-full px-3 text-sky-700 hover:bg-sky-100"
                                onClick={() => handleApplySuggestedDependencies(selectedTask.id, suggestedSelectedTaskDependencies)}
                              >
                                {locale === "zh" ? "应用建议" : "Apply Suggestion"}
                              </Button>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {suggestedSelectedTaskDependencies.map((dependencyId) => {
                                const dependency = board.tasks.find((task) => task.id === dependencyId);
                                if (!dependency) {
                                  return null;
                                }
                                return (
                                  <Badge key={dependencyId} variant="outline" className="rounded-full border-sky-200 bg-white text-sky-700">
                                    {translateTask(dependency, locale).title}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                        <div className="grid gap-2">
                          {board.tasks.filter((task) => task.id !== selectedTask.id).length ? (
                            board.tasks
                              .filter((task) => task.id !== selectedTask.id)
                              .map((task) => (
                                <label key={task.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                  <input
                                    type="checkbox"
                                    checked={selectedTask.dependsOn.includes(task.id)}
                                    onChange={() => handleDependencyToggle(task.id)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span className="flex-1">{translateTask(task, locale).title}</span>
                                  <Badge variant="outline" className="rounded-full border-slate-300 text-slate-500">
                                    {laneLabels[locale][task.lane]}
                                  </Badge>
                                </label>
                              ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-500">
                              {locale === "zh" ? "当前没有其他任务可作为依赖。" : "There are no other tasks available as dependencies."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>

                  <details className="group rounded-2xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
                      <span>{locale === "zh" ? "评论与时间线" : "Comments and Timeline"}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                          {selectedTask.comments.length} {locale === "zh" ? "评论" : "comments"}
                        </Badge>
                        <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
                        <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
                      </div>
                    </summary>
                    <div className="grid gap-4 border-t border-slate-200 p-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {locale === "zh" ? "任务评论" : "Task Comments"}
                          </div>
                          <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                            {selectedTask.comments.length} {locale === "zh" ? "条" : "comments"}
                          </Badge>
                        </div>
                        <div className="mt-4 grid gap-3">
                          <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
                            <select
                              value={newCommentAuthor}
                              onChange={(event) => setNewCommentAuthor(event.target.value as OrchestraExecutor)}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                            >
                              {(["planner", "commander", "codex", "claude_code", "portfolio", "human"] as OrchestraExecutor[]).map((owner) => (
                                <option key={owner} value={owner}>
                                  {ownerLabel(owner, locale)}
                                </option>
                              ))}
                            </select>
                            <Textarea
                              value={newCommentBody}
                              onChange={(event) => setNewCommentBody(event.target.value)}
                              className="min-h-20"
                              placeholder={locale === "zh" ? "写一条关于当前任务的评论、决定或提醒。" : "Write a comment, decision, or reminder for this task."}
                            />
                            <Button onClick={handleAddComment} className="rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800">
                              {locale === "zh" ? "添加评论" : "Add Comment"}
                            </Button>
                          </div>
                          {selectedTask.comments.length ? (
                            <div className="space-y-3">
                              {selectedTask.comments
                                .slice()
                                .reverse()
                                .map((comment) => (
                                  <div key={comment.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-sm font-medium text-slate-900">{ownerLabel(comment.author, locale)}</div>
                                      <div className="text-xs text-slate-500">{new Date(comment.createdAt).toLocaleString()}</div>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{comment.body}</p>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                              {locale === "zh" ? "这个任务还没有评论。" : "No comments on this task yet."}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{locale === "zh" ? "任务时间线" : "Task Timeline"}</div>
                        <div className="mt-4 space-y-3">
                          {selectedTimeline.length ? selectedTimeline.map((event) => (
                            <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium text-slate-900">{event.title}</div>
                                  <p className="mt-1 text-xs text-slate-500">{new Date(event.createdAt).toLocaleString()} · {timelineLabel(event.eventType, locale)}</p>
                                </div>
                                <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">{timelineLabel(event.eventType, locale)}</Badge>
                              </div>
                              <p className="mt-3 text-sm leading-6 text-slate-600">{event.detail}</p>
                            </div>
                          )) : (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                              {locale === "zh" ? "这个任务还没有时间线事件。" : "No timeline events for this task yet."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </>
              ) : null}
            </CardContent>
          </Card> : null}

          {inspectorTab === "deps" ? <Card className="border-slate-200/80 bg-white/92 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.18)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <GitPullRequestArrow className="h-5 w-5 text-sky-600" />
                {locale === "zh" ? "依赖地图" : "Dependency Map"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {dependencyMap.length ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {locale === "zh" ? "依赖关系" : "Dependencies"}
                  </div>
                  {dependencyMap.map(({ task, dependencies }) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <button
                        type="button"
                        onClick={() => handleOpenTask(task.id)}
                        className="text-left text-sm font-medium text-slate-900 transition-colors hover:text-sky-700"
                      >
                        {translateTask(task, locale).title}
                      </button>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{locale === "zh" ? "依赖于" : "depends on"}</span>
                        {dependencies.map((dependency) => (
                          <button
                            key={dependency.id}
                            type="button"
                            onClick={() => handleOpenTask(dependency.id)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                          >
                            {translateTask(dependency, locale).title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  {locale === "zh" ? "当前没有定义依赖关系。" : "No task dependencies are defined yet."}
                </div>
              )}

              {reverseDependencyMap.length ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {locale === "zh" ? "反向依赖" : "Reverse Dependencies"}
                  </div>
                  {reverseDependencyMap.map(({ task, dependents }) => (
                    <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <button
                        type="button"
                        onClick={() => handleOpenTask(task.id)}
                        className="text-left text-sm font-medium text-slate-900 transition-colors hover:text-sky-700"
                      >
                        {translateTask(task, locale).title}
                      </button>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{locale === "zh" ? "被这些任务依赖" : "is required by"}</span>
                        {dependents.map((dependent) => (
                          <button
                            key={dependent.id}
                            type="button"
                            onClick={() => handleOpenTask(dependent.id)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                          >
                            {translateTask(dependent, locale).title}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card> : null}

          {inspectorTab === "task" ? <details className="group rounded-[24px] border border-slate-200 bg-white/92 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.14)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-sky-600" />
                <span>{locale === "zh" ? "新增任务" : "Task Composer"}</span>
              </div>
              <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
              <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
            </summary>
            <div className="grid gap-3 border-t border-slate-200 p-4">
              {suggestedNewTaskDependencies.length ? (
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
                  <div className="text-xs font-medium text-sky-800">
                    {locale === "zh" ? "系统会默认添加这些依赖" : "Suggested dependencies will be added"}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {suggestedNewTaskDependencies.map((dependencyId) => {
                      const dependency = board.tasks.find((task) => task.id === dependencyId);
                      if (!dependency) {
                        return null;
                      }
                      return (
                        <Badge key={dependencyId} variant="outline" className="rounded-full border-sky-200 bg-white text-sky-700">
                          {translateTask(dependency, locale).title}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-700">{locale === "zh" ? "任务标题" : "Task Title"}</span>
                <Input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="font-medium text-slate-700">{locale === "zh" ? "任务摘要" : "Task Summary"}</span>
                <Textarea value={newTaskSummary} onChange={(event) => setNewTaskSummary(event.target.value)} className="min-h-24" />
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">Lane</span>
                  <select
                    value={newTaskLane}
                    onChange={(event) => setNewTaskLane(event.target.value as OrchestraTask["lane"])}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    {laneOrder.map((lane) => (
                      <option key={lane} value={lane}>
                        {laneLabels[locale][lane]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">Owner</span>
                  <select
                    value={newTaskOwner}
                    onChange={(event) => setNewTaskOwner(event.target.value as OrchestraExecutor)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    {(["planner", "commander", "codex", "claude_code", "portfolio", "human"] as OrchestraExecutor[]).map((owner) => (
                      <option key={owner} value={owner}>
                        {ownerLabel(owner, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "优先级" : "Priority"}</span>
                  <select
                    value={newTaskPriority}
                    onChange={(event) => setNewTaskPriority(event.target.value as OrchestraTaskPriority)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    {(["low", "medium", "high", "critical"] as OrchestraTaskPriority[]).map((priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabel[locale][priority]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                <span>
                  {suggestedNewTaskDependencies.length
                    ? locale === "zh"
                      ? "新任务会带上建议依赖。"
                      : "The new task will include suggested dependencies."
                    : locale === "zh"
                      ? "当前没有默认依赖。"
                      : "No default dependencies for this task."}
                </span>
                <Button onClick={handleCreateTask} className="rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                  {locale === "zh" ? "新增任务" : "Add Task"}
                </Button>
              </div>
            </div>
          </details> : null}

          {inspectorTab === "batch" ? <Card className="border-slate-200/80 bg-white/92 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.18)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Cpu className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "Commander 控制台" : "Commander Console"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {locale === "zh" ? "Execution Batch" : "Execution Batch"}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {locale === "zh"
                        ? `已选择 ${commandTasks.length} 个任务用于批量交接。`
                        : `${commandTasks.length} tasks selected for batched handoff.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={batchStrategy}
                      onChange={(event) => setBatchStrategy(event.target.value as BatchStrategy)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                    >
                      {(["manual", "dependency", "owner", "priority"] as BatchStrategy[]).map((strategy) => (
                        <option key={strategy} value={strategy}>
                          {batchStrategyLabel[locale][strategy]}
                        </option>
                      ))}
                    </select>
                    <Button
                      size="sm"
                      className="rounded-full bg-slate-950 text-white shadow-sm hover:bg-slate-800"
                      onClick={handleGenerateBatchHandoff}
                      disabled={!commandTasks.length}
                    >
                      {locale === "zh" ? "生成交接包" : "Generate Handoff"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full"
                      onClick={handleClearTaskSelection}
                      disabled={!commandTasks.length}
                    >
                      {locale === "zh" ? "清空批次" : "Clear Batch"}
                    </Button>
                  </div>
                </div>
                {orderedCommandTasks.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {orderedCommandTasks.map((task, index) => (
                      <Badge key={task.id} variant="outline" className="rounded-full border-slate-300 bg-white text-slate-700">
                        {index + 1}. {translateTask(task, locale).title}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
              <details className="group rounded-2xl border border-slate-200 bg-white">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
                  <span>{locale === "zh" ? "执行设置" : "Execution Settings"}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                      {selectedAdapter.name}
                    </Badge>
                    <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
                    <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
                  </div>
                </summary>
                <div className="grid gap-4 border-t border-slate-200 p-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "执行模式" : "Execution Mode"}</span>
                        <select
                          value={adapterMode}
                          onChange={(event) => setAdapterMode(event.target.value as ExecutorAdapterMode)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                        >
                          {executorAdapters.map((adapter) => (
                            <option key={adapter.id} value={adapter.id}>
                              {adapter.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="text-sm font-medium text-slate-900">{selectedAdapter.name}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">{selectedAdapter.description}</p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "Codex 命令模板" : "Codex Command Template"}</span>
                        <Input
                          value={commandTemplates.codex}
                          onChange={(event) => setCommandTemplates((current) => ({ ...current, codex: event.target.value }))}
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "Claude Code 命令模板" : "Claude Code Command Template"}</span>
                        <Input
                          value={commandTemplates.claude_code}
                          onChange={(event) => setCommandTemplates((current) => ({ ...current, claude_code: event.target.value }))}
                        />
                      </label>
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {locale === "zh"
                        ? "支持变量：{title}、{summary}、{owner}。"
                        : "Supported variables: {title}, {summary}, {owner}."}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="grid gap-3 md:grid-cols-[220px_1fr] md:items-center">
                      <label className="grid gap-2 text-sm">
                        <span className="font-medium text-slate-700">{locale === "zh" ? "运行档位" : "Execution Stage"}</span>
                        <select
                          value={executionStage}
                          onChange={(event) => setExecutionStage(event.target.value as ExecutionStage)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                        >
                          {(["preview", "armed", "live"] as ExecutionStage[]).map((stage) => (
                            <option key={stage} value={stage}>
                              {executionStageLabel[locale][stage]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="text-sm font-medium text-slate-900">{executionStageLabel[locale][executionStage]}</div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {executionStage === "preview"
                            ? (locale === "zh"
                              ? "仅生成 handoff 和命令，不做任何外部执行。"
                              : "Only generates handoffs and commands, with no external execution.")
                            : executionStage === "armed"
                              ? (locale === "zh"
                                ? "进入接近真实执行的状态，但仍然不会真正调用 CLI。"
                                : "Moves closer to live execution, but still does not invoke CLIs.")
                              : (locale === "zh"
                                ? "这是未来真实执行的占位模式，当前开源版仍会保持安全模式。"
                                : "This is a placeholder for future live execution; the open-source demo remains safe.")}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {locale === "zh" ? "环境前置检查" : "Environment Checks"}
                    </div>
                    <div className="mt-4 space-y-3">
                      {environmentChecks.map((check) => (
                        <div key={check.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium text-slate-900">{check.label}</div>
                            <Badge
                              className={cn(
                                "rounded-full border",
                                check.ok
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700",
                              )}
                            >
                              {check.ok ? (locale === "zh" ? "通过" : "OK") : (locale === "zh" ? "待配置" : "Pending")}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{check.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {locale === "zh" ? "执行预检" : "Execution Preflight"}
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {batchPreflight.ready
                        ? (locale === "zh" ? "当前批次可以执行。" : "The current batch is ready to run.")
                        : (locale === "zh" ? "当前批次还有前置问题，先看下面的提示。" : "The current batch still has prerequisites to resolve.")}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={autoLoadNextBatch}
                      onChange={(event) => setAutoLoadNextBatch(event.target.checked)}
                    />
                    {locale === "zh" ? "运行后自动装载下一批" : "Auto-load next queue after run"}
                  </label>
                </div>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {batchPreflight.checks.map((check) => (
                    <div key={check.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{check.label}</div>
                        <Badge className={cn("rounded-full border", check.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                          {check.ok ? (locale === "zh" ? "通过" : "OK") : (locale === "zh" ? "注意" : "Check")}
                        </Badge>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-slate-500">{check.detail}</div>
                    </div>
                  ))}
                </div>
                {batchPreflight.warnings.length ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-amber-800">
                    {batchPreflight.warnings.join(" ")}
                  </div>
                ) : null}
              </div>
              {packet ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {locale === "zh" ? "已生成交接包" : "Handoff Ready"}
                          </div>
                          <div className="mt-2 text-sm font-medium text-slate-900">
                            {commandPackets.length > 1
                              ? locale === "zh"
                                ? `批量交接 · ${commandPackets.length} 个任务`
                                : `Batch handoff · ${commandPackets.length} tasks`
                              : packet.title}
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {commandPackets.length > 1
                              ? locale === "zh"
                                ? "Commander 会保留每个任务自己的执行者，但把这批任务作为一个执行批次来下发。"
                                : "Commander preserves each task executor but issues them as one execution batch."
                              : packet.reasoning}
                          </p>
                        </div>
                        <Badge className={cn("rounded-full", ownerTone[packet.executor])}>
                          {commandPackets.length > 1 ? (locale === "zh" ? "Batch" : "Batch") : ownerLabel(packet.executor, locale)}
                        </Badge>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                            {commandPackets.length > 1 ? "Suggested Batch Command" : "Suggested Command"}
                          </div>
                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm leading-6 text-slate-700"><code>{commandPackets.length > 1 ? buildBatchCommand(commandPackets) : packet.suggestedCommand}</code></pre>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-slate-200 bg-white shadow-sm"
                          onClick={() => handleCopy(commandPackets.length > 1 ? buildBatchCommand(commandPackets) : packet.suggestedCommand)}
                        >
                          <Copy className="h-4 w-4" />
                          {locale === "zh" ? "复制命令" : "Copy"}
                        </Button>
                        <Button size="sm" className="rounded-full bg-slate-950 text-white shadow-sm hover:bg-slate-800" onClick={handleRunPacket}>
                          <Cpu className="h-4 w-4" />
                          {locale === "zh" ? "立即运行" : "Run Now"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-full border-slate-200 bg-white shadow-sm"
                          onClick={handleRunAndLoadNext}
                          disabled={!commandPackets.length}
                        >
                          <Cpu className="h-4 w-4" />
                          {locale === "zh" ? "运行并装载下一批" : "Run + Next Queue"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <details className="group rounded-2xl border border-slate-200 bg-white">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
                      <span>{commandPackets.length > 1 ? (locale === "zh" ? "批量 Prompt" : "Batch Prompt") : (locale === "zh" ? "执行 Prompt" : "Executor Prompt")}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full border-slate-200 bg-white shadow-sm"
                          onClick={(event) => {
                            event.preventDefault();
                            handleCopy(commandPackets.length > 1 ? commandPackets.map((item) => item.prompt).join("\n\n---\n\n") : packet.prompt);
                          }}
                        >
                          <Copy className="h-4 w-4" />
                          {locale === "zh" ? "复制" : "Copy"}
                        </Button>
                        <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
                        <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
                      </div>
                    </summary>
                    <div className="border-t border-slate-200 p-4">
                      <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-600"><code>{commandPackets.length > 1 ? commandPackets.map((item) => `# ${item.title}\n${item.prompt}`).join("\n\n---\n\n") : packet.prompt}</code></pre>
                    </div>
                  </details>

                  {runResult ? (
                    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{locale === "zh" ? "执行结果" : "Execution Result"}</div>
                          <p className="mt-1 text-xs text-slate-500">{locale === "zh" ? "演练模式" : "Dry run"} · {runResult.durationMs}ms</p>
                        </div>
                        <Badge className={cn("rounded-full", ownerTone[runResult.executor])}>{ownerLabel(runResult.executor, locale)}</Badge>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-2">
                        <div className="rounded-2xl bg-slate-950 p-4 text-slate-100 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)]">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Stdout</div>
                          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5"><code>{runResult.stdout}</code></pre>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Stderr</div>
                          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600"><code>{runResult.stderr}</code></pre>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  <div className="font-medium text-slate-900">
                    {locale === "zh" ? "还没有交接包。" : "No handoff yet."}
                  </div>
                  <div className="mt-2">
                    {locale === "zh"
                      ? "先在左侧任务卡点击“交接”，或直接把当前焦点任务送到执行区。"
                      : "Click handoff on a task card, or send the current focused task here."}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full border-slate-200 bg-white"
                      onClick={() => selectedTask && handleGenerateHandoff(selectedTask)}
                      disabled={!selectedTask}
                    >
                      {locale === "zh" ? "交接当前任务" : "Handoff Current Task"}
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full bg-slate-950 text-white hover:bg-slate-800"
                      onClick={() => setInspectorTab("task")}
                    >
                      {locale === "zh" ? "回到任务" : "Back to Task"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card> : null}

          <details className="group rounded-[24px] border border-slate-200 bg-slate-50/75 shadow-[0_10px_24px_-24px_rgba(15,23,42,0.12)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-slate-900">
              <span>{locale === "zh" ? "辅助视图" : "Secondary Views"}</span>
              <span className="text-xs text-slate-500 group-open:hidden">{locale === "zh" ? "展开" : "Expand"}</span>
              <span className="hidden text-xs text-slate-500 group-open:inline">{locale === "zh" ? "收起" : "Collapse"}</span>
            </summary>
            <div className="grid gap-4 border-t border-slate-200 p-4">
              <Card className="border-slate-200/80 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <BriefcaseBusiness className="h-5 w-5 text-emerald-600" />
                    {locale === "zh" ? "Agent 团队" : "Agent Team"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {orchestraAgents.map((agent) => (
                    <div key={agent.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-slate-900">{agent.name}</h3>
                          <p className="text-sm text-slate-500">{agent.role}</p>
                        </div>
                        <Badge className={cn("rounded-full", ownerTone[agent.id])}>{taskCounts[agent.id] ?? 0} {locale === "zh" ? "个任务" : "tasks"}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{agent.mission}</p>
                      <p className="mt-3 text-xs leading-5 text-slate-500">{agent.commandStyle}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <Flag className="h-5 w-5 text-amber-500" />
                    {locale === "zh" ? "Portfolio Signals" : "Portfolio Signals"}
                  </CardTitle>
                  <CardDescription>
                    {locale === "zh"
                      ? "根据当前任务图自动生成的全局信号和建议。"
                      : "Automatically generated portfolio-level signals from the current board."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {portfolioSignals.map((signal) => (
                    <div key={signal.title} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-900">{signal.title}</div>
                        <Badge
                          className={cn(
                            "rounded-full border",
                            signal.tone === "rose" && "border-rose-200 bg-rose-50 text-rose-700",
                            signal.tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700",
                            signal.tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700",
                            signal.tone === "sky" && "border-sky-200 bg-sky-50 text-sky-700",
                            signal.tone === "slate" && "border-slate-200 bg-slate-50 text-slate-700",
                          )}
                        >
                          {signal.tone}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-600">{signal.detail}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,1)_100%)] shadow-none">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <Flag className="h-5 w-5 text-rose-500" />
                    {locale === "zh" ? "开源版说明" : "Open-source Notes"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(locale === "zh"
                    ? [
                        "这个仓库是独立的 Orchestra 演示版，不依赖登录和后端数据库。",
                        "Handoff 和 Run 都是本地模拟，便于你在 GitHub 上直接展示。",
                        "如果要接入真实 Codex / Claude Code CLI，可以在这个基础上再加执行 adapter。",
                      ]
                    : [
                        "This repo is a standalone Orchestra demo with no auth or backend dependency.",
                        "Handoffs and runs are simulated locally so the project is easy to showcase on GitHub.",
                        "You can add real Codex / Claude Code execution adapters on top of this foundation later.",
                      ]
                  ).map((note) => (
                    <div key={note} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4 text-sm leading-7 text-slate-600">{note}</div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </details>

          {inspectorTab === "runs" ? <Card className="border-slate-200/80 bg-white/92 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.18)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <CheckCircle2 className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "执行历史" : "Run History"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {batchSummaries.length ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {locale === "zh" ? "Batch 摘要" : "Batch Summaries"}
                  </div>
                  {batchSummaries.map((summary) => (
                    <div key={summary.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">
                            {locale === "zh"
                              ? `${summary.total} 个任务批次`
                              : `${summary.total}-task batch`}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {new Date(summary.createdAt).toLocaleString()} · {batchStrategyLabel[locale][summary.strategy]} · {(executorAdapters.find((adapter) => adapter.id === summary.adapterMode) ?? simulatedExecutorAdapter).name}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                            {locale === "zh" ? `成功 ${summary.succeeded}` : `Succeeded ${summary.succeeded}`}
                          </Badge>
                          <Badge className="rounded-full border border-rose-200 bg-rose-50 text-rose-700">
                            {locale === "zh" ? `跳过 ${summary.failed}` : `Skipped ${summary.failed}`}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {summary.taskIds.map((taskId) => {
                          const task = board.tasks.find((candidate) => candidate.id === taskId);
                          return (
                            <button
                              key={taskId}
                              type="button"
                              onClick={() => task && handleOpenTask(task.id)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                            >
                              {task ? translateTask(task, locale).title : taskId}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {dispatchHistory.length ? (
                <div className="space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    {locale === "zh" ? "Dispatch 历史" : "Dispatch History"}
                  </div>
                  {dispatchHistory.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{entry.boardName}</div>
                          <p className="mt-1 text-xs text-slate-500">
                            {entry.createdAt.slice(0, 19).replace("T", " ")} · {entry.strategy}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                            {locale === "zh" ? `${entry.taskIds.length} 个任务` : `${entry.taskIds.length} tasks`}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50"
                            onClick={() => {
                              const snapshot = boardSnapshots.find((candidate) => candidate.id === entry.boardId);
                              if (!snapshot) {
                                return;
                              }
                              hydrateFromSnapshot({
                                ...snapshot,
                                selectedTaskId: entry.taskIds[0] ?? snapshot.selectedTaskId,
                                selectedCommandTaskIds: entry.taskIds,
                              });
                              setInspectorTab("batch");
                            }}
                          >
                            {locale === "zh" ? "重新装载" : "Reload Batch"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              {runHistory.length ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {locale === "zh" ? "单次运行" : "Run Records"}
                    </div>
                    <select
                      value={runStatusFilter}
                      onChange={(event) => setRunStatusFilter(event.target.value as RunStatusFilter)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm outline-none focus:border-slate-300"
                    >
                      <option value="all">{locale === "zh" ? "全部状态" : "All statuses"}</option>
                      <option value="succeeded">{locale === "zh" ? "仅成功" : "Succeeded"}</option>
                      <option value="failed">{locale === "zh" ? "仅失败" : "Failed"}</option>
                    </select>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white"
                    onClick={handleRetryFailedRuns}
                    disabled={!runHistory.some((record) => record.status === "failed")}
                  >
                    {locale === "zh" ? "重试失败任务" : "Retry Failed"}
                  </Button>
                </div>
              ) : null}
              {visibleRunHistory.length ? visibleRunHistory.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {translateTask(board.tasks.find((task) => task.id === record.taskId) ?? {
                          id: record.taskId,
                          title: record.taskId,
                          summary: "",
                          state: "ready",
                          kind: "implementation",
                          priority: "medium",
                          owner: record.executor,
                          dependsOn: [],
                          acceptance: [],
                          lane: "execution",
                          comments: [],
                        }, locale).title}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{new Date(record.createdAt).toLocaleString()} · {locale === "zh" ? "演练模式" : "dry_run"} · {record.durationMs}ms</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={cn("rounded-full", ownerTone[record.executor])}>{ownerLabel(record.executor, locale)}</Badge>
                      <Badge
                        className={cn(
                          "rounded-full border",
                          record.status === "succeeded"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        {record.status === "succeeded"
                          ? (locale === "zh" ? "成功" : "Succeeded")
                          : (locale === "zh" ? "跳过" : "Skipped")}
                      </Badge>
                    </div>
                  </div>
                  <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600"><code>{record.command} {record.args.join(" ")}</code></pre>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50"
                        onClick={() => handleOpenTask(record.taskId)}
                      >
                        {locale === "zh" ? "定位任务" : "Open Task"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50"
                        onClick={() => handleRetryRun(record)}
                      >
                        {locale === "zh" ? "重试" : "Retry"}
                      </Button>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50" onClick={() => setExpandedRunId((current) => current === record.id ? null : record.id)}>
                      {expandedRunId === record.id ? (locale === "zh" ? "收起详情" : "Hide Details") : (locale === "zh" ? "查看详情" : "Show Details")}
                    </Button>
                  </div>
                  {expandedRunId === record.id ? (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-2xl bg-slate-950 p-4 text-slate-100 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)]">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Stdout</div>
                        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5"><code>{record.stdout}</code></pre>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Stderr</div>
                        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600"><code>{record.stderr}</code></pre>
                      </div>
                    </div>
                  ) : null}
                </div>
              )) : runHistory.length ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  {locale === "zh" ? "当前筛选下没有运行记录。" : "No run records match the current filter."}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  {locale === "zh" ? "还没有执行记录。先生成 handoff，再点击运行。" : "No execution records yet. Generate a handoff first, then run it."}
                </div>
              )}
            </CardContent>
          </Card> : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, compact = false }: { icon: typeof Clipboard; label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border border-white/70 bg-white/80 shadow-sm backdrop-blur",
      compact ? "p-3" : "p-4",
    )}>
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        <span className={cn("uppercase tracking-[0.18em]", compact ? "text-[10px]" : "text-xs")}>{label}</span>
      </div>
      <div className={cn("font-semibold text-slate-950", compact ? "mt-2 text-xl" : "mt-3 text-2xl")}>{value}</div>
    </div>
  );
}
