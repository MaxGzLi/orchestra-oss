import type { OrchestraExecutor, OrchestraFeatureIdea, OrchestraTask } from "@/lib/orchestra/types";

export interface CommandPacket {
  executor: OrchestraExecutor;
  title: string;
  reasoning: string;
  objective: string;
  successCriteria: string[];
  constraints: string[];
  context: string[];
  suggestedCommand: string;
  prompt: string;
}

function ownerDisplayName(executor: OrchestraExecutor): string {
  switch (executor) {
    case "claude_code":
      return "Claude Code";
    case "codex":
      return "Codex";
    case "commander":
      return "Commander";
    case "planner":
      return "Planner";
    case "portfolio":
      return "Portfolio";
    case "human":
      return "Human";
  }
}

function buildSuggestedCommand(executor: OrchestraExecutor, task: OrchestraTask): string {
  const escapedTitle = task.title.replace(/"/g, '\\"');
  const escapedSummary = task.summary.replace(/"/g, '\\"');

  if (executor === "codex") {
    return `codex exec "${escapedTitle}: ${escapedSummary}"`;
  }

  if (executor === "claude_code") {
    return `claude-code run "${escapedTitle}: ${escapedSummary}"`;
  }

  return `echo "Route ${escapedTitle} to ${ownerDisplayName(executor)}"`;
}

export function buildCommandPacket(
  feature: OrchestraFeatureIdea,
  task: OrchestraTask,
  executor: OrchestraExecutor,
): CommandPacket {
  const dependsOn = task.dependsOn.length
    ? [`Dependencies: ${task.dependsOn.join(", ")}`]
    : ["Dependencies: none"];

  const constraints = [
    ...feature.constraints,
    "Do not expand scope without routing back to Commander.",
    "Stop and surface blockers instead of guessing through ambiguity.",
  ];

  const context = [
    `Feature: ${feature.title}`,
    `Problem: ${feature.problem}`,
    ...feature.goals.map((goal) => `Goal: ${goal}`),
    ...feature.notes.map((note) => `Note: ${note}`),
    ...dependsOn,
  ];

  const reasoning =
    executor === "codex"
      ? "This task is execution-oriented and should be handled by the coding agent with the shortest code-test loop."
      : executor === "claude_code"
        ? "This task benefits from higher-context reasoning, review discipline, or architecture-sensitive judgment."
        : "This task stays outside the normal executor path.";

  const prompt = [
    `You are ${ownerDisplayName(executor)} working inside an Orchestra-managed delivery flow.`,
    `Task: ${task.title}`,
    `Summary: ${task.summary}`,
    "",
    "Mission:",
    `- ${task.summary}`,
    "",
    "Acceptance Criteria:",
    ...task.acceptance.map((criterion) => `- ${criterion}`),
    "",
    "Feature Context:",
    ...context.map((line) => `- ${line}`),
    "",
    "Constraints:",
    ...constraints.map((line) => `- ${line}`),
    "",
    "Operating Rules:",
    "- Preserve clear task boundaries.",
    "- Report blockers, risks, or unclear ownership back to Commander.",
    "- Prefer incremental, reviewable progress over broad speculative edits.",
  ].join("\n");

  return {
    executor,
    title: task.title,
    reasoning,
    objective: task.summary,
    successCriteria: task.acceptance,
    constraints,
    context,
    suggestedCommand: buildSuggestedCommand(executor, task),
    prompt,
  };
}
