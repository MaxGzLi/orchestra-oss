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
  Sparkles,
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
  OrchestraRunRecord,
  OrchestraScenario,
  OrchestraTask,
  OrchestraTaskState,
  OrchestraTimelineEvent,
} from "@/lib/orchestra/types";

type Locale = "zh" | "en";
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
  if (typeof window === "undefined") {
    return "zh";
  }

  const stored = window.localStorage.getItem(LOCALE_KEY);
  return stored === "en" ? "en" : "zh";
}

function getInitialSnapshot() {
  if (typeof window === "undefined") {
    const board = getDefaultOrchestraBoard();
    return {
      board,
      selectedTaskId: board.tasks[0]?.id ?? "",
      runHistory: [] as OrchestraRunRecord[],
      timeline: [] as OrchestraTimelineEvent[],
    };
  }

  const raw = window.localStorage.getItem(STATE_KEY);
  if (!raw) {
    const board = getDefaultOrchestraBoard();
    return {
      board,
      selectedTaskId: board.tasks[0]?.id ?? "",
      runHistory: [] as OrchestraRunRecord[],
      timeline: [] as OrchestraTimelineEvent[],
    };
  }

  try {
    const parsed = JSON.parse(raw) as {
      board: OrchestraBoard;
      selectedTaskId: string;
      runHistory: OrchestraRunRecord[];
      timeline: OrchestraTimelineEvent[];
    };
    return {
      board: parsed.board,
      selectedTaskId: parsed.selectedTaskId,
      runHistory: parsed.runHistory ?? [],
      timeline: parsed.timeline ?? [],
    };
  } catch {
    const board = getDefaultOrchestraBoard();
    return {
      board,
      selectedTaskId: board.tasks[0]?.id ?? "",
      runHistory: [] as OrchestraRunRecord[],
      timeline: [] as OrchestraTimelineEvent[],
    };
  }
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

  const dictionary: Record<string, { title: string; summary: string; acceptance: string[] }> = {
    "brief-clarify": {
      title: "澄清功能简报",
      summary: "把原始功能请求整理成明确的目标、约束和上线意图。",
      acceptance: ["目标和约束已明确", "下游 agent 无需猜测即可继续规划"],
    },
    "plan-graph": {
      title: "生成任务图",
      summary: "把工作拆成规划、实现和评审切片，并明确依赖关系。",
      acceptance: ["任务顺序清晰", "每个任务都有明确执行者"],
    },
    "exec-board-ui": {
      title: "构建编排看板 UI",
      summary: "创建用于展示 agents、进度和功能规划的看板界面。",
      acceptance: ["看板视图已渲染", "Agent roster 可见", "规划输入可编辑"],
    },
    "exec-command-protocol": {
      title: "定义 Commander 交接协议",
      summary: "明确 Commander 如何把任务分派给 Codex 或 Claude Code。",
      acceptance: ["执行者选择规则清晰", "评审路径已定义", "歧义任务会升级回 Commander"],
    },
    "review-governance": {
      title: "进行 Portfolio Review",
      summary: "从产品和商业角度评估这个 board 是否真正提升了决策效率。",
      acceptance: ["风险已暴露", "商业机会已记录"],
    },
  };

  return dictionary[task.id] ?? {
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

function updateTaskState(task: OrchestraTask): OrchestraTask {
  if (task.kind === "implementation") {
    return { ...task, state: "review" };
  }
  return { ...task, state: "done" };
}

export function OrchestraBoard() {
  const initialSnapshot = getInitialSnapshot();
  const [locale, setLocale] = useState<Locale>(getInitialLocale);
  const [board, setBoard] = useState<OrchestraBoard>(initialSnapshot.board);
  const [title, setTitle] = useState(board.feature.title);
  const [problem, setProblem] = useState(board.feature.problem);
  const [goals, setGoals] = useState(board.feature.goals.join("\n"));
  const [constraints, setConstraints] = useState(board.feature.constraints.join("\n"));
  const [selectedTaskId, setSelectedTaskId] = useState(initialSnapshot.selectedTaskId);
  const [packet, setPacket] = useState<CommandPacket | null>(null);
  const [runResult, setRunResult] = useState<DemoResult | null>(null);
  const [runHistory, setRunHistory] = useState<OrchestraRunRecord[]>(initialSnapshot.runHistory);
  const [timeline, setTimeline] = useState<OrchestraTimelineEvent[]>(initialSnapshot.timeline);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(orchestraScenarios[0]?.id ?? "");

  const taskCounts = useMemo(() => summarizeByOwner(board.tasks), [board.tasks]);
  const laneMap = useMemo(
    () => laneOrder.map((lane) => ({ lane, tasks: board.tasks.filter((task) => task.lane === lane) })),
    [board.tasks],
  );
  const selectedTask = useMemo(
    () => board.tasks.find((task) => task.id === selectedTaskId) ?? board.tasks[0] ?? null,
    [board.tasks, selectedTaskId],
  );
  const selectedTimeline = timeline.filter((event) => event.taskId === selectedTaskId);
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
        timeline,
      }),
    );
  }, [board, selectedTaskId, runHistory, timeline]);

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
    setTimeline([]);
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
    setTimeline([]);
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
    setTimeline([]);
    setSelectedScenarioId(orchestraScenarios[0]?.id ?? "");
  }

  function handleGenerateHandoff(task: OrchestraTask) {
    setSelectedTaskId(task.id);
    setPacket(buildCommandPacket(board.feature, task, task.owner));
    setRunResult(null);
  }

  function handleRunPacket() {
    if (!packet || !selectedTask) {
      return;
    }

    const result = buildDemoResult(packet);
    const record = buildRunRecord(selectedTask.id, result);
    const nextTimeline = buildTimeline(selectedTask.id, record.id, locale);

    setRunResult(result);
    setRunHistory((current) => [record, ...current].slice(0, 20));
    setTimeline((current) => [...nextTimeline.reverse(), ...current].slice(0, 80));
    setBoard((current) => ({
      ...current,
      tasks: current.tasks.map((task) => (task.id === selectedTask.id ? updateTaskState(task) : task)),
    }));
  }

  async function handleCopy(text: string) {
    await navigator.clipboard.writeText(text);
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
            <MetricCard icon={Clipboard} label={locale === "zh" ? "任务数" : "Tasks"} value={String(board.tasks.length)} />
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
          <CardContent className="grid gap-4 xl:grid-cols-2">
            {laneMap.map(({ lane, tasks }) => (
              <div key={lane} className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.85)_0%,_rgba(248,250,252,0.96)_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-slate-900">{laneLabels[locale][lane]}</h3>
                    <p className="text-xs text-slate-500">{tasks.length} {locale === "zh" ? "个任务" : "tasks"}</p>
                  </div>
                  <Badge variant="outline" className="rounded-full border-slate-300 bg-white text-slate-700">
                    {laneLabels[locale][lane]}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const translatedTask = translateTask(task, locale);
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.45)] transition-all",
                          selectedTaskId === task.id && "border-slate-300 ring-2 ring-slate-950/10",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-slate-900">{translatedTask.title}</div>
                            <p className="mt-1 text-sm leading-7 text-slate-600">{translatedTask.summary}</p>
                          </div>
                          <Badge className={cn("rounded-full border", stateTone[task.state])}>{statusLabel[locale][task.state]}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Badge className={cn("rounded-full", ownerTone[task.owner])}>{ownerLabel(task.owner, locale)}</Badge>
                          <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">
                            {kindLabel(task.kind, locale)}
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
                    );
                  })}
                </div>
              </div>
            ))}
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
                {locale === "zh" ? "查看选中任务的上下文、时间线和交接信息。" : "Inspect the selected task context, timeline, and handoff."}
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
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{locale === "zh" ? "依赖" : "Dependencies"}</div>
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {selectedTask.dependsOn.length ? selectedTask.dependsOn.map((dep) => <div key={dep}>{dep}</div>) : <div>{locale === "zh" ? "无依赖" : "No dependencies"}</div>}
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
                <Cpu className="h-5 w-5 text-slate-950" />
                {locale === "zh" ? "Commander 控制台" : "Commander Console"}
              </CardTitle>
              <CardDescription>
                {locale === "zh" ? "这里会生成执行 handoff，并用本地模拟模式演示 run。" : "This generates execution handoffs and demonstrates runs in local simulation mode."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {packet ? (
                <>
                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{packet.title}</div>
                        <p className="mt-1 text-sm text-slate-600">{packet.reasoning}</p>
                      </div>
                      <Badge className={cn("rounded-full", ownerTone[packet.executor])}>{ownerLabel(packet.executor, locale)}</Badge>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-900/80 bg-slate-950 p-4 text-slate-100 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.6)]">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Suggested Command</div>
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" className="rounded-full" onClick={() => handleCopy(packet.suggestedCommand)}>
                          <Copy className="h-4 w-4" />
                          {locale === "zh" ? "复制" : "Copy"}
                        </Button>
                        <Button size="sm" className="rounded-full bg-white text-slate-950 shadow-sm hover:bg-slate-100" onClick={handleRunPacket}>
                          <Cpu className="h-4 w-4" />
                          {locale === "zh" ? "运行" : "Run"}
                        </Button>
                      </div>
                    </div>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm leading-6"><code>{packet.suggestedCommand}</code></pre>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-900">{locale === "zh" ? "执行 Prompt" : "Executor Prompt"}</div>
                      <Button variant="outline" size="sm" className="rounded-full border-slate-200 bg-white shadow-sm" onClick={() => handleCopy(packet.prompt)}>
                        <Copy className="h-4 w-4" />
                        {locale === "zh" ? "复制" : "Copy"}
                      </Button>
                    </div>
                    <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-6 text-slate-600"><code>{packet.prompt}</code></pre>
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
              {runHistory.length ? runHistory.map((record) => (
                <div key={record.id} className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#fbfdff_100%)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-slate-900">{record.taskId}</div>
                      <p className="mt-1 text-xs text-slate-500">{new Date(record.createdAt).toLocaleString()} · {locale === "zh" ? "演练模式" : "dry_run"} · {record.durationMs}ms</p>
                    </div>
                    <Badge className={cn("rounded-full", ownerTone[record.executor])}>{ownerLabel(record.executor, locale)}</Badge>
                  </div>
                  <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-600"><code>{record.command} {record.args.join(" ")}</code></pre>
                  <div className="mt-3 flex items-center justify-end">
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
