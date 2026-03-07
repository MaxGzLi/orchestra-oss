import type { CommandPacket } from "@/lib/orchestra/commander";
import type { OrchestraBoard, OrchestraRunRecord, OrchestraTask } from "@/lib/orchestra/types";

export interface ExecutorRunResult {
  executor: CommandPacket["executor"];
  mode: "dry_run" | "live";
  command: string;
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
  execute(packet) {
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
  },
};

export const cliPreviewExecutorAdapter: OrchestraExecutorAdapter = {
  id: "cli-preview",
  name: "CLI Preview",
  description: "Prepares shell-oriented handoff output without invoking external CLIs yet.",
  execute(packet, task) {
    return {
      executor: packet.executor,
      mode: "dry_run",
      command: packet.suggestedCommand,
      stdout: [
        "Prepared CLI preview handoff.",
        `Task: ${task.title}`,
        `Command: ${packet.suggestedCommand}`,
        "Next step: wire this adapter to a real Codex / Claude Code process runner.",
      ].join("\n"),
      stderr: "No process was launched. This adapter is a preview bridge for future live execution.",
      durationMs: 120,
    };
  },
};

export const reviewerExecutorAdapter: OrchestraExecutorAdapter = {
  id: "reviewer-preview",
  name: "Reviewer Preview",
  description: "Simulates a review-focused pass that emphasizes risks and acceptance checks.",
  execute(packet, task) {
    return {
      executor: packet.executor,
      mode: "dry_run",
      command: packet.suggestedCommand,
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

export function runBatchWithAdapter(args: {
  adapter: OrchestraExecutorAdapter;
  board: OrchestraBoard;
  tasks: OrchestraTask[];
  packets: CommandPacket[];
}): ExecutorLogItem[] {
  const { adapter, board, tasks, packets } = args;
  const completedInBatch = new Set<string>();
  const batchTaskIds = new Set(tasks.map((task) => task.id));
  const executionLog: ExecutorLogItem[] = [];

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
          command: packet.suggestedCommand,
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
      result,
      status: "succeeded",
      shouldAdvance: true,
    });
    completedInBatch.add(task.id);
  }

  return executionLog;
}
