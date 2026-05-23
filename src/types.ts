import type { ScoringOutput, SignalFinding } from "./schemas/agentOutputs.js";

export type Confidence = "high" | "medium" | "low";

export interface Account {
  id?: string;
  name: string;
  domain: string;
  linkedinUrl?: string;
  ticker?: string;
  companyNumber?: string;
}

export interface ScoredAccount {
  id: string;
  company: string;
  domain: string;
  score: number;
  confidence: Confidence;
  rationale: string;
  recommended_persona: string;
  message_angle: string;
  signal_findings: SignalFinding[];
  scoring: ScoringOutput;
}

export type JsonObject = Record<string, unknown>;
