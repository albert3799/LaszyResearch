import { z } from "zod";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const WebResearchSchema = z.object({
  business_priorities: z.array(z.string()),
  recent_news: z.array(
    z.object({
      headline: z.string(),
      date: z.string(),
      relevance: z.string()
    })
  ),
  pain_signals: z.array(z.string()),
  strategic_direction: z.string(),
  confidence: ConfidenceSchema
});

export type WebResearchOutput = z.infer<typeof WebResearchSchema>;

export const HiringAnalysisSchema = z.object({
  open_roles: z.array(
    z.object({
      title: z.string(),
      department: z.string()
    })
  ),
  signal_strength: z.enum(["strong", "moderate", "weak"]),
  interpretation: z.string()
});

export type HiringAnalysisOutput = z.infer<typeof HiringAnalysisSchema>;

export const ScoreDataSchema = z.object({
  score: z.number().int().min(1).max(10),
  confidence: ConfidenceSchema,
  rationale: z.string(),
  key_evidence: z.array(z.string()),
  recommended_persona: z.string(),
  message_angle: z.string()
});

export type ScoreDataOutput = z.infer<typeof ScoreDataSchema>;
