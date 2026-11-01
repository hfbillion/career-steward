import type { Static } from "typebox";
import { Type } from "typebox";

export const CompanySourceRedirectSchema = Type.Object({
  fromUrl: Type.String(),
  toUrl: Type.String(),
  status: Type.Integer({ minimum: 300, maximum: 399 }),
});

export const CompanySourceSnapshotSchema = Type.Object({
  requestedUrl: Type.String(),
  finalUrl: Type.String(),
  retrievedAt: Type.String(),
  title: Type.Optional(Type.String()),
  publisher: Type.String(),
  publishedAt: Type.Optional(Type.String()),
  contentType: Type.String(),
  contentSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
  byteLength: Type.Integer({ minimum: 1 }),
  text: Type.String({ minLength: 1 }),
  suggestedExcerpt: Type.String({ minLength: 1 }),
  truncated: Type.Boolean(),
  redirects: Type.Array(CompanySourceRedirectSchema, { maxItems: 5 }),
  warnings: Type.Array(Type.String()),
});

export type CompanySourceRedirect = Static<typeof CompanySourceRedirectSchema>;
export type CompanySourceSnapshot = Static<typeof CompanySourceSnapshotSchema>;
