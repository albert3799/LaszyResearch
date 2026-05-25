import { z } from "zod";

// =============================================================================
// Signals vs Triggers research framework.
//
//  - SIGNALS are enduring CHARACTERISTICS (fit). Graded by `degree`.
//  - TRIGGERS are recent EVENTS (timing). Graded by `strength` + `timeliness`.
//
// The scorer combines them: Fit (signals) gates/anchors, Triggers drive the lift.
// =============================================================================

export const StrengthSchema = z.enum(["strong", "moderate", "weak", "none"]);
export const TimelinessSchema = z.enum(["fresh", "stale", "expired", "undated"]);
export const DegreeSchema = z.enum(["high", "medium", "low", "none"]);
export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const ContributionSchema = z.enum(["high", "medium", "low", "none"]);

export const EvidenceSchema = z.object({
  quote: z.string().describe("Verbatim phrase from a source, <=30 words."),
  source_url: z.string().describe("URL or document title for the quote."),
  date: z.string().nullable().describe("ISO date or year if known, else null.")
});
export type Evidence = z.infer<typeof EvidenceSchema>;

// ---- Trigger researcher output (one per trigger) ---------------------------
export const TriggerFindingSchema = z.object({
  trigger_id: z.string().min(1),
  found: z.boolean().describe("True if any evidence of this trigger was located."),
  strength: StrengthSchema.describe("How decisive the trigger is, per its rubric."),
  timeliness: TimelinessSchema.describe("How recent the trigger is, per its rubric."),
  evidence: z.array(EvidenceSchema),
  summary: z.string().describe("1-2 plain sentences a BDR could read."),
  rationale: z.string().describe("1-2 sentences naming the strength + timeliness tier.")
});
export type TriggerFinding = z.infer<typeof TriggerFindingSchema>;

// ---- Signal researcher output (one per characteristic) ---------------------
export const SignalFindingSchema = z.object({
  signal_id: z.string().min(1),
  present: z.boolean().describe("True if the characteristic applies to the company."),
  degree: DegreeSchema.describe("How strongly the characteristic holds, per its rubric."),
  evidence: z.array(EvidenceSchema),
  summary: z.string().describe("1-2 plain sentences a BDR could read."),
  rationale: z.string().describe("1-2 sentences naming the degree tier.")
});
export type SignalFinding = z.infer<typeof SignalFindingSchema>;

// ---- Scorer output ---------------------------------------------------------
export const FitRowSchema = z.object({
  signal_id: z.string(),
  present: z.boolean(),
  degree: DegreeSchema,
  contribution: ContributionSchema.describe("How much this characteristic lifts FIT."),
  evidence_quote: z.string().describe('Strongest verbatim quote, or "".'),
  note: z.string().describe("One sentence, <=25 words.")
});

export const TriggerRowSchema = z.object({
  trigger_id: z.string(),
  found: z.boolean(),
  strength: StrengthSchema,
  timeliness: TimelinessSchema,
  contribution: ContributionSchema.describe("How much this trigger lifts TIMING."),
  evidence_quote: z.string().describe('Strongest verbatim quote, or "".'),
  note: z.string().describe("One sentence, <=25 words.")
});

export const AccountScoreSchema = z
  .object({
    fit_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("0-100, from the signals (how well the company fits Zip)."),
    fit_breakdown: z.array(FitRowSchema).describe("One row per signal."),
    timing_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("0-100, from the triggers (how live the timing is)."),
    trigger_breakdown: z.array(TriggerRowSchema).describe("One row per trigger."),
    overall_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("0-100, fit-gated blend respecting any cap."),
    confidence: ConfidenceSchema,
    cap_applied: z
      .string()
      .nullable()
      .describe("Name of the binding hard cap, or null."),
    top_drivers: z
      .array(z.string())
      .describe("trigger/signal ids that drove the score; must appear in a breakdown."),
    summary: z.string().min(1).describe("2-4 sentence BDR-readable summary."),
    recommended_persona: z.string().min(1),
    message_angle: z.string().min(1)
  })
  .superRefine((data, ctx) => {
    const ids = new Set([
      ...data.fit_breakdown.map((r) => r.signal_id),
      ...data.trigger_breakdown.map((r) => r.trigger_id)
    ]);
    for (const d of data.top_drivers) {
      if (!ids.has(d)) {
        ctx.addIssue({
          code: "custom",
          path: ["top_drivers"],
          message: `top_driver "${d}" is not present in any breakdown`
        });
      }
    }
  });
export type AccountScore = z.infer<typeof AccountScoreSchema>;
