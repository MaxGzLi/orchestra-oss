import type { CommandPacket } from "@/lib/orchestra/commander";
import type { OrchestraBoard, OrchestraRunRecord, OrchestraTask } from "@/lib/orchestra/types";

export type ExecutorStage = "preview" | "armed" | "live";

export interface ExecutorDiagnostic {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  tone: "emerald" | "amber";
}

export interface ExecutorRunResult {
  executor: CommandPacket["executor"];
  mode: "dry_run" | "live";
  command: string;
  args: string[];
  shellPreview: string;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface ExecutorLogItem {
  task: OrchestraTask;
  result: ExecutorRunResult;
  status: OrchestraRunRecord["status"];
  shouldAdvance: boolean;
}

export interface BatchExecutionPlan {
  runnable: boolean;
  reason: string;
}

export interface OrchestraExecutorAdapter {
  id: string;
  name: string;
  description: string;
  supportsLive: boolean;
  commandHints: string[];
  execute(packet: CommandPacket, task: OrchestraTask, board: OrchestraBoard): ExecutorRunResult;
}

export function isTaskRunnable(
  task: OrchestraTask,
  board: OrchestraBoard,
  batchTaskIds: Set<string>,
  completedInBatch: Set<string>,
): BatchExecutionPlan {
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

export const simulatedExecutorAdapter: OrchestraExecutorAdapter = {
  id: "simulated-local",
  name: "Simulated Local",
  description: "Runs a safe local dry-run and produces deterministic output for demos.",
  supportsLive: false,
  commandHints: ["echo"],
  execute(packet) {
    return {
      executor: packet.executor,
      mode: "dry_run",
      command: packet.bridge.command,
      args: packet.bridge.args,
      shellPreview: packet.bridge.shellPreview,
      stdout: [
        `Simulated ${packet.executor} handoff.`,
        `Objective: ${packet.objective}`,
        `Success criteria: ${packet.successCriteria.join("; ")}`,
      ].join("\n"),
      stderr: "No stderr. This open-source demo runs in local simulation mode.",
      durationMs: 320,
    };
  },
};

export const cliPreviewExecutorAdapter: OrchestraExecutorAdapter = {
  id: "cli-preview",
  name: "CLI Preview",
  description: "Prepares shell-oriented handoff output without invoking external CLIs yet.",
  supportsLive: false,
  commandHints: ["codex", "claude-code"],
  execute(packet, task) {
    return {
      executor: packet.executor,
      mode: "dry_run",
      command: packet.bridge.command,
      args: packet.bridge.args,
      shellPreview: packet.bridge.shellPreview,
      stdout: [
        "Prepared CLI preview handoff.",
        `Task: ${task.title}`,
        `Command: ${packet.bridge.command || "(missing)"}`,
        `Args: ${packet.bridge.args.join(" | ") || "(none)"}`,
        `Shell preview: ${packet.bridge.shellPreview}`,
        "Next step: wire this adapter to a real Codex / Claude Code process runner.",
      ].join("\n"),
      stderr: packet.bridge.failureHints.length
        ? `No process was launched. ${packet.bridge.failureHints.join(" ")}`
        : "No process was launched. This adapter is a preview bridge for future live execution.",
      durationMs: 120,
    };
  },
};

export const reviewerExecutorAdapter: OrchestraExecutorAdapter = {
  id: "reviewer-preview",
  name: "Reviewer Preview",
  description: "Simulates a review-focused pass that emphasizes risks and acceptance checks.",
  supportsLive: false,
  commandHints: ["review", "checklist"],
  execute(packet, task) {
    return {
      executor: packet.executor,
      mode: "dry_run",
      command: packet.bridge.command,
      args: packet.bridge.args,
      shellPreview: packet.bridge.shellPreview,
      stdout: [
        "Prepared review-oriented execution summary.",
        `Task: ${task.title}`,
        `Acceptance checks: ${task.acceptance.length}`,
        "This mode is useful when you want to validate the handoff shape before coding.",
      ].join("\n"),
      stderr: "No stderr. Reviewer preview mode does not call any external tools.",
      durationMs: 180,
    };
  },
};

export const executorAdapters: OrchestraExecutorAdapter[] = [
  simulatedExecutorAdapter,
  cliPreviewExecutorAdapter,
  reviewerExecutorAdapter,
];

export function buildExecutorDiagnostics(args: {
  adapter: OrchestraExecutorAdapter;
  stage: ExecutorStage;
  packetCount: number;
  codexTemplate: string;
  claudeTemplate: string;
}): ExecutorDiagnostic[] {
  const { adapter, stage, packetCount, codexTemplate, claudeTemplate } = args;
  const hasTemplates = Boolean(codexTemplate.trim() && claudeTemplate.trim());

  return [
    {
      id: "adapter-stage",
      label: "Adapter stage",
      ok: stage !== "live" || adapter.supportsLive,
      detail: stage === "live" && !adapter.supportsLive
        ? `${adapter.name} is still a safe stub and cannot enter live execution yet.`
        : `${adapter.name} can operate in ${stage} mode for this demo flow.`,
      tone: stage === "live" && !adapter.supportsLive ? "amber" : "emerald",
    },
    {
      id: "templates",
      label: "Command templates",
      ok: hasTemplates,
      detail: hasTemplates
        ? "Both command templates are configured."
        : "Codex and Claude Code command templates must both be configured.",
      tone: hasTemplates ? "emerald" : "amber",
    },
    {
      id: "packet-count",
      label: "Batch payload",
      ok: packetCount > 0,
      detail: packetCount > 0
        ? `${packetCount} task handoff packets are ready.`
        : "No handoff packets are ready for execution.",
      tone: packetCount > 0 ? "emerald" : "amber",
    },
    {
      id: "command-hints",
      label: "CLI hints",
      ok: true,
      detail: `Expected command prefixes: ${adapter.commandHints.join(", ")}.`,
      tone: "emerald",
    },
  ];
}

export function runBatchWithAdapter(args: {
  adapter: OrchestraExecutorAdapter;
  board: OrchestraBoard;
  tasks: OrchestraTask[];
  packets: CommandPacket[];
  stage?: ExecutorStage;
}): ExecutorLogItem[] {
  const { adapter, board, tasks, packets, stage = "preview" } = args;
  const completedInBatch = new Set<string>();
  const batchTaskIds = new Set(tasks.map((task) => task.id));
  const executionLog: ExecutorLogItem[] = [];

  if (stage === "live" && !adapter.supportsLive) {
    return tasks.map((task, index) => ({
      task,
      status: "failed",
      shouldAdvance: false,
      result: {
        executor: packets[index]?.executor ?? task.owner,
        mode: "dry_run",
        command: packets[index]?.bridge.command ?? "",
        args: packets[index]?.bridge.args ?? [],
        shellPreview: packets[index]?.bridge.shellPreview ?? "",
        stdout: `Skipped ${task.title}.`,
        stderr: `${adapter.name} does not support live execution in this demo.`,
        durationMs: 0,
      },
    }));
  }

  for (const [index, task] of tasks.entries()) {
    const packet = packets[index];
    const gate = isTaskRunnable(task, board, batchTaskIds, completedInBatch);

    if (!gate.runnable) {
      executionLog.push({
        task,
        status: "failed",
        shouldAdvance: false,
        result: {
          executor: packet.executor,
          mode: "dry_run",
          command: packet.bridge.command,
          args: packet.bridge.args,
          shellPreview: packet.bridge.shellPreview,
          stdout: `Skipped ${task.title}.`,
          stderr: gate.reason,
          durationMs: 0,
        },
      });
      continue;
    }

    const result = adapter.execute(packet, task, board);
    executionLog.push({
      task,
      result: {
        ...result,
        mode: stage === "live" && adapter.supportsLive ? "live" : result.mode,
      },
      status: "succeeded",
      shouldAdvance: true,
    });
    completedInBatch.add(task.id);
  }

  return executionLog;
}
