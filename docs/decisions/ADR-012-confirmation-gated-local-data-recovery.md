# ADR-012: Confirmation-gated local data recovery

- Status: Accepted
- Date: 2026-11-01

## Context

Career Steward stores resume evidence, profile revisions, company research,
tailored CVs, interview preparation, and application history in a workspace
SQLite database using WAL mode. Copying only the main SQLite file can omit
committed WAL content. Copying the main file and sidecars independently can
capture different moments. Restore also replaces the system of record, so an
agent must not perform it from prompt inference or in a non-interactive run.

Version 1.0 needs recoverable local data without introducing cloud accounts,
sync conflict resolution, encryption key management, or a general filesystem
administration surface.

## Decision

Career Steward uses Node's SQLite online backup API for both manual and
pre-restore snapshots. The API reads a coherent database view while SQLite
handles WAL state. Snapshots are standalone SQLite files and must resolve inside
the trusted workspace.

`create_career_data_backup` creates a new file and never overwrites an existing
snapshot. Its default destination is `career-steward-backups/`, which is ignored
by Git because it contains personal data.

`restore_career_data_backup` follows this sequence:

1. resolve the requested real path and reject workspace escape;
2. run `PRAGMA quick_check`, read `PRAGMA user_version`, and calculate SHA-256;
3. show the path, size, version, and checksum in an interactive confirmation;
4. after approval, verify the checksum again;
5. create a `pre-restore` online backup of the active database;
6. copy the reviewed snapshot to a temporary database and validate it;
7. swap the database through a rollback path, remove stale WAL sidecars, and run
   normal idempotent migrations;
8. restore the rollback file automatically if replacement or migration fails.

The application accepts historical schema versions 1 through the current
version 9 and requires the core Schema 1 table signature. Version zero or a
database missing those core tables is not identifiable as Career Steward data.
A future version is rejected because older code cannot safely infer downgrade
semantics.

## Safety boundary

Restore requires Pi's interactive UI. Headless and print-mode tool calls return
`CONFIRMATION_UI_REQUIRED`; there is no force flag. The reviewed SHA-256 is
passed into the application service so replacing a file between inspection and
execution causes the restore to stop.

The pre-restore snapshot is a recovery point, not an undo button exposed to the
model. Restoring that file requires the same explicit workflow. Career Steward
does not automatically delete manual or safety backups.

## Consequences

- Backups are consistent with SQLite WAL semantics and can be tested without a
  live model or network service.
- Restoration is recoverable and cannot silently overwrite the active store.
- Backups remain local and portable, but a workspace loss also loses backups
  kept only inside that workspace; users must copy important snapshots to
  separately protected storage themselves.
- Snapshot files contain complete personal and job-search data. Git ignore is
  an accidental-commit guard, not encryption or access control.
- Cloud sync, scheduled retention, encrypted archives, selective export,
  downgrade migration, and destructive reset remain separate future decisions.
