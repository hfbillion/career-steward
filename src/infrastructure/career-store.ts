import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { confirmCandidateProfileDraft } from "../application/profile-proposal.js";
import { confirmCandidateProfileAmendmentDraft } from "../application/profile-amendment.js";
import { confirmJobAnalysisDraft } from "../application/job-analysis.js";
import { confirmCareerPreferenceDraft } from "../application/career-preferences.js";
import type {
  CandidateProfileDraft,
  CandidateProfileRevision,
} from "../domain/candidate-profile.js";
import type {
  PendingConfirmation,
  PendingConfirmationType,
} from "../domain/career-dashboard.js";
import { confirmCompanyResearchDraft } from "../application/company-research.js";
import type {
  CompanyResearchDraft,
  CompanyResearchRevision,
} from "../domain/company-intelligence.js";
import type {
  CareerPreferenceDraft,
  CareerPreferenceRevision,
} from "../domain/career-preferences.js";
import type { EmployerFitReport, EmployerFitReportDraft } from "../domain/employer-fit.js";
import { confirmTailoredResumeDraft } from "../application/tailored-resume.js";
import { deriveOpportunityStatus } from "../application/opportunity-tracking.js";
import type {
  TailoredResumeDraft,
  TailoredResumeRevision,
} from "../domain/tailored-resume.js";
import type {
  InterviewPlanReportDraft,
  InterviewPlanReport,
} from "../domain/interview-plan.js";
import type {
  JobAnalysisDraft,
  JobAnalysisRevision,
  JobOpportunity,
} from "../domain/job-opportunity.js";
import type { JobMatchReport, JobMatchReportDraft } from "../domain/job-match.js";
import type {
  OpportunityEvent,
  OpportunityEventDraft,
} from "../domain/opportunity-tracking.js";
import type { CandidateProfileAmendmentDraft } from "../domain/profile-amendment.js";
import type { ParsedResumeDocument } from "../parsers/contracts.js";

interface JsonRow {
  json: string;
}

interface DraftRow extends JsonRow {
  status: "proposed" | "confirmed";
}

interface RevisionRow {
  revision: number;
}

interface PendingConfirmationRow {
  type: PendingConfirmationType;
  draftId: string;
  opportunityId: string | null;
  createdAt: string;
}

export const CURRENT_CAREER_STORE_SCHEMA_VERSION = 9;

export class CareerStore {
  readonly dataDirectory: string;
  readonly databasePath: string;
  private readonly database: DatabaseSync;

  constructor(workspace: string) {
    this.dataDirectory = join(workspace, ".career-steward");
    this.databasePath = join(this.dataDirectory, "career-steward.sqlite");
    mkdirSync(this.dataDirectory, { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(this.databasePath);
    this.migrate();
  }

  private migrate(): void {
    this.database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS source_documents (
        id TEXT PRIMARY KEY,
        schema_version TEXT NOT NULL,
        file_name TEXT NOT NULL,
        json TEXT NOT NULL,
        imported_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_drafts (
        id TEXT PRIMARY KEY,
        source_document_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
      );

      CREATE TABLE IF NOT EXISTS profile_revisions (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL UNIQUE,
        source_document_id TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
      );

      CREATE TABLE IF NOT EXISTS profile_amendment_drafts (
        id TEXT PRIMARY KEY,
        base_revision INTEGER NOT NULL,
        source_document_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        FOREIGN KEY (base_revision) REFERENCES profile_revisions(revision),
        FOREIGN KEY (source_document_id) REFERENCES source_documents(id)
      );

      CREATE TABLE IF NOT EXISTS job_opportunities (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('captured', 'analyzed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_analysis_drafts (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS job_analysis_revisions (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS job_match_reports (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        job_analysis_revision INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS company_research_drafts (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS company_research_revisions (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS career_preference_drafts (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS career_preference_revisions (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL UNIQUE,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employer_fit_reports (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        preference_revision INTEGER NOT NULL,
        company_research_revision INTEGER NOT NULL,
        policy_version TEXT NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS tailored_resume_drafts (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT,
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS tailored_resume_revisions (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        job_analysis_revision INTEGER NOT NULL,
        match_report_revision INTEGER NOT NULL,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        confirmed_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS interview_plan_reports (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        profile_revision INTEGER NOT NULL,
        job_analysis_revision INTEGER NOT NULL,
        match_report_revision INTEGER NOT NULL,
        company_research_revision INTEGER,
        json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (opportunity_id, revision),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      CREATE TABLE IF NOT EXISTS opportunity_events (
        id TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        json TEXT NOT NULL,
        happened_at TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE (opportunity_id, sequence),
        FOREIGN KEY (opportunity_id) REFERENCES job_opportunities(id)
      );

      PRAGMA user_version = ${CURRENT_CAREER_STORE_SCHEMA_VERSION};
    `);
  }

  saveSourceDocument(document: ParsedResumeDocument, importedAt = new Date()): void {
    this.database
      .prepare(`
        INSERT INTO source_documents (id, schema_version, file_name, json, imported_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING
      `)
      .run(
        document.source.sha256,
        document.schemaVersion,
        document.source.fileName,
        JSON.stringify(document),
        importedAt.toISOString(),
      );
  }

  getSourceDocument(id: string): ParsedResumeDocument | undefined {
    const row = this.database
      .prepare("SELECT json FROM source_documents WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as ParsedResumeDocument) : undefined;
  }

  saveProfileDraft(draft: CandidateProfileDraft): void {
    this.database
      .prepare(`
        INSERT INTO profile_drafts (
          id, source_document_id, status, json, created_at
        ) VALUES (?, ?, 'proposed', ?, ?)
      `)
      .run(draft.id, draft.sourceDocumentId, JSON.stringify(draft), draft.createdAt);
  }

  getProfileDraft(id: string): CandidateProfileDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM profile_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as CandidateProfileDraft) : undefined;
  }

  confirmProfileDraft(id: string, confirmedAt = new Date()): CandidateProfileRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT json, status FROM profile_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;

      if (!row) throw new Error(`Profile draft ${id} was not found`);
      if (row.status !== "proposed") throw new Error(`Profile draft ${id} is already confirmed`);

      const revisionRow = this.database
        .prepare("SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM profile_revisions")
        .get() as unknown as RevisionRow;
      const draft = JSON.parse(row.json) as CandidateProfileDraft;
      const profile = confirmCandidateProfileDraft(draft, revisionRow.revision, confirmedAt);

      this.database
        .prepare(`
          INSERT INTO profile_revisions (
            id, revision, source_document_id, json, created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          profile.id,
          profile.revision,
          profile.sourceDocumentId,
          JSON.stringify(profile),
          profile.createdAt,
          profile.confirmedAt,
        );

      this.database
        .prepare("UPDATE profile_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ?")
        .run(profile.confirmedAt, id);

      this.database.exec("COMMIT");
      return profile;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentProfile(): CandidateProfileRevision | undefined {
    const row = this.database
      .prepare("SELECT json FROM profile_revisions ORDER BY revision DESC LIMIT 1")
      .get() as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as CandidateProfileRevision) : undefined;
  }

  getProfileRevision(revision: number): CandidateProfileRevision | undefined {
    const row = this.database
      .prepare("SELECT json FROM profile_revisions WHERE revision = ?")
      .get(revision) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as CandidateProfileRevision) : undefined;
  }

  listProfileRevisions(): CandidateProfileRevision[] {
    const rows = this.database
      .prepare("SELECT json FROM profile_revisions ORDER BY revision DESC")
      .all() as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.json) as CandidateProfileRevision);
  }

  saveProfileAmendmentDraft(draft: CandidateProfileAmendmentDraft): void {
    this.database
      .prepare(`
        INSERT INTO profile_amendment_drafts (
          id, base_revision, source_document_id, status, json, created_at
        ) VALUES (?, ?, ?, 'proposed', ?, ?)
      `)
      .run(
        draft.id,
        draft.baseRevision,
        draft.sourceDocumentId,
        JSON.stringify(draft),
        draft.createdAt,
      );
  }

  getProfileAmendmentDraft(id: string): CandidateProfileAmendmentDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM profile_amendment_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as CandidateProfileAmendmentDraft) : undefined;
  }

  confirmProfileAmendmentDraft(
    id: string,
    confirmedAt = new Date(),
  ): CandidateProfileRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT json, status FROM profile_amendment_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;
      if (!row) throw new Error(`Profile amendment draft ${id} was not found`);
      if (row.status !== "proposed") {
        throw new Error(`Profile amendment draft ${id} is already confirmed`);
      }

      const draft = JSON.parse(row.json) as CandidateProfileAmendmentDraft;
      const current = this.getCurrentProfile();
      if (!current) throw new Error("No confirmed Candidate Profile exists");
      if (current.revision !== draft.baseRevision) {
        throw new Error(
          `Candidate Profile changed before confirmation: expected revision ${draft.baseRevision}, current revision ${current.revision}`,
        );
      }

      const profile = confirmCandidateProfileAmendmentDraft(
        draft,
        current.revision + 1,
        confirmedAt,
      );
      this.database
        .prepare(`
          INSERT INTO profile_revisions (
            id, revision, source_document_id, json, created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          profile.id,
          profile.revision,
          profile.sourceDocumentId,
          JSON.stringify(profile),
          profile.createdAt,
          profile.confirmedAt,
        );
      this.database
        .prepare(`
          UPDATE profile_amendment_drafts
          SET status = 'confirmed', confirmed_at = ?
          WHERE id = ?
        `)
        .run(profile.confirmedAt, id);

      this.database.exec("COMMIT");
      return profile;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveJobOpportunity(opportunity: JobOpportunity): void {
    this.database
      .prepare(`
        INSERT INTO job_opportunities (id, status, json, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(
        opportunity.id,
        opportunity.status,
        JSON.stringify(opportunity),
        opportunity.createdAt,
      );
  }

  getJobOpportunity(id: string): JobOpportunity | undefined {
    const row = this.database
      .prepare("SELECT json FROM job_opportunities WHERE id = ?")
      .get(id) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as JobOpportunity) : undefined;
  }

  listJobOpportunities(): JobOpportunity[] {
    const rows = this.database
      .prepare("SELECT json FROM job_opportunities ORDER BY created_at DESC, id")
      .all() as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.json) as JobOpportunity);
  }

  listPendingConfirmations(): PendingConfirmation[] {
    const rows = this.database
      .prepare(`
        SELECT 'candidate-profile-import' AS type, id AS draftId,
               NULL AS opportunityId, created_at AS createdAt
        FROM profile_drafts
        WHERE status = 'proposed'
        UNION ALL
        SELECT 'candidate-profile-amendment', id, NULL, created_at
        FROM profile_amendment_drafts
        WHERE status = 'proposed'
        UNION ALL
        SELECT 'job-analysis', id, opportunity_id, created_at
        FROM job_analysis_drafts
        WHERE status = 'proposed'
        UNION ALL
        SELECT 'company-research', id, opportunity_id, created_at
        FROM company_research_drafts
        WHERE status = 'proposed'
        UNION ALL
        SELECT 'career-preferences', id, NULL, created_at
        FROM career_preference_drafts
        WHERE status = 'proposed'
        UNION ALL
        SELECT 'tailored-resume', id, opportunity_id, created_at
        FROM tailored_resume_drafts
        WHERE status = 'proposed'
        ORDER BY createdAt DESC, draftId
      `)
      .all() as unknown as PendingConfirmationRow[];

    return rows.map((row) => ({
      type: row.type,
      draftId: row.draftId,
      createdAt: row.createdAt,
      ...(row.opportunityId ? { opportunityId: row.opportunityId } : {}),
    }));
  }

  getOpportunityEvents(opportunityId: string): OpportunityEvent[] {
    const rows = this.database
      .prepare(`
        SELECT json
        FROM opportunity_events
        WHERE opportunity_id = ?
        ORDER BY sequence
      `)
      .all(opportunityId) as unknown as JsonRow[];
    return rows.map((row) => JSON.parse(row.json) as OpportunityEvent);
  }

  appendOpportunityEvent(draft: OpportunityEventDraft): OpportunityEvent {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const opportunity = this.database
        .prepare("SELECT id FROM job_opportunities WHERE id = ?")
        .get(draft.opportunityId);
      if (!opportunity) {
        throw new Error(`Job opportunity ${draft.opportunityId} was not found`);
      }

      const events = this.getOpportunityEvents(draft.opportunityId);
      const currentStatus = deriveOpportunityStatus(events);
      if (currentStatus !== draft.fromStatus) {
        throw new Error(
          `Opportunity state changed before confirmation: expected ${draft.fromStatus}, current ${currentStatus}`,
        );
      }

      const event: OpportunityEvent = {
        ...draft,
        sequence: events.length + 1,
      };
      deriveOpportunityStatus([...events, event]);
      this.database
        .prepare(`
          INSERT INTO opportunity_events (
            id, opportunity_id, sequence, event_type, from_status,
            to_status, json, happened_at, recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          event.id,
          event.opportunityId,
          event.sequence,
          event.eventType,
          event.fromStatus,
          event.toStatus,
          JSON.stringify(event),
          event.happenedAt,
          event.recordedAt,
        );

      this.database.exec("COMMIT");
      return event;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  saveJobAnalysisDraft(draft: JobAnalysisDraft): void {
    this.database
      .prepare(`
        INSERT INTO job_analysis_drafts (
          id, opportunity_id, status, json, created_at
        ) VALUES (?, ?, 'proposed', ?, ?)
      `)
      .run(draft.id, draft.opportunityId, JSON.stringify(draft), draft.createdAt);
  }

  getJobAnalysisDraft(id: string): JobAnalysisDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM job_analysis_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as JobAnalysisDraft) : undefined;
  }

  confirmJobAnalysisDraft(id: string, confirmedAt = new Date()): JobAnalysisRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const draftRow = this.database
        .prepare("SELECT json, status FROM job_analysis_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;
      if (!draftRow) throw new Error(`Job analysis draft ${id} was not found`);
      if (draftRow.status !== "proposed") {
        throw new Error(`Job analysis draft ${id} is already confirmed`);
      }

      const draft = JSON.parse(draftRow.json) as JobAnalysisDraft;
      const opportunityRow = this.database
        .prepare("SELECT json FROM job_opportunities WHERE id = ?")
        .get(draft.opportunityId) as JsonRow | undefined;
      if (!opportunityRow) {
        throw new Error(`Job opportunity ${draft.opportunityId} was not found`);
      }

      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM job_analysis_revisions
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;

      const analysis = confirmJobAnalysisDraft(
        draft,
        revisionRow.revision,
        confirmedAt,
      );
      const opportunity = JSON.parse(opportunityRow.json) as JobOpportunity;
      const analyzedOpportunity: JobOpportunity = { ...opportunity, status: "analyzed" };

      this.database
        .prepare(`
          INSERT INTO job_analysis_revisions (
            id, opportunity_id, revision, json, created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          analysis.id,
          analysis.opportunityId,
          analysis.revision,
          JSON.stringify(analysis),
          analysis.createdAt,
          analysis.confirmedAt,
        );

      this.database
        .prepare(
          "UPDATE job_analysis_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
        )
        .run(analysis.confirmedAt, id);

      this.database
        .prepare("UPDATE job_opportunities SET status = 'analyzed', json = ? WHERE id = ?")
        .run(JSON.stringify(analyzedOpportunity), opportunity.id);

      this.database.exec("COMMIT");
      return analysis;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentJobAnalysis(opportunityId: string): JobAnalysisRevision | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM job_analysis_revisions
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as JobAnalysisRevision) : undefined;
  }

  saveJobMatchReport(draft: JobMatchReportDraft): JobMatchReport {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM job_match_reports
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;
      const report: JobMatchReport = {
        ...draft,
        revision: revisionRow.revision,
      };

      this.database
        .prepare(`
          INSERT INTO job_match_reports (
            id, opportunity_id, revision, profile_revision,
            job_analysis_revision, policy_version, json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          report.id,
          report.opportunityId,
          report.revision,
          report.profileRevision,
          report.jobAnalysisRevision,
          report.policyVersion,
          JSON.stringify(report),
          report.createdAt,
        );

      this.database.exec("COMMIT");
      return report;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentJobMatch(opportunityId: string): JobMatchReport | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM job_match_reports
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as JobMatchReport) : undefined;
  }

  saveCompanyResearchDraft(draft: CompanyResearchDraft): void {
    this.database
      .prepare(`
        INSERT INTO company_research_drafts (
          id, opportunity_id, status, json, created_at
        ) VALUES (?, ?, 'proposed', ?, ?)
      `)
      .run(draft.id, draft.opportunityId, JSON.stringify(draft), draft.createdAt);
  }

  getCompanyResearchDraft(id: string): CompanyResearchDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM company_research_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as CompanyResearchDraft) : undefined;
  }

  confirmCompanyResearchDraft(
    id: string,
    confirmedAt = new Date(),
  ): CompanyResearchRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT json, status FROM company_research_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;
      if (!row) throw new Error(`Company research draft ${id} was not found`);
      if (row.status !== "proposed") {
        throw new Error(`Company research draft ${id} is already confirmed`);
      }

      const draft = JSON.parse(row.json) as CompanyResearchDraft;
      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM company_research_revisions
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;
      const research = confirmCompanyResearchDraft(
        draft,
        revisionRow.revision,
        confirmedAt,
      );

      this.database
        .prepare(`
          INSERT INTO company_research_revisions (
            id, opportunity_id, revision, json, created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          research.id,
          research.opportunityId,
          research.revision,
          JSON.stringify(research),
          research.createdAt,
          research.confirmedAt,
        );
      this.database
        .prepare(
          "UPDATE company_research_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
        )
        .run(research.confirmedAt, id);

      this.database.exec("COMMIT");
      return research;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentCompanyResearch(opportunityId: string): CompanyResearchRevision | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM company_research_revisions
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as CompanyResearchRevision) : undefined;
  }

  saveCareerPreferenceDraft(draft: CareerPreferenceDraft): void {
    this.database
      .prepare(`
        INSERT INTO career_preference_drafts (id, status, json, created_at)
        VALUES (?, 'proposed', ?, ?)
      `)
      .run(draft.id, JSON.stringify(draft), draft.createdAt);
  }

  getCareerPreferenceDraft(id: string): CareerPreferenceDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM career_preference_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as CareerPreferenceDraft) : undefined;
  }

  confirmCareerPreferenceDraft(
    id: string,
    confirmedAt = new Date(),
  ): CareerPreferenceRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT json, status FROM career_preference_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;
      if (!row) throw new Error(`Career preference draft ${id} was not found`);
      if (row.status !== "proposed") {
        throw new Error(`Career preference draft ${id} is already confirmed`);
      }
      const revisionRow = this.database
        .prepare(
          "SELECT COALESCE(MAX(revision), 0) + 1 AS revision FROM career_preference_revisions",
        )
        .get() as unknown as RevisionRow;
      const draft = JSON.parse(row.json) as CareerPreferenceDraft;
      const preferences = confirmCareerPreferenceDraft(
        draft,
        revisionRow.revision,
        confirmedAt,
      );

      this.database
        .prepare(`
          INSERT INTO career_preference_revisions (
            id, revision, json, created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?)
        `)
        .run(
          preferences.id,
          preferences.revision,
          JSON.stringify(preferences),
          preferences.createdAt,
          preferences.confirmedAt,
        );
      this.database
        .prepare(
          "UPDATE career_preference_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
        )
        .run(preferences.confirmedAt, id);

      this.database.exec("COMMIT");
      return preferences;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentCareerPreferences(): CareerPreferenceRevision | undefined {
    const row = this.database
      .prepare("SELECT json FROM career_preference_revisions ORDER BY revision DESC LIMIT 1")
      .get() as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as CareerPreferenceRevision) : undefined;
  }

  saveEmployerFitReport(draft: EmployerFitReportDraft): EmployerFitReport {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM employer_fit_reports
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;
      const report: EmployerFitReport = { ...draft, revision: revisionRow.revision };

      this.database
        .prepare(`
          INSERT INTO employer_fit_reports (
            id, opportunity_id, revision, preference_revision,
            company_research_revision, policy_version, json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          report.id,
          report.opportunityId,
          report.revision,
          report.preferenceRevision,
          report.companyResearchRevision,
          report.policyVersion,
          JSON.stringify(report),
          report.createdAt,
        );

      this.database.exec("COMMIT");
      return report;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentEmployerFit(opportunityId: string): EmployerFitReport | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM employer_fit_reports
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as EmployerFitReport) : undefined;
  }

  saveTailoredResumeDraft(draft: TailoredResumeDraft): void {
    this.database
      .prepare(`
        INSERT INTO tailored_resume_drafts (
          id, opportunity_id, status, json, created_at
        ) VALUES (?, ?, 'proposed', ?, ?)
      `)
      .run(draft.id, draft.opportunityId, JSON.stringify(draft), draft.createdAt);
  }

  getTailoredResumeDraft(id: string): TailoredResumeDraft | undefined {
    const row = this.database
      .prepare("SELECT json, status FROM tailored_resume_drafts WHERE id = ?")
      .get(id) as DraftRow | undefined;
    return row ? (JSON.parse(row.json) as TailoredResumeDraft) : undefined;
  }

  confirmTailoredResumeDraft(
    id: string,
    confirmedAt = new Date(),
  ): TailoredResumeRevision {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT json, status FROM tailored_resume_drafts WHERE id = ?")
        .get(id) as DraftRow | undefined;
      if (!row) throw new Error(`Tailored resume draft ${id} was not found`);
      if (row.status !== "proposed") {
        throw new Error(`Tailored resume draft ${id} is already confirmed`);
      }

      const draft = JSON.parse(row.json) as TailoredResumeDraft;
      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM tailored_resume_revisions
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;
      const resume = confirmTailoredResumeDraft(
        draft,
        revisionRow.revision,
        confirmedAt,
      );

      this.database
        .prepare(`
          INSERT INTO tailored_resume_revisions (
            id, opportunity_id, revision, profile_revision,
            job_analysis_revision, match_report_revision, json,
            created_at, confirmed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          resume.id,
          resume.opportunityId,
          resume.revision,
          resume.profileRevision,
          resume.jobAnalysisRevision,
          resume.matchReportRevision,
          JSON.stringify(resume),
          resume.createdAt,
          resume.confirmedAt,
        );
      this.database
        .prepare(
          "UPDATE tailored_resume_drafts SET status = 'confirmed', confirmed_at = ? WHERE id = ?",
        )
        .run(resume.confirmedAt, id);

      this.database.exec("COMMIT");
      return resume;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentTailoredResume(opportunityId: string): TailoredResumeRevision | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM tailored_resume_revisions
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as TailoredResumeRevision) : undefined;
  }

  saveInterviewPlanReport(draft: InterviewPlanReportDraft): InterviewPlanReport {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const revisionRow = this.database
        .prepare(`
          SELECT COALESCE(MAX(revision), 0) + 1 AS revision
          FROM interview_plan_reports
          WHERE opportunity_id = ?
        `)
        .get(draft.opportunityId) as unknown as RevisionRow;
      const report: InterviewPlanReport = {
        ...draft,
        revision: revisionRow.revision,
      };

      this.database
        .prepare(`
          INSERT INTO interview_plan_reports (
            id, opportunity_id, revision, profile_revision,
            job_analysis_revision, match_report_revision,
            company_research_revision, json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          report.id,
          report.opportunityId,
          report.revision,
          report.profileRevision,
          report.jobAnalysisRevision,
          report.matchReportRevision,
          report.companyResearchRevision ?? null,
          JSON.stringify(report),
          report.createdAt,
        );

      this.database.exec("COMMIT");
      return report;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getCurrentInterviewPlan(opportunityId: string): InterviewPlanReport | undefined {
    const row = this.database
      .prepare(`
        SELECT json
        FROM interview_plan_reports
        WHERE opportunity_id = ?
        ORDER BY revision DESC
        LIMIT 1
      `)
      .get(opportunityId) as JsonRow | undefined;
    return row ? (JSON.parse(row.json) as InterviewPlanReport) : undefined;
  }

  close(): void {
    this.database.close();
  }
}

export function withCareerStore<T>(workspace: string, operation: (store: CareerStore) => T): T {
  const store = new CareerStore(workspace);
  try {
    return operation(store);
  } finally {
    store.close();
  }
}
