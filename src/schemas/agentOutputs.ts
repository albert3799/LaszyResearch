import { z } from "zod";

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

export const WebResearchSchema = z.object({
  ownership: z.array(z.string()),
  digital_initiatives: z.array(z.string()),
  financial_objectives: z.array(z.string()),
  business_priorities: z.array(z.string()),
  recent_news: z.array(z.string()),
  org_complexity: z.array(z.string())
});

export type WebResearchOutput = z.infer<typeof WebResearchSchema>;

// =============================================================================
// Signal-based research output.
// Each SignalAgent (one per signal definition in config/signals.yaml) returns
// a SignalFinding. The scoring agent receives an array of these.
// =============================================================================

export const SignalStrengthSchema = z.enum(["strong", "moderate", "weak", "none"]);
export const SignalTimelinessSchema = z.enum(["fresh", "stale", "expired", "undated"]);

export const SignalEvidenceSchema = z.object({
  quote: z.string().min(1).describe("Verbatim phrase from a source, <=30 words."),
  source_url: z.string().describe("URL or document title where the quote came from."),
  date: z
    .string()
    .nullable()
    .describe("ISO date or year if known, otherwise null.")
});

export const SignalFindingSchema = z.object({
  signal_id: z.string().min(1),
  found: z.boolean().describe("True if any evidence of this signal was located."),
  summary: z
    .string()
    .describe("1-2 sentence plain-English summary of what was found."),
  evidence: z
    .array(SignalEvidenceSchema)
    .describe("Quoted snippets that justify the finding. Empty if found=false."),
  strength: SignalStrengthSchema.describe(
    "How strong the signal is, per the signal's strength_rubric."
  ),
  timeliness: SignalTimelinessSchema.describe(
    "How well-timed the signal is, per the signal's timeliness_rubric."
  ),
  rationale: z
    .string()
    .describe("1-2 sentences explaining the strength + timeliness call.")
});

export type SignalEvidence = z.infer<typeof SignalEvidenceSchema>;
export type SignalFinding = z.infer<typeof SignalFindingSchema>;

export const HiringRoleSchema = z.object({
  job_title: z.string(),
  role_summary: z.string(),
  business_objectives: z.string()
});

export const HiringAnalysisSchema = z.object({
  open_roles: z.array(HiringRoleSchema)
});

export type HiringAnalysisOutput = z.infer<typeof HiringAnalysisSchema>;

// =============================================================================
// Scorecard scoring schema.
// The scoring agent receives the bundle of SignalFindings and produces ONE
// scorecard row per signal plus an overall score and a readable summary.
// =============================================================================

// The three signal categories. Each signal in config/signals.yaml is tagged
// with one; the scorecard groups rows by category.
export const SignalCategorySchema = z.enum([
  "financial",
  "transformation",
  "leadership"
]);
export type SignalCategory = z.infer<typeof SignalCategorySchema>;

// How much a single signal moves the overall score.
export const ContributionSchema = z.enum(["high", "medium", "low", "none"]);

export const ScorecardRowSchema = z.object({
  signal_id: z.string().min(1).describe("The signal_id this row scores."),
  category: SignalCategorySchema.describe(
    "Category of the signal; copy from the value provided in the input."
  ),
  found: z.boolean().describe("Whether the signal agent found evidence."),
  grade: SignalStrengthSchema.describe(
    "Strength of the signal: strong / moderate / weak / none."
  ),
  timeliness: SignalTimelinessSchema.describe(
    "How recent the evidence is: fresh / stale / expired / undated."
  ),
  contribution: ContributionSchema.describe(
    "How much this signal moves the overall score: high / medium / low / none."
  ),
  evidence_quote: z
    .string()
    .describe('Strongest verbatim quote (<=25 words), or "" if none.'),
  source_url: z
    .string()
    .nullable()
    .describe("URL or document title for the quote, or null."),
  note: z
    .string()
    .min(1)
    .describe("One-sentence analyst note explaining the grade + contribution.")
});

export type ScorecardRow = z.infer<typeof ScorecardRowSchema>;

// A per-category roll-up of the scorecard. Derived deterministically by
// runScoring from the scorecard rows — the model does not produce it.
export const CategoryBreakdownSchema = z.object({
  category: SignalCategorySchema,
  rolled_grade: SignalStrengthSchema.describe(
    "Best (highest) grade among this category's signals."
  ),
  contribution: ContributionSchema.describe(
    "Best contribution among this category's signals."
  ),
  signals_found: z
    .array(z.string())
    .describe("signal_ids in this category with found=true.")
});

export type CategoryBreakdown = z.infer<typeof CategoryBreakdownSchema>;

export const ScoringOutputSchema = z
  .object({
    scorecard: z
      .array(ScorecardRowSchema)
      .describe("One row per signal_finding received, in any order."),
    overall_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("0-100. Reflects the strength of the BEST buying case."),
    confidence: ConfidenceSchema,
    cap_applied: z
      .string()
      .nullable()
      .describe(
        "Name of the hard cap that bound the score (RECENT_S2P_IMPLEMENTATION or ACTIVE_FINANCIAL_DISTRESS), or null."
      ),
    top_signals: z
      .array(z.string())
      .describe("signal_ids driving the score; must appear in scorecard."),
    summary: z
      .string()
      .min(1)
      .describe("2-4 sentence BDR-readable summary of the buying case."),
    recommended_persona: z.string().min(1),
    message_angle: z.string().min(1)
  })
  .superRefine((data, ctx) => {
    // top_signals must reference rows that exist in the scorecard.
    const ids = new Set(data.scorecard.map((r) => r.signal_id));
    for (const t of data.top_signals) {
      if (!ids.has(t)) {
        ctx.addIssue({
          code: "custom",
          path: ["top_signals"],
          message: `top_signal "${t}" is not present in scorecard`
        });
      }
    }
  });

// category_breakdown is derived by runScoring (not produced by the model, so
// it is not part of the model's output schema above).
export type ScoringOutput = z.infer<typeof ScoringOutputSchema> & {
  category_breakdown?: CategoryBreakdown[];
};
