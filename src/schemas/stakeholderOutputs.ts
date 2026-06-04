import { z } from "zod";

export const PersonaKeySchema = z.enum([
  "IT_AND_SECURITY",
  "OPS_PROCUREMENT",
  "FINANCE_SPEND_CONTROL",
  "LEGAL_CONTRACTS"
]);
export type PersonaKey = z.infer<typeof PersonaKeySchema>;

export const StakeholderDepartmentSchema = z.enum([
  "IT",
  "Operations",
  "Finance",
  "Legal"
]);
export type StakeholderDepartment = z.infer<typeof StakeholderDepartmentSchema>;

export const StakeholderRankSchema = z.enum(["high", "medium", "low"]);
export type StakeholderRank = z.infer<typeof StakeholderRankSchema>;

export const DecisionRoleSchema = z.enum([
  "champion",
  "influencer",
  "budget_holder",
  "gatekeeper",
  "end_user"
]);
export type DecisionRole = z.infer<typeof DecisionRoleSchema>;

// What the LLM returns for ONE person. The model also returns null-persona
// rows so we can see what it rejected; the agent filters those before persist.
export const StakeholderClassificationSchema = z.object({
  amplemarket_id: z.string().min(1),
  full_name: z.string().nullable(),
  title: z.string().nullable(),
  linkedin_url: z.string(),
  persona: PersonaKeySchema.nullable().describe(
    "Persona this person matches, or null if they do not fit any persona."
  ),
  sub_persona: z
    .string()
    .nullable()
    .describe("Finer-grained role within the persona (e.g. 'CISO', 'TPRM Lead')."),
  department: StakeholderDepartmentSchema.nullable(),
  rank: StakeholderRankSchema.describe(
    "high = ideal title match. medium = adjacent title or description-driven. low = weak fit."
  ),
  decision_role: DecisionRoleSchema.nullable(),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("0-1 confidence that this person belongs to the chosen persona."),
  rationale: z
    .string()
    .describe(
      "1-2 sentence why-relevant summary tying their title/headline/about to Zip's buying committee."
    ),
  evidence: z
    .array(z.string())
    .describe(
      "Verbatim phrases from title/headline/about that drove the classification."
    )
});
export type StakeholderClassification = z.infer<typeof StakeholderClassificationSchema>;

export const StakeholderMapResultSchema = z.object({
  classifications: z.array(StakeholderClassificationSchema)
});
export type StakeholderMapResult = z.infer<typeof StakeholderMapResultSchema>;
