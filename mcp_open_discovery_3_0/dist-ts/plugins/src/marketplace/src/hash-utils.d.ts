export interface DetailedHashResult {
    hashHex: string;
    fileCount: number;
    files: string[];
    totalBytes: number;
}
export declare function computeDistHashDetailed(distDir: string): DetailedHashResult;
//# sourceMappingURL=hash-utils.d.ts.map