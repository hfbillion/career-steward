import type { Static } from "typebox";
import { Type } from "typebox";

export const EmployerPreferenceDimensionSchema = Type.Union([
  Type.Literal("reputation"),
  Type.Literal("culture"),
  Type.Literal("work-intensity"),
  Type.Literal("stability"),
  Type.Literal("compensation"),
  Type.Literal("growth"),
  Type.Literal("employer-recognition"),
]);

export const EmployerPreferenceItemSchema = Type.Object({
  id: Type.String(),
  dimension: EmployerPreferenceDimensionSchema,
  importance: Type.Integer({ minimum: 1, maximum: 5 }),
  desiredOutcome: Type.String(),
  dealBreaker: Type.Boolean(),
});

export const CareerPreferenceDraftSchema = Type.Object({
  id: Type.String(),
  createdAt: Type.String(),
  employerPreferences: Type.Array(EmployerPreferenceItemSchema, { minItems: 1 }),
  warnings: Type.Array(Type.String()),
});

export const CareerPreferenceRevisionSchema = Type.Intersect([
  CareerPreferenceDraftSchema,
  Type.Object({
    revision: Type.Integer({ minimum: 1 }),
    confirmedAt: Type.String(),
  }),
]);

export type EmployerPreferenceDimension = Static<
  typeof EmployerPreferenceDimensionSchema
>;
export type EmployerPreferenceItem = Static<typeof EmployerPreferenceItemSchema>;
export type CareerPreferenceDraft = Static<typeof CareerPreferenceDraftSchema>;
export type CareerPreferenceRevision = Static<typeof CareerPreferenceRevisionSchema>;
