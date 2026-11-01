import type { Static } from "typebox";
import { Type } from "typebox";

import { CandidateProfileDraftSchema } from "./candidate-profile.js";

export const ProfileChangeSchema = Type.Object({
  kind: Type.Union([
    Type.Literal("added"),
    Type.Literal("updated"),
    Type.Literal("removed"),
  ]),
  path: Type.String(),
  before: Type.Optional(Type.String()),
  after: Type.Optional(Type.String()),
});

export const CandidateProfileAmendmentDraftSchema = Type.Intersect([
  CandidateProfileDraftSchema,
  Type.Object({
    baseRevision: Type.Integer({ minimum: 1 }),
    reason: Type.String({ minLength: 1 }),
    changes: Type.Array(ProfileChangeSchema, { minItems: 1 }),
  }),
]);

export const CandidateProfileRevisionSummarySchema = Type.Object({
  revision: Type.Integer({ minimum: 1 }),
  id: Type.String(),
  sourceDocumentId: Type.String(),
  confirmedAt: Type.String(),
  changeType: Type.Union([
    Type.Literal("resume-import"),
    Type.Literal("amendment"),
    Type.Literal("legacy"),
  ]),
  reason: Type.Optional(Type.String()),
  baseRevision: Type.Optional(Type.Integer({ minimum: 1 })),
  experienceCount: Type.Integer({ minimum: 0 }),
  skillCount: Type.Integer({ minimum: 0 }),
  educationCount: Type.Integer({ minimum: 0 }),
});

export type ProfileChange = Static<typeof ProfileChangeSchema>;
export type CandidateProfileAmendmentDraft = Static<
  typeof CandidateProfileAmendmentDraftSchema
>;
export type CandidateProfileRevisionSummary = Static<
  typeof CandidateProfileRevisionSummarySchema
>;
