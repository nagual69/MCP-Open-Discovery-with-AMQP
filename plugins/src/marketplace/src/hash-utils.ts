import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface DetailedHashResult {
  hashHex: string;
  fileCount: number;
  files: string[];
  totalBytes: number;
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export function computeDistHashDetailed(distDir: string): DetailedHashResult {
  const files = collectFiles(distDir)
    .map((filePath) => ({
      abs: filePath,
      rel: path.relative(distDir, filePath).split(path.sep).join('/'),
    }))
    .sort((left, right) => left.rel.localeCompare(right.rel));

  const hash = crypto.createHash('sha256');
  let totalBytes = 0;
  for (const file of files) {
    const data = fs.readFileSync(file.abs);
    hash.update(`${file.rel}\n`);
    hash.update(data);
    totalBytes += data.length;
  }

  return {
    hashHex: hash.digest('hex'),
    fileCount: files.length,
    files: files.map((file) => file.rel),
    totalBytes,
  };
}