"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
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
import { buildCommandPacket, type CommandPacket } from "@/lib/orchestra/commander";
import { getDefaultOrchestraBoard, orchestraAgents, orchestraScenarios } from "@/lib/orchestra/data";
import { buildBoardFromIdea, summarizeByOwner } from "@/lib/orchestra/planner";
import { cn } from "@/lib/utils";
import type {
  OrchestraBoard,
  OrchestraExecutor,
  OrchestraFeatureIdea,
  OrchestraTaskComment,
  OrchestraTaskPriority,
  OrchestraRunRecord,
  OrchestraScenario,
  OrchestraTask,
  OrchestraTaskState,
  OrchestraTimelineEvent,
} from "@/lib/orchestra/types";

type Locale = "zh" | "en";
type BatchStrategy = "manual" | "dependency" | "owner" | "priority";
type QuickFilter = "all" | "ready" | "blocked" | "critical";
type BatchRunSummary = {
  id: string;
  createdAt: string;
  strategy: BatchStrategy;
  total: number;
  succeeded: number;
  failed: number;
  taskIds: string[];
};
type DemoResult = {
  executor: OrchestraExecutor;
  mode: "dry_run";
  command: string;
  stdout: string;
  stderr: string;
  durationMs: number;
};

const LOCALE_KEY = "orchestra-oss-locale";
const STATE_KEY = "orchestra-oss-state";

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

function buildDemoResult(packet: CommandPacket): DemoResult {
  return {
    executor: packet.executor,
    mode: "dry_run",
    command: packet.suggestedCommand,
    stdout: [
      `Simulated ${packet.executor} handoff.`,
      `Objective: ${packet.objective}`,
      `Success criteria: ${packet.successCriteria.join("; ")}`,
    ].join("\n"),
    stderr: "No stderr. This open-source demo runs in local simulation mode.",
    durationMs: 320,
  };
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

function buildRunRecord(taskId: string, result: DemoResult): OrchestraRunRecord {
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

function isTaskRunnable(task: OrchestraTask, board: OrchestraBoard, batchTaskIds: Set<string>, completedInBatch: Set<string>) {
  if (task.state !== "ready") {
    return {
      runnable: false,
      reason: `Task is currently ${task.state}.`,
    };
  }

  for (const dependencyId of task.dependsOn) {
    if (completedInBatch.has(dependencyId)) {
      continue;
    }

    const dependency = board.tasks.find((candidate) => candidate.id === dependencyId);
    if (!dependency) {
      return {
        runnable: false,
        reason: `Dependency ${dependencyId} is missing from the board.`,
      };
    }

    if (batchTaskIds.has(dependencyId)) {
      return {
        runnable: false,
        reason: `Dependency ${dependency.title} has not completed yet in this batch.`,
      };
    }

    if (!["done", "review"].includes(dependency.state)) {
      return {
        runnable: false,
        reason: `Dependency ${dependency.title} is still ${dependency.state}.`,
      };
    }
  }

  return {
    runnable: true,
    reason: "",
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
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
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
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(orchestraScenarios[0]?.id ?? "");
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [laneFilter, setLaneFilter] = useState<OrchestraTask["lane"] | "all">("all");
  const [stateFilter, setStateFilter] = useState<OrchestraTaskState | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<OrchestraExecutor | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<OrchestraTaskPriority | "all">("all");
  const [selectedCommandTaskIds, setSelectedCommandTaskIds] = useState<string[]>([]);
  const [batchStrategy, setBatchStrategy] = useState<BatchStrategy>("manual");
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

  const taskCounts = useMemo(() => summarizeByOwner(board.tasks), [board.tasks]);
  const portfolioSignals = useMemo(() => buildPortfolioSignals(board, locale), [board, locale]);
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
    () => laneOrder.map((lane) => ({ lane, tasks: visibleTasks.filter((task) => task.lane === lane) })),
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
  const commandPackets = useMemo(
    () => orderedCommandTasks.map((task) => buildCommandPacket(board.feature, task, task.owner)),
    [board.feature, orderedCommandTasks],
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
        const parsed = JSON.parse(raw) as {
          board: OrchestraBoard;
          selectedTaskId: string;
          runHistory: OrchestraRunRecord[];
          batchSummaries?: BatchRunSummary[];
          timeline: OrchestraTimelineEvent[];
          selectedCommandTaskIds?: string[];
          batchStrategy?: BatchStrategy;
        };

        const normalizedBoard = normalizeBoard(parsed.board);
        setBoard(normalizedBoard);
        setSelectedTaskId(parsed.selectedTaskId || normalizedBoard.tasks[0]?.id || "");
        setRunHistory(parsed.runHistory ?? []);
        setBatchSummaries(parsed.batchSummaries ?? []);
        setTimeline(parsed.timeline ?? []);
        setSelectedCommandTaskIds(parsed.selectedCommandTaskIds ?? []);
        setBatchStrategy(parsed.batchStrategy ?? "manual");
        setTitle(normalizedBoard.feature.title);
        setProblem(normalizedBoard.feature.problem);
        setGoals(normalizedBoard.feature.goals.join("\n"));
        setConstraints(normalizedBoard.feature.constraints.join("\n"));
      } catch {
        // Ignore invalid local state.
      }
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);
  const selectedScenario = orchestraScenarios.find((scenario) => scenario.id === selectedScenarioId) ?? orchestraScenarios[0];

  useEffect(() => {
    window.localStorage.setItem(LOCALE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        board,
        selectedTaskId,
        runHistory,
        batchSummaries,
        timeline,
        selectedCommandTaskIds,
        batchStrategy,
      }),
    );
  }, [batchStrategy, batchSummaries, board, selectedTaskId, runHistory, timeline, selectedCommandTaskIds]);

  function handleGeneratePlan() {
    const idea: OrchestraFeatureIdea = {
      id: `idea-${Date.now()}`,
      title,
      problem,
      goals: goals.split("\n").map((line) => line.trim()).filter(Boolean),
      constraints: constraints.split("\n").map((line) => line.trim()).filter(Boolean),
      notes: [locale === "zh" ? "由开源版 Orchestra 生成。" : "Generated by the open-source Orchestra demo."],
    };

    const nextBoard = buildBoardFromIdea(idea);
    setBoard(nextBoard);
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setPacket(null);
    setRunResult(null);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
  }

  function applyScenario(scenario: OrchestraScenario) {
    setSelectedScenarioId(scenario.id);
    setTitle(scenario.feature.title);
    setProblem(scenario.feature.problem);
    setGoals(scenario.feature.goals.join("\n"));
    setConstraints(scenario.feature.constraints.join("\n"));

    const nextBoard = buildBoardFromIdea(scenario.feature);
    setBoard(nextBoard);
    setSelectedTaskId(nextBoard.tasks[0]?.id ?? "");
    setPacket(null);
    setRunResult(null);
    setRunHistory([]);
    setBatchSummaries([]);
    setTimeline([]);
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
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
    setSelectedCommandTaskIds([]);
    setBatchStrategy("manual");
  }

  function handleGenerateHandoff(task: OrchestraTask) {
    setSelectedTaskId(task.id);
    setPacket(buildCommandPacket(board.feature, task, task.owner));
    setSelectedCommandTaskIds([task.id]);
    setRunResult(null);
  }

  function handleGenerateBatchHandoff() {
    if (!commandTasks.length) {
      return;
    }

    setSelectedTaskId(orderedCommandTasks[0]?.id ?? "");
    setPacket(commandPackets[0] ?? null);
    setRunResult(null);
  }

  function handleRunPacket() {
    if (!commandPackets.length) {
      return;
    }

    const completedInBatch = new Set<string>();
    const batchTaskIds = new Set(orderedCommandTasks.map((task) => task.id));
    const executionLog: Array<{
      task: OrchestraTask;
      result: DemoResult;
      status: OrchestraRunRecord["status"];
      shouldAdvance: boolean;
    }> = [];

    for (const [index, task] of orderedCommandTasks.entries()) {
      const packet = commandPackets[index];
      const gate = isTaskRunnable(task, board, batchTaskIds, completedInBatch);

      if (!gate.runnable) {
        executionLog.push({
          task,
          status: "failed",
          shouldAdvance: false,
          result: {
            executor: packet.executor,
            mode: "dry_run",
            command: packet.suggestedCommand,
            stdout: `Skipped ${task.title}.`,
            stderr: gate.reason,
            durationMs: 0,
          },
        });
        continue;
      }

      const result = buildDemoResult(packet);
      executionLog.push({
        task,
        result,
        status: "succeeded",
        shouldAdvance: true,
      });
      completedInBatch.add(task.id);
    }

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
      dependsOn: selectedTask ? [selectedTask.id] : [],
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

  function handleTaskSelection(taskId: string, checked: boolean) {
    setSelectedCommandTaskIds((current) => (
      checked ? [...new Set([...current, taskId])] : current.filter((id) => id !== taskId)
    ));
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
      <section className="overflow-hidden rounded-[32px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(14,116,144,0.14),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.10),_transparent_22%),linear-gradient(135deg,_#fcfcfd_0%,_#eff6ff_42%,_#f8fafc_100%)] p-8 shadow-[0_20px_60px_-30px_rgba(15,23,42,0.25)] md:p-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white shadow-sm">
              {locale === "zh" ? "Orchestra 开源演示" : "Orchestra Open Demo"}
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 md:text-5xl md:leading-[1.05]">
                {locale === "zh"
                  ? "把 feature 想法变成一个能指挥多 agent 协作的任务图。"
                  : "Turn feature ideas into a task graph that can coordinate multiple agents."}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-slate-600 md:text-base">
                {locale === "zh"
                  ? "这是一个独立、可开源的 Orchestra 演示仓库，保留了 feature intake、task graph、Commander handoff 和本地模拟执行。"
                  : "This is a standalone open-source Orchestra demo with feature intake, task graphs, Commander handoffs, and local simulated execution."}
              </p>
            </div>
          </div>
          <div className="grid min-w-[280px] grid-cols-3 gap-3">
            <MetricCard icon={Clipboard} label={locale === "zh" ? "任务数" : "Tasks"} value={`${visibleTasks.length}/${board.tasks.length}`} />
            <MetricCard icon={Cpu} label={locale === "zh" ? "进行中" : "In Flight"} value={String(board.tasks.filter((task) => task.state === "in_progress" || task.state === "review").length)} />
            <MetricCard icon={CheckCircle2} label={locale === "zh" ? "已完成" : "Done"} value={String(board.tasks.filter((task) => task.state === "done").length)} />
          </div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-4 text-xs text-slate-500">
          <span>{locale === "zh" ? "此开源版仅使用本地状态，不依赖登录和后端服务。" : "This open-source demo uses local state only and does not require auth or backend services."}</span>
          <div className="flex rounded-full border border-slate-200 bg-white/90 p-1 shadow-sm backdrop-blur">
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
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <Sparkles className="h-5 w-5 text-sky-600" />
              {locale === "zh" ? "快速上手" : "Quick Start"}
            </CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "如果你还没体验过这个系统，可以按下面 4 步走一遍。"
                : "If you have not used this system yet, walk through these four steps first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              locale === "zh"
                ? "1. 先在右侧载入一个示例场景，观察它如何直接生成任务图。"
                : "1. Load a sample scenario and see how it becomes a task graph immediately.",
              locale === "zh"
                ? "2. 点击任意任务卡上的“生成交接包”，看 Commander 如何给不同 agent 分派任务。"
                : "2. Click `Generate Handoff` on a task to see how Commander routes work to different agents.",
              locale === "zh"
                ? "3. 在 Commander Console 里点击“运行”，体验本地模拟执行和 timeline。"
                : "3. Click `Run` in the Commander Console to experience the local simulated execution and timeline.",
              locale === "zh"
                ? "4. 再修改 feature brief，自己生成一版新的计划。"
                : "4. Then edit the feature brief and generate a new plan of your own.",
            ].map((step) => (
              <div key={step} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4 text-sm leading-7 text-slate-600">
                {step}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <Flag className="h-5 w-5 text-emerald-600" />
              {locale === "zh" ? "示例场景" : "Sample Scenarios"}
            </CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "这些是为了帮助你体验 Orchestra 的预置案例。"
                : "These presets are designed to help you experience the Orchestra workflow quickly."}
            </CardDescription>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-slate-200 bg-white shadow-sm"
                    onClick={() => applyScenario(scenario)}
                  >
                    {locale === "zh" ? "载入" : "Load"}
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" className="rounded-full" onClick={resetDemo}>
                {locale === "zh" ? "重置为默认示例" : "Reset to Default Demo"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              {locale === "zh" ? "功能入口" : "Feature Intake"}
            </CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "从一个 feature 构思开始，不用先手动创建 issue。"
                : "Start from a feature idea instead of creating issues up front."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-700">{locale === "zh" ? "功能标题" : "Feature Title"}</span>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="grid gap-2 text-sm md:col-span-2">
              <span className="font-medium text-slate-700">{locale === "zh" ? "问题定义" : "Problem"}</span>
              <Textarea value={problem} onChange={(event) => setProblem(event.target.value)} className="min-h-24" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-700">{locale === "zh" ? "目标" : "Goals"}</span>
              <Textarea value={goals} onChange={(event) => setGoals(event.target.value)} className="min-h-32" />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="font-medium text-slate-700">{locale === "zh" ? "约束" : "Constraints"}</span>
              <Textarea value={constraints} onChange={(event) => setConstraints(event.target.value)} className="min-h-32" />
            </label>
            <div className="md:col-span-2 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="text-sm text-slate-600">
                {locale === "zh"
                  ? "生成后的计划会直接包含 Commander 对 Codex / Claude Code 的分派。"
                  : "The generated plan includes Commander handoffs for Codex and Claude Code."}
              </div>
              <Button onClick={handleGeneratePlan} className="rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800">
                {locale === "zh" ? "生成计划" : "Generate Plan"}
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <Bot className="h-5 w-5 text-violet-500" />
              {locale === "zh" ? "指挥协议" : "Command Protocol"}
            </CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "Commander 负责拆解任务并路由给合适的执行 agent。"
                : "Commander slices work and routes it to the right execution agent."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {protocolRows[locale].map((row) => (
              <div key={row.route} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <ArrowRight className="h-4 w-4 text-slate-400" />
                  {row.route}
                </div>
                <p className="mt-2 text-sm text-slate-600">{row.when}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{row.why}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-950">
              <GitPullRequestArrow className="h-5 w-5 text-sky-600" />
              {locale === "zh" ? "任务图看板" : "Task Graph Board"}
            </CardTitle>
            <CardDescription>
              {locale === "zh"
                ? "任务不是按普通看板列组织，而是按 feature 的交付流程组织。"
                : "Tasks are grouped by the feature delivery flow instead of a generic kanban."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[26px] border border-slate-200 bg-slate-50/80 p-4">
              <div className="grid gap-3 xl:grid-cols-[1.2fr_repeat(4,minmax(0,1fr))]">
                <label className="grid gap-2 text-sm xl:col-span-1">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "搜索任务" : "Search"}</span>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={locale === "zh" ? "标题、摘要、评论、验收标准" : "Title, summary, comments, acceptance"}
                      className="w-full bg-transparent text-sm text-slate-700 outline-none"
                    />
                  </div>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "状态" : "State"}</span>
                  <select
                    value={stateFilter}
                    onChange={(event) => setStateFilter(event.target.value as OrchestraTaskState | "all")}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    <option value="all">{locale === "zh" ? "全部状态" : "All states"}</option>
                    {(Object.keys(statusLabel.en) as OrchestraTaskState[]).map((state) => (
                      <option key={state} value={state}>
                        {statusLabel[locale][state]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "归属" : "Owner"}</span>
                  <select
                    value={ownerFilter}
                    onChange={(event) => setOwnerFilter(event.target.value as OrchestraExecutor | "all")}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    <option value="all">{locale === "zh" ? "全部归属" : "All owners"}</option>
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
                    value={priorityFilter}
                    onChange={(event) => setPriorityFilter(event.target.value as OrchestraTaskPriority | "all")}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    <option value="all">{locale === "zh" ? "全部优先级" : "All priorities"}</option>
                    {(["low", "medium", "high", "critical"] as OrchestraTaskPriority[]).map((priority) => (
                      <option key={priority} value={priority}>
                        {priorityLabel[locale][priority]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="font-medium text-slate-700">{locale === "zh" ? "泳道" : "Lane"}</span>
                  <select
                    value={laneFilter}
                    onChange={(event) => setLaneFilter(event.target.value as OrchestraTask["lane"] | "all")}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-slate-300"
                  >
                    <option value="all">{locale === "zh" ? "全部泳道" : "All lanes"}</option>
                    {laneOrder.map((lane) => (
                      <option key={lane} value={lane}>
                        {laneLabels[locale][lane]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
            {laneMap.map(({ lane, tasks }) => (
              <div
                key={lane}
                className={cn(
                  "rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.85)_0%,_rgba(248,250,252,0.96)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] transition-all",
                  dragOverLane === lane && "border-sky-300 bg-[linear-gradient(180deg,_rgba(240,249,255,0.95)_0%,_rgba(239,246,255,0.98)_100%)] ring-2 ring-sky-100",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-slate-900">{laneLabels[locale][lane]}</h3>
                    <p className="text-xs text-slate-500">{tasks.length} {locale === "zh" ? "个任务" : "tasks"}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-slate-300 bg-white text-slate-700">
                    {laneLabels[locale][lane]}
                  </Badge>
                </div>
                <div
                  className="space-y-3"
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
                            "rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] transition-all",
                            selectedTaskId === task.id && "border-slate-300 ring-2 ring-slate-950/10",
                            draggedTaskId === task.id && "scale-[0.985] opacity-60",
                            dragOverLane === lane && dragOverIndex === index && "border-sky-300",
                          )}
                        >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
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
                            <div>
                            <div className="text-base font-semibold text-slate-900">{translatedTask.title}</div>
                            <p className="mt-1 text-sm leading-7 text-slate-600">{translatedTask.summary}</p>
                            </div>
                          </div>
                          <Badge className={cn("rounded-full border", stateTone[task.state])}>{statusLabel[locale][task.state]}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge className={cn("rounded-full", ownerTone[task.owner])}>{ownerLabel(task.owner, locale)}</Badge>
                          <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                            {kindLabel(task.kind, locale)}
                          </Badge>
                          <Badge className={cn("rounded-full border", priorityTone[task.priority])}>
                            {locale === "zh" ? "优先级" : "Priority"}: {priorityLabel[locale][task.priority]}
                          </Badge>
                          {task.dependsOn.length > 0 ? (
                            <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                              {locale === "zh" ? `依赖 ${task.dependsOn.length} 项` : `depends on ${task.dependsOn.length}`}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-3 space-y-1">
                          {translatedTask.acceptance.map((criterion) => (
                            <div key={criterion} className="text-xs leading-5 text-slate-500">{criterion}</div>
                          ))}
                        </div>
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs text-slate-500">
                            {locale === "zh" ? "Commander 交接目标：" : "Commander handoff target: "} {ownerLabel(task.owner, locale)}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                            <Button variant="ghost" size="sm" className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50" onClick={() => setSelectedTaskId(task.id)}>
                              {locale === "zh" ? "查看" : "Inspect"}
                            </Button>
                            <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white shadow-sm" onClick={() => handleGenerateHandoff(task)}>
                              {locale === "zh" ? "生成交接包" : "Generate Handoff"}
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
                {locale === "zh"
                  ? "当前筛选条件下没有任务。你可以清空筛选，或者创建一个新任务。"
                  : "No tasks match the current filters. Clear the filters or create a new task."}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Clipboard className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "任务详情" : "Task Detail"}
              </CardTitle>
              <CardDescription>
                {locale === "zh" ? "查看选中任务的上下文、时间线、拖拽位置和交接信息。" : "Inspect the selected task context, ordering, timeline, and handoff."}
              </CardDescription>
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
                  </div>

                  <div className="grid gap-3">
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

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{locale === "zh" ? "依赖" : "Dependencies"}</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedTask.dependsOn.length ? selectedTask.dependsOn.map((dep) => {
                          const dependency = board.tasks.find((task) => task.id === dep);
                          return <div key={dep}>{dependency ? translateTask(dependency, locale).title : dep}</div>;
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
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Plus className="h-5 w-5 text-sky-600" />
                Task Composer
              </CardTitle>
              <CardDescription>
                {locale === "zh"
                  ? "手动添加一个新任务，并把它接到当前任务图里。"
                  : "Add a new task manually and connect it into the current task graph."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
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
                  {selectedTask
                    ? locale === "zh"
                      ? `新任务会默认依赖当前选中的任务：${translateTask(selectedTask, locale).title}`
                      : `The new task will depend on the currently selected task: ${translateTask(selectedTask, locale).title}`
                    : locale === "zh"
                      ? "当前没有选中的任务。"
                      : "No task is currently selected."}
                </span>
                <Button onClick={handleCreateTask} className="rounded-full bg-slate-950 px-5 text-white shadow-sm hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                  {locale === "zh" ? "新增任务" : "Add Task"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Cpu className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "Commander 控制台" : "Commander Console"}
              </CardTitle>
              <CardDescription>
                {locale === "zh" ? "这里会生成单任务或批量 handoff，并用本地模拟模式演示 run。" : "This generates single-task or batch handoffs and demonstrates runs in local simulation mode."}
              </CardDescription>
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
                      variant="outline"
                      size="sm"
                      className="rounded-full border-slate-200 bg-white shadow-sm"
                      onClick={handleGenerateBatchHandoff}
                      disabled={!commandTasks.length}
                    >
                      {locale === "zh" ? "生成批量交接包" : "Generate Batch Handoff"}
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
              {packet ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">
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
                  </div>

                  <div className="rounded-2xl border border-slate-900/80 bg-slate-950 p-4 text-slate-100 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                        {commandPackets.length > 1 ? "Suggested Batch Commands" : "Suggested Command"}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="rounded-full"
                          onClick={() => handleCopy(commandPackets.length > 1 ? buildBatchCommand(commandPackets) : packet.suggestedCommand)}
                        >
                          <Copy className="h-4 w-4" />
                          {locale === "zh" ? "复制" : "Copy"}
                        </Button>
                        <Button size="sm" className="rounded-full bg-white text-slate-950 shadow-sm hover:bg-slate-100" onClick={handleRunPacket}>
                          <Cpu className="h-4 w-4" />
                          {locale === "zh" ? "运行" : "Run"}
                        </Button>
                      </div>
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6"><code>{commandPackets.length > 1 ? buildBatchCommand(commandPackets) : packet.suggestedCommand}</code></pre>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">{commandPackets.length > 1 ? (locale === "zh" ? "批量执行 Prompt" : "Batch Executor Prompt") : (locale === "zh" ? "执行 Prompt" : "Executor Prompt")}</div>
                      <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white shadow-sm" onClick={() => handleCopy(commandPackets.length > 1 ? commandPackets.map((item) => item.prompt).join("\n\n---\n\n") : packet.prompt)}>
                        <Copy className="h-4 w-4" />
                        {locale === "zh" ? "复制" : "Copy"}
                      </Button>
                    </div>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-600"><code>{commandPackets.length > 1 ? commandPackets.map((item) => `# ${item.title}\n${item.prompt}`).join("\n\n---\n\n") : packet.prompt}</code></pre>
                  </div>

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
                  {locale === "zh" ? "先在左侧任务卡上点击 `生成交接包`。" : "Click `Generate Handoff` on a task card first."}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
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

          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
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

          <Card className="border-slate-200/80 bg-[linear-gradient(180deg,_rgba(255,255,255,1)_0%,_rgba(248,250,252,1)_100%)] shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
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

          <Card className="border-slate-200/80 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
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
                            {new Date(summary.createdAt).toLocaleString()} · {batchStrategyLabel[locale][summary.strategy]}
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
                              onClick={() => task && setSelectedTaskId(task.id)}
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
              {runHistory.length ? runHistory.map((record) => (
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-full border border-transparent hover:border-slate-200 hover:bg-slate-50"
                      onClick={() => setSelectedTaskId(record.taskId)}
                    >
                      {locale === "zh" ? "定位任务" : "Open Task"}
                    </Button>
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
              )) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  {locale === "zh" ? "还没有执行记录。先生成 handoff，再点击运行。" : "No execution records yet. Generate a handoff first, then run it."}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Clipboard; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-center gap-2 text-slate-500">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-[0.18em]">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
