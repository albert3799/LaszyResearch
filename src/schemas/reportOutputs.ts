import { z } from "zod";

export const FinderResultSchema = z.object({
  status: z.enum(["found", "not_found", "wrong_document"]),
  companyName: z.string(),
  sourceUrl: z.string().nullable(),
  documentType: z.enum(["annual_report", "interim_report", "quarterly_report"]).nullable(),
  reportYear: z.string().nullable(),
  text: z.string().nullable(),
  error: z.string().nullable()
});

export type FinderResult = z.infer<typeof FinderResultSchema>;

export const ReportIntelligenceSchema = z.object({
  companyName: z.string(),
  reportYear: z.string(),
  documentType: z.string(),
  managementPriorities: z.array(z.string()),
  transformationInitiatives: z.array(z.string()),
  procurementSignals: z.array(z.string()),
  costPrograms: z.array(z.string()),
  peSignals: z.array(z.string()),
  zipRelevantQuotes: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  summary: z.string()
});

export type ReportIntelligence = z.infer<typeof ReportIntelligenceSchema>;
