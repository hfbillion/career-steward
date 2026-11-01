import { access, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  createCareerDataBackup,
  inspectCareerDataBackup,
  restoreCareerDataBackup,
} from "../src/application/career-data-lifecycle.js";
import { createJobOpportunity } from "../src/application/job-analysis.js";
import {
  buildCandidateProfileDraft,
  type CandidateProfileProposal,
} from "../src/application/profile-proposal.js";
import { CareerStore } from "../src/infrastructure/career-store.js";
import { createParsedResumeDocument, SOURCE_DOCUMENT_ID } from "./fixtures.js";

const proposal: CandidateProfileProposal = {
  sourceDocumentId: SOURCE_DOCUMENT_ID,
  name: { value: "Ada Lovelace", evidenceBlockIds: ["p1-l1"] },
  experiences: [],
  skills: [{ value: "TypeScript", evidenceBlockIds: ["p1-l4"] }],
  education: [],
};

describe("Career data lifecycle", () => {
  it("round-trips a consistent backup and creates a pre-restore safety backup", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-backup-"));
    const store = new CareerStore(workspace);
    const document = createParsedResumeDocument();
    const profileDraft = buildCandidateProfileDraft(
      document,
      proposal,
      new Date("2026-11-01T00:00:00.000Z"),
    );
    store.saveSourceDocument(document, new Date("2026-11-01T00:00:00.000Z"));
    store.saveProfileDraft(profileDraft);
    const profile = store.confirmProfileDraft(
      profileDraft.id,
      new Date("2026-11-01T00:05:00.000Z"),
    );
    store.close();

    const backup = await createCareerDataBackup(
      workspace,
      {},
      new Date("2026-11-01T01:00:00.000Z"),
    );
    expect(backup).toMatchObject({ schemaVersion: 9, byteLength: expect.any(Number) });
    expect(backup.relativePath).toMatch(/^career-steward-backups\//);

    const changedStore = new CareerStore(workspace);
    const laterOpportunity = createJobOpportunity(
      {
        companyName: "Later Company",
        jobTitle: "Architect",
        jdText: "Design reliable services.",
      },
      new Date("2026-11-01T01:30:00.000Z"),
    );
    changedStore.saveJobOpportunity(laterOpportunity);
    changedStore.close();

    const restored = await restoreCareerDataBackup(
      workspace,
      { backupPath: backup.relativePath },
      backup.sha256,
      new Date("2026-11-01T02:00:00.000Z"),
    );

    expect(restored).toMatchObject({
      restoredFrom: backup.relativePath,
      sourceSha256: backup.sha256,
      sourceSchemaVersion: 9,
      restoredSchemaVersion: 9,
    });
    expect(restored.safetyBackup.relativePath).toMatch(
      /^\.career-steward\/backups\/pre-restore-/,
    );
    await expect(
      access(join(workspace, restored.safetyBackup.relativePath)),
    ).resolves.toBeUndefined();

    const verifiedStore = new CareerStore(workspace);
    try {
      expect(verifiedStore.getCurrentProfile()).toEqual(profile);
      expect(verifiedStore.getJobOpportunity(laterOpportunity.id)).toBeUndefined();
    } finally {
      verifiedStore.close();
    }
  });

  it("rejects backup paths that resolve outside the trusted workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "career-steward-backup-path-"));
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const outsidePath = join(root, "outside.sqlite");
    const outside = new DatabaseSync(outsidePath);
    outside.exec("PRAGMA user_version = 9");
    outside.close();

    await expect(
      inspectCareerDataBackup(workspace, "../outside.sqlite"),
    ).rejects.toThrow("inside the current trusted workspace");
    await expect(
      createCareerDataBackup(workspace, { outputDirectory: "../backups" }),
    ).rejects.toThrow("inside the current trusted workspace");
  });

  it("rejects a backup created by a newer schema version", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-future-backup-"));
    const futurePath = join(workspace, "future.sqlite");
    const future = new DatabaseSync(futurePath);
    future.exec("PRAGMA user_version = 10");
    future.close();

    await expect(
      inspectCareerDataBackup(workspace, "future.sqlite"),
    ).rejects.toThrow("newer than supported version 9");
  });

  it("rejects an unrelated SQLite database with a coincidental schema version", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-unrelated-db-"));
    const unrelatedPath = join(workspace, "unrelated.sqlite");
    const unrelated = new DatabaseSync(unrelatedPath);
    unrelated.exec(`
      CREATE TABLE unrelated_records (id TEXT PRIMARY KEY);
      PRAGMA user_version = 9;
    `);
    unrelated.close();

    await expect(
      inspectCareerDataBackup(workspace, "unrelated.sqlite"),
    ).rejects.toThrow("missing core tables");
  });
});
