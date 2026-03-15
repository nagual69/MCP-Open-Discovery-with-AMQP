import type { PluginManifestV2 } from '../../types';
export interface LocalImportResult {
    manifest: PluginManifestV2;
    archiveData: Buffer;
    extractedPath: string;
}
export declare function importPluginFromFile(filePath: string): Promise<LocalImportResult>;
//# sourceMappingURL=local-import.d.ts.map