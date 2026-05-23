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

export const CriterionScoreSchema = z.object({
  score: z.number().int().min(0).max(100),
  summary: z.string()
});

export const ScoreDataSchema = z.object({
  criteria_scores: z.object({
    drive_savings: CriterionScoreSchema,
    operational_efficiency: CriterionScoreSchema,
    reduce_risk: CriterionScoreSchema
  }),
  evidence_for: z.array(z.string()),
  evidence_against: z.array(z.string()),
  score: z.number().int().min(0).max(100),
  confidence: ConfidenceSchema,
  rationale: z.string(),
  recommended_persona: z.string(),
  message_angle: z.string()
});

export type ScoreDataOutput = z.infer<typeof ScoreDataSchema>;

// =============================================================================
// New marking-homework scoring schema (V2).
// The orchestrator's parseScoreData still uses the V1 ScoreDataSchema above.
// Use ScoringOutputSchema when running the new scoring prompt standalone.
// =============================================================================

export const TriggerCodeSchema = z.enum([
  "pe_acquisition_recent",
  "pe_cost_out",
  "new_cfo",
  "new_cpo",
  "erp_migration",
  "procurement_transformation",
  "m_and_a_integration",
  "regulatory_deadline",
  "tprm_initiative",
  "audit_finding",
  "supplier_consolidation",
  "earnings_pressure",
  "ipo_recent",
  "geographic_expansion",
  "headcount_growth"
]);

// Evidence sources are signal-prefixed: signal.<signal_id>. The scoring
// agent receives signal findings only; legacy web_research.* sources are no
// longer emitted.
export const EvidenceSourceSchema = z
  .string()
  .regex(
    /^signal\.[a-z0-9_]+$/,
    "source must be of the form signal.<signal_id>"
  );

export const SpecificitySchema = z.enum(["specific", "generic", "vague"]);
export const RecencySchema = z.enum(["fresh", "stale", "expired", "undated"]);
export const WeightSchema = z.enum(["strong", "moderate", "weak", "noise"]);

const wordCountAtMost = (n: number) => (s: string) =>
  s.trim().length === 0 || s.trim().split(/\s+/).length <= n;

export const EvidenceItemSchema = z.object({
  id: z.string().regex(/^e\d+$/, "id must be e1, e2, ..."),
  source: EvidenceSourceSchema,
  claim: z.string().min(1),
  source_quote: z
    .string()
    .min(1)
    .refine(wordCountAtMost(20), "source_quote must be ≤20 words"),
  trigger_matched: TriggerCodeSchema.nullable(),
  specificity: SpecificitySchema,
  recency: RecencySchema,
  weight: WeightSchema,
  comment: z.string().min(1)
});

const CapCeilings = { C1: 40, C2: 25 } as const;
const CapNames = {
  C1: "RECENT_S2P_IMPLEMENTATION",
  C2: "ACTIVE_FINANCIAL_DISTRESS"
} as const;

export const CapApplicationSchema = z
  .object({
    code: z.enum(["C1", "C2"]),
    name: z.enum(["RECENT_S2P_IMPLEMENTATION", "ACTIVE_FINANCIAL_DISTRESS"]),
    applied: z.boolean(),
    supporting_evidence_id: z.string().nullable(),
    supporting_quote: z.string().nullable(),
    ceiling: z.number().int()
  })
  .refine(
    (c) => c.name === CapNames[c.code],
    "cap name must match cap code (C1=RECENT_S2P_IMPLEMENTATION, C2=ACTIVE_FINANCIAL_DISTRESS)"
  )
  .refine(
    (c) => c.ceiling === CapCeilings[c.code],
    "cap ceiling must match cap code (C1=40, C2=25)"
  )
  .refine(
    (c) => !c.applied || (!!c.supporting_evidence_id && !!c.supporting_quote),
    "applied caps require supporting_evidence_id and supporting_quote"
  );

export const CriterionEvaluationSchema = z
  .object({
    supporting_evidence_ids: z.array(z.string()),
    reasoning: z.string().min(1),
    verbatim_quote: z.string(),
    score: z.number().int().min(0).max(100)
  })
  .refine(
    (c) => c.score <= 65 || c.verbatim_quote.length > 0,
    "verbatim_quote required when score > 65"
  )
  .refine(
    (c) => wordCountAtMost(15)(c.verbatim_quote),
    "verbatim_quote must be ≤15 words"
  );

export const ConclusionSchema = z.object({
  reasoning: z.string().min(1),
  triggers_detected: z.array(TriggerCodeSchema),
  lowest_cap_ceiling: z.number().int().nullable(),
  overall_score: z.number().int().min(0).max(100),
  confidence: ConfidenceSchema,
  recommended_persona: z.string().min(1),
  message_angle: z.string().min(1)
});

export const ScoringOutputSchema = z
  .object({
    evidence_assessment: z.array(EvidenceItemSchema),
    caps_applied: z.array(CapApplicationSchema).length(2),
    criteria_scores: z.object({
      drive_savings: CriterionEvaluationSchema,
      operational_efficiency: CriterionEvaluationSchema,
      reduce_risk: CriterionEvaluationSchema
    }),
    conclusion: ConclusionSchema
  })
  .superRefine((data, ctx) => {
    // 1. Evidence ids must be unique
    const ids = data.evidence_assessment.map((e) => e.id);
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          path: ["evidence_assessment"],
          message: `duplicate evidence id: ${id}`
        });
      }
      seen.add(id);
    }

    // 2. supporting_evidence_ids must reference real ids
    const idSet = new Set(ids);
    for (const [criterion, c] of Object.entries(data.criteria_scores)) {
      for (const ref of c.supporting_evidence_ids) {
        if (!idSet.has(ref)) {
          ctx.addIssue({
            code: "custom",
            path: ["criteria_scores", criterion, "supporting_evidence_ids"],
            message: `unknown evidence id: ${ref}`
          });
        }
      }
    }

    // 3. caps_applied must contain exactly C1 and C2, each exactly once
    const codes = data.caps_applied.map((c) => c.code).sort();
    if (codes.join(",") !== "C1,C2") {
      ctx.addIssue({
        code: "custom",
        path: ["caps_applied"],
        message: "caps_applied must contain exactly C1 and C2"
      });
    }

    // 4. lowest_cap_ceiling and overall_score must respect the binding cap
    const applied = data.caps_applied.filter((c) => c.applied);
    const lowest = applied.length
      ? Math.min(...applied.map((c) => c.ceiling))
      : null;

    if (data.conclusion.lowest_cap_ceiling !== lowest) {
      ctx.addIssue({
        code: "custom",
        path: ["conclusion", "lowest_cap_ceiling"],
        message: `lowest_cap_ceiling should be ${lowest === null ? "null" : lowest}`
      });
    }
    if (lowest !== null && data.conclusion.overall_score > lowest) {
      ctx.addIssue({
        code: "custom",
        path: ["conclusion", "overall_score"],
        message: `overall_score (${data.conclusion.overall_score}) exceeds binding cap (${lowest})`
      });
    }

    // 5. triggers_detected must be a subset of triggers seen on evidence
    const evidenceTriggers = new Set(
      data.evidence_assessment
        .map((e) => e.trigger_matched)
        .filter((t): t is NonNullable<typeof t> => t !== null)
    );
    for (const t of data.conclusion.triggers_detected) {
      if (!evidenceTriggers.has(t)) {
        ctx.addIssue({
          code: "custom",
          path: ["conclusion", "triggers_detected"],
          message: `${t} not present in evidence_assessment`
        });
      }
    }
  });

export type ScoringOutput = z.infer<typeof ScoringOutputSchema>;
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;
export type CapApplication = z.infer<typeof CapApplicationSchema>;
