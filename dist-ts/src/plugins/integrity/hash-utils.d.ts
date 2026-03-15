import AdmZip from 'adm-zip';
export interface DistHashResult {
    hash: string;
    fileCount: number;
    totalBytes: number;
}
export interface DetailedDistHashResult extends DistHashResult {
    files: string[];
}
export declare function computeDistHashDetailed(distDir: string): DetailedDistHashResult;
export declare function computeDistHash(distDir: string): DistHashResult;
export declare function computeDistHashFromZip(zip: AdmZip): string;
export declare function verifyDistHash(distDir: string, expectedHash: string): boolean;
//# sourceMappingURL=hash-utils.d.ts.map