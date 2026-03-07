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

export interface CommandTemplateConfig {
  codex: string;
  claude_code: string;
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

function applyTemplate(template: string, task: OrchestraTask): string {
  return template
    .replaceAll("{title}", task.title.replace(/"/g, '\\"'))
    .replaceAll("{summary}", task.summary.replace(/"/g, '\\"'))
    .replaceAll("{owner}", ownerDisplayName(task.owner));
}

function buildSuggestedCommand(executor: OrchestraExecutor, task: OrchestraTask, templates: CommandTemplateConfig): string {
  if (executor === "codex") {
    return applyTemplate(templates.codex, task);
  }

  if (executor === "claude_code") {
    return applyTemplate(templates.claude_code, task);
  }

  return `echo "Route ${task.title.replace(/"/g, '\\"')} to ${ownerDisplayName(executor)}"`;
}

export function buildCommandPacket(
  feature: OrchestraFeatureIdea,
  task: OrchestraTask,
  executor: OrchestraExecutor,
  templates: CommandTemplateConfig = {
    codex: 'codex exec "{title}: {summary}"',
    claude_code: 'claude-code run "{title}: {summary}"',
  },
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
    suggestedCommand: buildSuggestedCommand(executor, task, templates),
    prompt,
  };
}
