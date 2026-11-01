import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

import { Type, type Static } from "typebox";

import {
  CareerStore,
  CURRENT_CAREER_STORE_SCHEMA_VERSION,
} from "../infrastructure/career-store.js";

const SHA256_PATTERN = "^[a-f0-9]{64}$";

export const CreateCareerDataBackupInputSchema = Type.Object({
  outputDirectory: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Directory inside the trusted workspace. Defaults to career-steward-backups.",
    }),
  ),
});

export const RestoreCareerDataBackupInputSchema = Type.Object({
  backupPath: Type.String({
    minLength: 1,
    description: "SQLite backup file inside the trusted workspace",
  }),
});

export const CareerDataBackupArtifactSchema = Type.Object({
  relativePath: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
  byteLength: Type.Integer({ minimum: 1 }),
  sha256: Type.String({ pattern: SHA256_PATTERN }),
  schemaVersion: Type.Integer({ minimum: 1 }),
});

export const CareerDataRestoreResultSchema = Type.Object({
  restoredFrom: Type.String(),
  restoredAt: Type.String({ format: "date-time" }),
  sourceSha256: Type.String({ pattern: SHA256_PATTERN }),
  sourceSchemaVersion: Type.Integer({ minimum: 1 }),
  restoredSchemaVersion: Type.Integer({ minimum: 1 }),
  safetyBackup: CareerDataBackupArtifactSchema,
});

export type CreateCareerDataBackupInput = Static<
  typeof CreateCareerDataBackupInputSchema
>;
export type RestoreCareerDataBackupInput = Static<
  typeof RestoreCareerDataBackupInputSchema
>;
export type CareerDataBackupArtifact = Static<
  typeof CareerDataBackupArtifactSchema
>;
export type CareerDataRestoreResult = Static<
  typeof CareerDataRestoreResultSchema
>;

interface DatabaseInspection {
  byteLength: number;
  sha256: string;
  schemaVersion: number;
}

function isOutsideWorkspace(workspaceRoot: string, candidate: string): boolean {
  const candidateRelativePath = relative(workspaceRoot, candidate);
  return (
    candidateRelativePath === ".." ||
    candidateRelativePath.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) ||
    isAbsolute(candidateRelativePath)
  );
}

function assertInsideWorkspace(workspaceRoot: string, candidate: string): void {
  if (isOutsideWorkspace(workspaceRoot, candidate)) {
    throw new Error("Backup path must stay inside the current trusted workspace");
  }
}

async function resolveBackupOutputDirectory(
  workspace: string,
  requestedPath: string,
): Promise<{ workspaceRoot: string; directory: string }> {
  const workspaceRoot = await realpath(workspace);
  const unresolvedDirectory = resolve(workspaceRoot, requestedPath);
  assertInsideWorkspace(workspaceRoot, unresolvedDirectory);
  await mkdir(unresolvedDirectory, { recursive: true, mode: 0o700 });
  const directory = await realpath(unresolvedDirectory);
  assertInsideWorkspace(workspaceRoot, directory);
  return { workspaceRoot, directory };
}

async function resolveBackupInputFile(
  workspace: string,
  requestedPath: string,
): Promise<{ workspaceRoot: string; filePath: string }> {
  const workspaceRoot = await realpath(workspace);
  const filePath = await realpath(resolve(workspaceRoot, requestedPath));
  assertInsideWorkspace(workspaceRoot, filePath);
  return { workspaceRoot, filePath };
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function inspectDatabaseFile(filePath: string): Promise<DatabaseInspection> {
  let database: DatabaseSync | undefined;
  let schemaVersion: number;
  let tableNames: Set<string>;

  try {
    database = new DatabaseSync(filePath, { readOnly: true });
    const integrityRows = database
      .prepare("PRAGMA quick_check")
      .all() as unknown as Array<{ quick_check: string }>;
    if (
      integrityRows.length !== 1 ||
      integrityRows[0]?.quick_check.toLowerCase() !== "ok"
    ) {
      throw new Error(
        `SQLite integrity check failed: ${integrityRows
          .map((row) => row.quick_check)
          .join("; ")}`,
      );
    }
    const versionRow = database
      .prepare("PRAGMA user_version")
      .get() as unknown as { user_version: number };
    schemaVersion = versionRow.user_version;
    const tableRows = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN ('source_documents', 'profile_drafts', 'profile_revisions')",
      )
      .all() as unknown as Array<{ name: string }>;
    tableNames = new Set(tableRows.map((row) => row.name));
  } catch (error) {
    throw new Error(
      `Backup is not a valid Career Steward SQLite database: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    database?.close();
  }

  if (schemaVersion < 1) {
    throw new Error("Backup has no supported Career Steward schema version");
  }
  if (schemaVersion > CURRENT_CAREER_STORE_SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${schemaVersion} is newer than supported version ${CURRENT_CAREER_STORE_SCHEMA_VERSION}`,
    );
  }
  const missingCoreTables = [
    "source_documents",
    "profile_drafts",
    "profile_revisions",
  ].filter((tableName) => !tableNames.has(tableName));
  if (missingCoreTables.length > 0) {
    throw new Error(
      `Backup is not recognizable as Career Steward data; missing core tables: ${missingCoreTables.join(", ")}`,
    );
  }

  const fileStats = await stat(filePath);
  return {
    byteLength: fileStats.size,
    sha256: await sha256File(filePath),
    schemaVersion,
  };
}

function backupFileName(prefix: string, now: Date): string {
  const timestamp = now.toISOString().replace(/[-:.]/g, "");
  return `${prefix}-${timestamp}.sqlite`;
}

async function assertPathDoesNotExist(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }
    throw error;
  }
  throw new Error(`Backup file already exists and will not be overwritten: ${filePath}`);
}

async function createBackupSnapshot(
  workspace: string,
  outputDirectory: string,
  prefix: string,
  now: Date,
): Promise<CareerDataBackupArtifact> {
  const store = new CareerStore(workspace);
  const sourcePath = store.databasePath;
  store.close();

  const { workspaceRoot, directory } = await resolveBackupOutputDirectory(
    workspace,
    outputDirectory,
  );
  const outputPath = join(directory, backupFileName(prefix, now));
  await assertPathDoesNotExist(outputPath);

  const reservation = await open(outputPath, "wx", 0o600);
  await reservation.close();
  const sourceDatabase = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(sourceDatabase, outputPath);
  } catch (error) {
    await rm(outputPath, { force: true });
    throw error;
  } finally {
    sourceDatabase.close();
  }

  const inspection = await inspectDatabaseFile(outputPath);
  return {
    relativePath: relative(workspaceRoot, outputPath),
    createdAt: now.toISOString(),
    ...inspection,
  };
}

export async function createCareerDataBackup(
  workspace: string,
  input: CreateCareerDataBackupInput = {},
  now = new Date(),
): Promise<CareerDataBackupArtifact> {
  return createBackupSnapshot(
    workspace,
    input.outputDirectory ?? "career-steward-backups",
    "career-steward",
    now,
  );
}

export async function inspectCareerDataBackup(
  workspace: string,
  backupPath: string,
): Promise<CareerDataBackupArtifact> {
  const { workspaceRoot, filePath } = await resolveBackupInputFile(
    workspace,
    backupPath,
  );
  const inspection = await inspectDatabaseFile(filePath);
  const fileStats = await stat(filePath);
  return {
    relativePath: relative(workspaceRoot, filePath),
    createdAt: fileStats.mtime.toISOString(),
    ...inspection,
  };
}

async function removeDatabaseSidecars(databasePath: string): Promise<void> {
  await Promise.all([
    rm(`${databasePath}-wal`, { force: true }),
    rm(`${databasePath}-shm`, { force: true }),
  ]);
}

export async function restoreCareerDataBackup(
  workspace: string,
  input: RestoreCareerDataBackupInput,
  expectedSha256: string,
  now = new Date(),
): Promise<CareerDataRestoreResult> {
  const source = await inspectCareerDataBackup(workspace, input.backupPath);
  if (source.sha256 !== expectedSha256) {
    throw new Error("Backup changed after review; inspect it again before restoring");
  }

  const store = new CareerStore(workspace);
  const databasePath = store.databasePath;
  store.close();
  const canonicalDatabasePath = await realpath(databasePath);

  const { filePath: sourcePath } = await resolveBackupInputFile(
    workspace,
    input.backupPath,
  );
  if (sourcePath === canonicalDatabasePath) {
    throw new Error("The active Career Steward database cannot be used as a backup");
  }

  const safetyBackup = await createBackupSnapshot(
    workspace,
    ".career-steward/backups",
    "pre-restore",
    now,
  );
  const sourceBeforeCopy = await inspectCareerDataBackup(
    workspace,
    input.backupPath,
  );
  if (sourceBeforeCopy.sha256 !== expectedSha256) {
    throw new Error("Backup changed after review; inspect it again before restoring");
  }

  const temporaryPath = join(
    resolve(databasePath, ".."),
    `.restore-${randomUUID()}.sqlite`,
  );
  const rollbackPath = join(
    resolve(databasePath, ".."),
    `.restore-rollback-${randomUUID()}.sqlite`,
  );
  const sourceDatabase = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(sourceDatabase, temporaryPath);
  } finally {
    sourceDatabase.close();
  }
  await inspectDatabaseFile(temporaryPath);

  let activeMoved = false;
  let restoredMoved = false;
  try {
    await removeDatabaseSidecars(databasePath);
    await rename(databasePath, rollbackPath);
    activeMoved = true;
    await rename(temporaryPath, databasePath);
    restoredMoved = true;

    const migratedStore = new CareerStore(workspace);
    migratedStore.close();
    const restored = await inspectDatabaseFile(databasePath);
    await rm(rollbackPath, { force: true });

    return {
      restoredFrom: source.relativePath,
      restoredAt: now.toISOString(),
      sourceSha256: source.sha256,
      sourceSchemaVersion: source.schemaVersion,
      restoredSchemaVersion: restored.schemaVersion,
      safetyBackup,
    };
  } catch (error) {
    if (restoredMoved) {
      await removeDatabaseSidecars(databasePath);
      await rm(databasePath, { force: true });
    }
    if (activeMoved) {
      await rename(rollbackPath, databasePath);
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}
