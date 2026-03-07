import type {
  OrchestraBoard,
  OrchestraExecutor,
  OrchestraFeatureIdea,
  OrchestraTask,
  OrchestraTaskKind,
  OrchestraTemplateId,
} from "@/lib/orchestra/types";

function toIdFragment(value: string) {
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

type TaskFactory = {
  id: string;
  title: string;
  summary: (idea: OrchestraFeatureIdea) => string;
  state: OrchestraTask["state"];
  kind: OrchestraTaskKind;
  priority: OrchestraTask["priority"];
  owner: OrchestraExecutor;
  dependsOn: string[];
  acceptance: string[];
  lane: OrchestraTask["lane"];
};

const templateDefinitions: Record<
  OrchestraTemplateId,
  {
    tasks: TaskFactory[];
    suggestions: string[];
  }
> = {
  delivery: {
    tasks: [
      {
        id: "brief",
        title: "Clarify feature brief",
        summary: (idea) => `Define the scope, user value, and non-negotiable constraints for ${idea.title}.`,
        state: "planning",
        kind: "brief",
        priority: "high",
        owner: "planner",
        dependsOn: [],
        acceptance: ["Problem statement is explicit", "Goals are ranked by impact", "Constraints are documented"],
        lane: "strategy",
      },
      {
        id: "plan",
        title: "Generate execution graph",
        summary: () => "Commander converts the brief into tasks, dependencies, and executor assignments.",
        state: "ready",
        kind: "spec",
        priority: "high",
        owner: chooseExecutor("spec"),
        dependsOn: ["brief"],
        acceptance: ["Every task has an owner", "Review and rollback steps exist", "Parallel work is separated from serial work"],
        lane: "planning",
      },
      {
        id: "codex",
        title: "Codex implementation slice",
        summary: () => "Concrete repository changes, local verification, and code-oriented execution.",
        state: "ready",
        kind: "implementation",
        priority: "critical",
        owner: chooseExecutor("implementation"),
        dependsOn: ["plan"],
        acceptance: ["Implementation path is explicit", "Tests or verification steps are attached"],
        lane: "execution",
      },
      {
        id: "claude",
        title: "Claude Code review and ambiguity slice",
        summary: () => "Handle architecture review, specification refinement, and high-context reasoning.",
        state: "ready",
        kind: "review",
        priority: "medium",
        owner: chooseExecutor("review"),
        dependsOn: ["plan"],
        acceptance: ["Open questions are resolved", "Architecture risks are called out"],
        lane: "execution",
      },
      {
        id: "portfolio",
        title: "Portfolio checkpoint",
        summary: () => "Review progress from product, timing, and commercial angles.",
        state: "intake",
        kind: "launch",
        priority: "medium",
        owner: "portfolio",
        dependsOn: ["codex", "claude"],
        acceptance: ["Impact hypothesis is updated", "Follow-on opportunities are captured"],
        lane: "governance",
      },
    ],
    suggestions: [
      "Feature work can begin from this brief immediately; you do not need to create issues first.",
      "Commander should split large implementation slices again if either executor receives a vague task.",
      "Portfolio should only influence priority and scope, not override repository-level safety checks.",
    ],
  },
  release: {
    tasks: [
      {
        id: "launch-brief",
        title: "Clarify launch scope",
        summary: (idea) => `Define the release scope, rollout criteria, and launch constraints for ${idea.title}.`,
        state: "planning",
        kind: "brief",
        priority: "high",
        owner: "planner",
        dependsOn: [],
        acceptance: ["Launch scope is explicit", "Readiness criteria are documented", "Rollback conditions are known"],
        lane: "strategy",
      },
      {
        id: "release-plan",
        title: "Build launch checklist graph",
        summary: () => "Commander turns launch work into engineering, QA, docs, and rollout slices.",
        state: "ready",
        kind: "spec",
        priority: "high",
        owner: "commander",
        dependsOn: ["launch-brief"],
        acceptance: ["Owners exist for QA, docs, and rollout", "Risk checkpoints are sequenced"],
        lane: "planning",
      },
      {
        id: "qa-rollout",
        title: "QA and rollout implementation",
        summary: () => "Codex handles release-critical implementation, verification, and rollout tasks.",
        state: "ready",
        kind: "implementation",
        priority: "critical",
        owner: "codex",
        dependsOn: ["release-plan"],
        acceptance: ["Verification path is explicit", "Rollback steps are attached"],
        lane: "execution",
      },
      {
        id: "docs-review",
        title: "Docs and release review",
        summary: () => "Claude Code reviews release notes, launch risks, and ambiguous release decisions.",
        state: "ready",
        kind: "review",
        priority: "high",
        owner: "claude_code",
        dependsOn: ["release-plan"],
        acceptance: ["Release communication is coherent", "Open launch risks are documented"],
        lane: "execution",
      },
      {
        id: "readiness",
        title: "Readiness checkpoint",
        summary: () => "Portfolio reviews release readiness, launch timing, and follow-on opportunities.",
        state: "intake",
        kind: "launch",
        priority: "medium",
        owner: "portfolio",
        dependsOn: ["qa-rollout", "docs-review"],
        acceptance: ["Launch go/no-go is explicit", "Post-launch follow-up work is captured"],
        lane: "governance",
      },
    ],
    suggestions: [
      "Use this template when release readiness matters more than greenfield implementation.",
      "Keep QA, docs, and rollout work visible instead of burying it inside a generic implementation task.",
      "Review launch risk before execution tasks are marked complete.",
    ],
  },
  support: {
    tasks: [
      {
        id: "signal-brief",
        title: "Clarify support signal",
        summary: (idea) => `Define the recurring user pain, business impact, and expected fix scope for ${idea.title}.`,
        state: "planning",
        kind: "brief",
        priority: "high",
        owner: "planner",
        dependsOn: [],
        acceptance: ["Support signal is recurring", "User impact is explicit", "Desired outcome is scoped"],
        lane: "strategy",
      },
      {
        id: "research-pattern",
        title: "Research support pattern",
        summary: () => "Claude Code groups the support issue into patterns, root causes, and open questions.",
        state: "ready",
        kind: "research",
        priority: "high",
        owner: "claude_code",
        dependsOn: ["signal-brief"],
        acceptance: ["Root causes are listed", "False positives are ruled out"],
        lane: "planning",
      },
      {
        id: "fix-plan",
        title: "Plan support autofix slice",
        summary: () => "Commander turns the support pattern into a fix slice, review path, and follow-up checks.",
        state: "ready",
        kind: "spec",
        priority: "high",
        owner: "commander",
        dependsOn: ["research-pattern"],
        acceptance: ["Fix scope is explicit", "Review path exists", "Support follow-up is attached"],
        lane: "planning",
      },
      {
        id: "autofix",
        title: "Implement support fix",
        summary: () => "Codex delivers the fix, local validation, and instrumentation updates if needed.",
        state: "ready",
        kind: "implementation",
        priority: "critical",
        owner: "codex",
        dependsOn: ["fix-plan"],
        acceptance: ["Fix is testable", "Support impact can be verified"],
        lane: "execution",
      },
      {
        id: "impact-review",
        title: "Impact and prioritization review",
        summary: () => "Portfolio reviews whether the fix reduces support load and what related opportunities it opens.",
        state: "intake",
        kind: "review",
        priority: "medium",
        owner: "portfolio",
        dependsOn: ["autofix"],
        acceptance: ["Support outcome is measurable", "Next support opportunities are captured"],
        lane: "governance",
      },
    ],
    suggestions: [
      "Use this template when repeated support pain points are driving feature planning.",
      "Separate research from implementation so recurring support issues are not overfit too early.",
      "Track impact after the fix, not only whether the code shipped.",
    ],
  },
};

export function buildBoardFromIdea(
  idea: OrchestraFeatureIdea,
  template: OrchestraTemplateId = "delivery",
): OrchestraBoard {
  const baseId = toIdFragment(idea.title) || idea.id;
  const definition = templateDefinitions[template];
  const tasks: OrchestraTask[] = definition.tasks.map((task) => ({
    id: `${baseId}-${task.id}`,
    title: task.title,
    summary: task.summary(idea),
    state: task.state,
    kind: task.kind,
    priority: task.priority,
    owner: task.owner,
    dependsOn: task.dependsOn.map((dependencyId) => `${baseId}-${dependencyId}`),
    acceptance: task.acceptance,
    lane: task.lane,
    comments: [],
  }));

  return {
    feature: idea,
    tasks,
    suggestions: definition.suggestions,
  };
}

export function summarizeByOwner(tasks: OrchestraTask[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.owner] = (acc[task.owner] ?? 0) + 1;
    return acc;
  }, {});
}

export const orchestraTemplates: Array<{ id: OrchestraTemplateId; label: string; description: string }> = [
  {
    id: "delivery",
    label: "Delivery",
    description: "Balanced template for feature delivery with planning, execution, and governance.",
  },
  {
    id: "release",
    label: "Release",
    description: "Launch-oriented template for QA, rollout readiness, and go/no-go review.",
  },
  {
    id: "support",
    label: "Support",
    description: "Intake-heavy template for turning repeated support pain into structured fixes.",
  },
];
