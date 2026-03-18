import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export interface DistHashResult {
  hash: string;
  fileCount: number;
  totalBytes: number;
}

export interface DetailedDistHashResult extends DistHashResult {
  files: string[];
}

function collectOrderedFiles(rootDir: string): Array<{ relativePath: string; absolutePath: string; bytes: number }> {
  const files: Array<{ relativePath: string; absolutePath: string; bytes: number }> = [];

  function walk(currentDir: string): void {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const stats = fs.statSync(absolutePath);
      files.push({
        relativePath: path.relative(rootDir, absolutePath).replace(/\\/g, '/'),
        absolutePath,
        bytes: stats.size,
      });
    }
  }

  walk(rootDir);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return files;
}

function buildHashHex(files: Array<{ relativePath: string; absolutePath?: string; bytes: number; content?: Buffer }>): string {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(file.relativePath);
    hash.update('\n');
    hash.update(file.content ?? fs.readFileSync(file.absolutePath as string));
  }
  return hash.digest('hex');
}

export function computeDistHashDetailed(distDir: string): DetailedDistHashResult {
  const files = collectOrderedFiles(distDir);
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
  const hashHex = buildHashHex(files);
  return {
    hash: `sha256:${hashHex}`,
    fileCount: files.length,
    totalBytes,
    files: files.map((file) => file.relativePath),
  };
}

export function computeDistHash(distDir: string): DistHashResult {
  const { hash, fileCount, totalBytes } = computeDistHashDetailed(distDir);
  return { hash, fileCount, totalBytes };
}

export function computeDistHashFromZip(zip: AdmZip): string {
  const files = zip
    .getEntries()
    .filter((entry) => !entry.isDirectory && entry.entryName.startsWith('dist/'))
    .map((entry) => ({
      relativePath: entry.entryName.slice('dist/'.length),
      bytes: entry.header.size,
      content: entry.getData(),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return `sha256:${buildHashHex(files)}`;
}

export function verifyDistHash(distDir: string, expectedHash: string): boolean {
  return computeDistHash(distDir).hash.toLowerCase() === expectedHash.toLowerCase();
}