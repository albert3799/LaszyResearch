export type Confidence = "high" | "medium" | "low";

export interface Account {
  id?: string;
  name: string;
  domain: string;
  ticker?: string;
}

export interface ScoreData {
  score: number;
  confidence: Confidence;
  rationale: string;
  key_evidence: string[];
  recommended_persona: string;
  message_angle: string;
}

export interface ScoredAccount extends ScoreData {
  id: string;
  company: string;
  domain: string;
  raw_research: string;
}

export type JsonObject = Record<string, unknown>;
