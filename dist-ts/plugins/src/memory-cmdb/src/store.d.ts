import type { CiValue, MemoryClearResult, MemoryGetResult, MemoryMigrateResult, MemoryMutationResult, MemoryQueryResult, MemoryRotateKeyResult, MemorySaveResult, MemoryStatsResult } from './types';
export declare function getMemoryValue(key: string): MemoryGetResult;
export declare function setMemoryValue(key: string, value: CiValue): MemoryMutationResult;
export declare function mergeMemoryValue(key: string, value: CiValue): MemoryMutationResult;
export declare function queryMemory(pattern?: string): MemoryQueryResult;
export declare function clearMemory(): MemoryClearResult;
export declare function getMemoryStats(): MemoryStatsResult;
export declare function rotateMemoryKey(newKey?: string): MemoryRotateKeyResult;
export declare function triggerSave(): number;
export declare function saveMemory(): MemorySaveResult;
export declare function migrateMemoryFromFilesystem(oldDataPath?: string): MemoryMigrateResult;
//# sourceMappingURL=store.d.ts.map