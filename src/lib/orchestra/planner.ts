import type {
  OrchestraBoard,
  OrchestraExecutor,
  OrchestraFeatureIdea,
  OrchestraTask,
  OrchestraTaskKind,
} from "@/lib/orchestra/types";

function toIdFragment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function chooseExecutor(kind: OrchestraTaskKind): OrchestraExecutor {
  switch (kind) {
    case "implementation":
    case "launch":
      return "codex";
    case "research":
    case "review":
      return "claude_code";
    case "spec":
      return "commander";
    case "brief":
      return "human";
  }
}

export function buildBoardFromIdea(idea: OrchestraFeatureIdea): OrchestraBoard {
  const baseId = toIdFragment(idea.title) || idea.id;
  const tasks: OrchestraTask[] = [
    {
      id: `${baseId}-brief`,
      title: "Clarify feature brief",
      summary: `Define the scope, user value, and non-negotiable constraints for ${idea.title}.`,
      state: "planning",
      kind: "brief",
      owner: "planner",
      dependsOn: [],
      acceptance: [
        "Problem statement is explicit",
        "Goals are ranked by impact",
        "Constraints are documented",
      ],
      lane: "strategy",
    },
    {
      id: `${baseId}-plan`,
      title: "Generate execution graph",
      summary: "Commander converts the brief into tasks, dependencies, and executor assignments.",
      state: "ready",
      kind: "spec",
      owner: chooseExecutor("spec"),
      dependsOn: [`${baseId}-brief`],
      acceptance: [
        "Every task has an owner",
        "Review and rollback steps exist",
        "Parallel work is separated from serial work",
      ],
      lane: "planning",
    },
    {
      id: `${baseId}-codex`,
      title: "Codex implementation slice",
      summary: "Concrete repository changes, local verification, and code-oriented execution.",
      state: "ready",
      kind: "implementation",
      owner: chooseExecutor("implementation"),
      dependsOn: [`${baseId}-plan`],
      acceptance: [
        "Implementation path is explicit",
        "Tests or verification steps are attached",
      ],
      lane: "execution",
    },
    {
      id: `${baseId}-claude`,
      title: "Claude Code review and ambiguity slice",
      summary: "Handle architecture review, specification refinement, and high-context reasoning.",
      state: "ready",
      kind: "review",
      owner: chooseExecutor("review"),
      dependsOn: [`${baseId}-plan`],
      acceptance: [
        "Open questions are resolved",
        "Architecture risks are called out",
      ],
      lane: "execution",
    },
    {
      id: `${baseId}-portfolio`,
      title: "Portfolio checkpoint",
      summary: "Review progress from product, timing, and commercial angles.",
      state: "intake",
      kind: "launch",
      owner: "portfolio",
      dependsOn: [`${baseId}-codex`, `${baseId}-claude`],
      acceptance: [
        "Impact hypothesis is updated",
        "Follow-on opportunities are captured",
      ],
      lane: "governance",
    },
  ];

  return {
    feature: idea,
    tasks,
    suggestions: [
      "Feature work can begin from this brief immediately; you do not need to create issues first.",
      "Commander should split large implementation slices again if either executor receives a vague task.",
      "Portfolio should only influence priority and scope, not override repository-level safety checks.",
    ],
  };
}

export function summarizeByOwner(tasks: OrchestraTask[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.owner] = (acc[task.owner] ?? 0) + 1;
    return acc;
  }, {});
}
