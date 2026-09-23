import { realpath, stat } from "node:fs/promises";
import path from "node:path";

export const MAX_UPLOAD_BYTES = 1_000_000_000;

interface FileSystem {
  realpath(value: string): Promise<string>;
  stat(value: string): Promise<{ isFile(): boolean; size: number }>;
}

const defaultFileSystem: FileSystem = { realpath, stat };

export class LocalFileError extends Error {
  readonly userFacing = true;
}

function isWithinRoot(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}

export async function resolveAllowedLocalFile(
  filePath: string,
  allowedRoots: string[],
  fileSystem: FileSystem = defaultFileSystem,
): Promise<string> {
  if (allowedRoots.length === 0) {
    throw new LocalFileError(
      "Local uploads are disabled. Omit GLADIA_LOCAL_FILE_ROOTS to use the Desktop default, or set it to one or more trusted directories.",
    );
  }

  const [resolvedFile, resolvedRoots] = await Promise.all([
    fileSystem.realpath(path.resolve(filePath)),
    Promise.all(
      allowedRoots.map((root) => fileSystem.realpath(path.resolve(root))),
    ),
  ]);

  if (!resolvedRoots.some((root) => isWithinRoot(resolvedFile, root))) {
    throw new LocalFileError(
      "The requested file resolves outside every allowed root.",
    );
  }

  const fileStat = await fileSystem.stat(resolvedFile);
  if (!fileStat.isFile()) {
    throw new LocalFileError("The requested upload is not a regular file.");
  }
  if (fileStat.size > MAX_UPLOAD_BYTES) {
    throw new LocalFileError(
      "The requested upload exceeds Gladia's 1,000 MB file limit.",
    );
  }

  return resolvedFile;
}
