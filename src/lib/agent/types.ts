export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ApiMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type AgentMode = "strong" | "weak";

export interface AgentLimits {
  maxStepsPerTurn: number;
  maxReadLines: number;
  /** Number of most recent messages the model sees (weak models forget). 0 = unlimited. */
  contextMessages: number;
}

export const AGENT_LIMITS: Record<AgentMode, AgentLimits> = {
  strong: { maxStepsPerTurn: 30, maxReadLines: 800, contextMessages: 0 },
  weak: { maxStepsPerTurn: 8, maxReadLines: 120, contextMessages: 16 },
};

export interface WorkspaceEvent {
  t: number;
  type: "user_message" | "tool_call" | "test_run" | "manual_edit" | "file_open" | "agent_error" | "stop";
  detail: string;
}
