import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

export async function resolveWorkspaceFile(cwd: string, requestedPath: string): Promise<string> {
  const workspaceRoot = await realpath(cwd);
  const candidate = await realpath(resolve(workspaceRoot, requestedPath));
  const workspaceRelativePath = relative(workspaceRoot, candidate);

  if (
    workspaceRelativePath === ".." ||
    workspaceRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(workspaceRelativePath)
  ) {
    throw new Error("Resume path must stay inside the current trusted workspace");
  }

  return candidate;
}

export async function resolveWorkspaceOutputDirectory(
  cwd: string,
  requestedPath = "career-steward-exports",
): Promise<{ workspaceRoot: string; directory: string }> {
  const workspaceRoot = await realpath(cwd);
  const unresolvedDirectory = resolve(workspaceRoot, requestedPath);
  const unresolvedRelativePath = relative(workspaceRoot, unresolvedDirectory);

  if (
    unresolvedRelativePath === ".." ||
    unresolvedRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(unresolvedRelativePath)
  ) {
    throw new Error("Export directory must stay inside the current trusted workspace");
  }

  await mkdir(unresolvedDirectory, { recursive: true, mode: 0o700 });
  const directory = await realpath(unresolvedDirectory);
  const workspaceRelativePath = relative(workspaceRoot, directory);
  if (
    workspaceRelativePath === ".." ||
    workspaceRelativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
    isAbsolute(workspaceRelativePath)
  ) {
    throw new Error("Export directory must stay inside the current trusted workspace");
  }

  return { workspaceRoot, directory };
}
