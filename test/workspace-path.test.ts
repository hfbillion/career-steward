import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveWorkspaceFile } from "../src/security/workspace-path.js";

describe("resolveWorkspaceFile", () => {
  it("accepts files inside the trusted workspace", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "career-steward-workspace-"));
    const file = join(workspace, "resume.pdf");
    await writeFile(file, "%PDF-");

    await expect(resolveWorkspaceFile(workspace, "resume.pdf")).resolves.toBe(
      await realpath(file),
    );
  });

  it("rejects paths that escape through a symlink", async () => {
    const root = await mkdtemp(join(tmpdir(), "career-steward-root-"));
    const workspace = join(root, "workspace");
    const outside = join(root, "outside.pdf");
    await mkdir(workspace);
    await writeFile(outside, "%PDF-");
    await symlink(outside, join(workspace, "resume.pdf"));

    await expect(resolveWorkspaceFile(workspace, "resume.pdf")).rejects.toThrow(
      "inside the current trusted workspace",
    );
  });
});
