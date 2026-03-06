import type { AgentProfile, OrchestraBoard, OrchestraFeatureIdea, OrchestraTask } from "@/lib/orchestra/types";

export const orchestraAgents: AgentProfile[] = [
  {
    id: "commander",
    name: "Commander",
    role: "Orchestration lead",
    mission: "Owns the plan, assigns work, and keeps Codex and Claude Code aligned.",
    strengths: ["Sequencing", "task decomposition", "cross-agent handoff"],
    commandStyle: "Turns a feature brief into executable slices and routes each slice to the best executor.",
  },
  {
    id: "planner",
    name: "Planner",
    role: "Product and architecture planner",
    mission: "Expands a feature idea into a concrete delivery plan.",
    strengths: ["Discovery", "scope framing", "acceptance criteria"],
    commandStyle: "Produces task graphs, constraints, and rollout notes before coding starts.",
  },
  {
    id: "codex",
    name: "Codex",
    role: "Implementation agent",
    mission: "Executes code changes, tests, and repository-aware tasks.",
    strengths: ["Code edits", "test loops", "repo exploration"],
    commandStyle: "Best for concrete coding tasks with clear acceptance criteria and shell/tool usage.",
  },
  {
    id: "claude_code",
    name: "Claude Code",
    role: "Reasoning-heavy engineering agent",
    mission: "Handles deeper analysis, planning refinements, and review-oriented execution.",
    strengths: ["Large-context reasoning", "design review", "requirements refinement"],
    commandStyle: "Best for ambiguous changes, review passes, and architecture-sensitive work.",
  },
  {
    id: "portfolio",
    name: "Portfolio",
    role: "Product and business oversight",
    mission: "Tracks global progress and suggests product or business opportunities.",
    strengths: ["Prioritization", "risk framing", "business feedback"],
    commandStyle: "Looks across the board and recommends what should change next.",
  },
];

const defaultFeature: OrchestraFeatureIdea = {
  id: "feat-orchestra",
  title: "Agent-native delivery board",
  problem: "Feature ideas are not flowing directly into coordinated autonomous execution.",
  goals: [
    "Start delivery from a feature brief rather than a pre-written issue",
    "Let Commander assign work to Codex and Claude Code",
    "Keep one portfolio agent aware of business and product opportunities",
  ],
  constraints: [
    "Must work without Linear",
    "Should support a self-built board",
    "Needs explicit review and governance stages",
  ],
  notes: [
    "This first prototype focuses on the planning and control surface.",
    "Execution commands are represented as protocol suggestions rather than live terminal sessions.",
  ],
};

const defaultTasks: OrchestraTask[] = [
  {
    id: "brief-clarify",
    title: "Clarify feature brief",
    summary: "Turn the raw feature request into explicit goals, constraints, and rollout intent.",
    state: "done",
    kind: "brief",
    owner: "planner",
    dependsOn: [],
    acceptance: ["Goals and constraints are explicit", "Downstream agents can plan without guessing"],
    lane: "strategy",
  },
  {
    id: "plan-graph",
    title: "Generate task graph",
    summary: "Split work into planning, implementation, and review slices with dependency edges.",
    state: "done",
    kind: "spec",
    owner: "commander",
    dependsOn: ["brief-clarify"],
    acceptance: ["Tasks are sequenced", "Each task has a clear executor"],
    lane: "planning",
  },
  {
    id: "exec-board-ui",
    title: "Build orchestration board UI",
    summary: "Create the board surface where agents, progress, and feature planning are visible.",
    state: "in_progress",
    kind: "implementation",
    owner: "codex",
    dependsOn: ["plan-graph"],
    acceptance: ["Board view renders lanes", "Agent roster is visible", "Planning input is editable"],
    lane: "execution",
  },
  {
    id: "exec-command-protocol",
    title: "Define Commander handoff protocol",
    summary: "Specify how Commander routes concrete work to Codex versus Claude Code.",
    state: "review",
    kind: "research",
    owner: "claude_code",
    dependsOn: ["plan-graph"],
    acceptance: ["Executor choice is explicit", "Review path is defined", "Ambiguous tasks escalate correctly"],
    lane: "execution",
  },
  {
    id: "review-governance",
    title: "Run portfolio review",
    summary: "Assess whether the board helps with product prioritization and commercial decision-making.",
    state: "ready",
    kind: "review",
    owner: "portfolio",
    dependsOn: ["exec-board-ui", "exec-command-protocol"],
    acceptance: ["Risks are surfaced", "Business opportunities are documented"],
    lane: "governance",
  },
];

const defaultSuggestions = [
  "Use Codex for repo-local implementation tasks with deterministic outputs and test loops.",
  "Use Claude Code for planning, ambiguous refactors, and review-heavy work that benefits from longer reasoning.",
  "Keep Commander as the only role allowed to change task ownership or split tasks.",
  "Add a launch lane once you start tracking rollout, feedback, and revenue outcomes.",
];

export function getDefaultOrchestraBoard(): OrchestraBoard {
  return {
    feature: defaultFeature,
    tasks: defaultTasks,
    suggestions: defaultSuggestions,
  };
}
