export type OrchestraTaskState =
  | "intake"
  | "planning"
  | "ready"
  | "in_progress"
  | "review"
  | "done"
  | "blocked";

export type OrchestraTaskKind =
  | "brief"
  | "research"
  | "spec"
  | "implementation"
  | "review"
  | "launch";

export type OrchestraExecutor =
  | "commander"
  | "planner"
  | "codex"
  | "claude_code"
  | "portfolio"
  | "human";

export type OrchestraTaskPriority = "low" | "medium" | "high" | "critical";

export interface OrchestraTaskComment {
  id: string;
  author: OrchestraExecutor;
  body: string;
  createdAt: string;
}

export interface OrchestraFeatureIdea {
  id: string;
  title: string;
  problem: string;
  goals: string[];
  constraints: string[];
  notes: string[];
}

export interface OrchestraTask {
  id: string;
  title: string;
  summary: string;
  state: OrchestraTaskState;
  kind: OrchestraTaskKind;
  priority: OrchestraTaskPriority;
  owner: OrchestraExecutor;
  dependsOn: string[];
  acceptance: string[];
  lane: "strategy" | "planning" | "execution" | "governance";
  comments: OrchestraTaskComment[];
}

export interface AgentProfile {
  id: OrchestraExecutor | "planner" | "portfolio";
  name: string;
  role: string;
  mission: string;
  strengths: string[];
  commandStyle: string;
}

export interface OrchestraBoard {
  feature: OrchestraFeatureIdea;
  tasks: OrchestraTask[];
  suggestions: string[];
}

export interface OrchestraRunRecord {
  id: string;
  taskId: string;
  executor: OrchestraExecutor;
  mode: "dry_run" | "live";
  status: "queued" | "succeeded" | "failed";
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  createdAt: string;
  durationMs: number;
}

export interface OrchestraTimelineEvent {
  id: string;
  taskId: string;
  runId?: string;
  eventType: "queued" | "completed" | "failed" | "board_saved" | "comment_added";
  title: string;
  detail: string;
  createdAt: string;
}

export interface OrchestraPersistedState {
  board: OrchestraBoard;
  selectedTaskId: string;
  runHistory: OrchestraRunRecord[];
  timeline: OrchestraTimelineEvent[];
}

export interface OrchestraScenario {
  id: string;
  title: string;
  summary: string;
  feature: OrchestraFeatureIdea;
}
