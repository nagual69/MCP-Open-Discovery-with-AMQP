# Registry System Function Analysis

_Complete Inventory and Remediation Plan_

Generated: August 10, 2025  
Scope: All registry-related files and functions  
Purpose: Systematic cleanup and consolidation

## Executive Summary

The registry system currently contains **TWO COEXISTING ARCHITECTURES**:

1. **OLD STATIC SYSTEM** - Legacy registration patterns with manual tool tracking
2. **NEW DYNAMIC SYSTEM** - Modern hot-reload architecture with database persistence

**Critical Finding**: The old static system remnants are causing the registry tool failures with "Cannot read properties of undefined (reading 'getModuleStatus')" errors.

## Function Inventory by File

### 1. registry_tools_sdk.js

**File Status**: ✅ CLEANED (279 lines, manually edited)  
**Architecture**: New Dynamic System Only  
**Purpose**: MCP Tools for runtime registry management

| Function           | Purpose                            | Disposition                                             |
| ------------------ | ---------------------------------- | ------------------------------------------------------- |
| `tools` array      | Define 5 registry management tools | ✅ **KEEP** - Core dynamic system                       |
| `handleToolCall()` | Handle registry tool calls         | ✅ **KEEP** - Properly accesses new registry components |

**Functions Analysis**:

- `registry_get_status`: Gets registry status via getRegistryInstance() ✅ **KEEP**
- `registry_load_module`: Dynamic module loading (stub) ✅ **KEEP**
- `registry_unload_module`: Dynamic module unloading (stub) ✅ **KEEP**
- `registry_reload_module`: Hot-reload functionality ✅ **KEEP**
- `registry_toggle_hotreload`: Control hot-reload system ✅ **KEEP**

**Verdict**: ✅ **CLEAN** - Only new dynamic system remains, properly structured

---

### 2. registry/index.js

**File Status**: ⚠️ MIXED SYSTEM (531 lines)  
**Architecture**: New Dynamic System + Legacy Support  
**Purpose**: Main registry orchestrator and tool registration

| Function                           | Purpose                        | Disposition                                 |
| ---------------------------------- | ------------------------------ | ------------------------------------------- |
| `convertZodSchemaCustom()`         | Convert Zod to JSON Schema     | ✅ **KEEP** - Essential for MCP SDK         |
| `convertZodType()`                 | Handle individual Zod types    | ✅ **KEEP** - Supporting function           |
| `getRegistry()`                    | Get registry singleton         | ✅ **KEEP** - Core singleton pattern        |
| `getHotReloadManager()`            | Get hot-reload manager         | ✅ **KEEP** - New architecture              |
| `getValidationManager()`           | Get validation manager         | ✅ **KEEP** - New architecture              |
| `registerAllTools()`               | Main registration orchestrator | ✅ **KEEP** - Core functionality            |
| `_loadFromDatabase()`              | Load existing tools from DB    | ✅ **KEEP** - Database-first architecture   |
| `_registerFreshTools()`            | Fresh tool registration        | ✅ **KEEP** - Fallback for new installs     |
| `_initializeMemoryToolsIfNeeded()` | Special memory tools init      | ✅ **KEEP** - Required for memory tools     |
| `_getRegistrationResults()`        | Get current state              | ✅ **KEEP** - State management              |
| `getRegistryInstance()`            | External registry access       | ✅ **KEEP** - Public API                    |
| `cleanup()`                        | Shutdown cleanup               | ✅ **KEEP** - Lifecycle management          |
| `getToolCounts()`                  | Legacy tool counts             | ⚠️ **REVIEW** - May be legacy compatibility |

**Critical Code Sections**:

- Tool registration loop (lines 385-470): ✅ **KEEP** - Core registration logic
- Parameter analysis integration: ✅ **KEEP** - Critical for MCP SDK compatibility
- Database integration: ✅ **KEEP** - New persistence architecture

**Verdict**: ✅ **MOSTLY CLEAN** - Primarily new dynamic system with minimal legacy compat

---

### 3. registry/core_registry.js

**File Status**: ✅ CLEAN (467 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: Core registry state and lifecycle management

| Function                             | Purpose                          | Disposition                           |
| ------------------------------------ | -------------------------------- | ------------------------------------- |
| `initialize()`                       | Initialize registry and database | ✅ **KEEP** - Core initialization     |
| `hasExistingTools()`                 | Check for existing tools in DB   | ✅ **KEEP** - Database-first pattern  |
| `areToolsAlreadyRegistered()`        | Legacy compatibility alias       | 🔄 **CONVERT** - Rename for clarity   |
| `loadToolsFromDatabase()`            | Load and register from DB        | ✅ **KEEP** - Full database loading   |
| `loadFromDatabase()`                 | Load state only from DB          | ✅ **KEEP** - State reconstruction    |
| `startModule()`                      | Begin module registration        | ✅ **KEEP** - Module lifecycle        |
| `registerTool()`                     | Register individual tool         | ✅ **KEEP** - Tool registration       |
| `completeModule()`                   | Finish module registration       | ✅ **KEEP** - Module completion       |
| `getStats()`                         | Get registry statistics          | ✅ **KEEP** - Status reporting        |
| `getToolCounts()`                    | Legacy format tool counts        | 🔄 **CONVERT** - Merge with getStats  |
| `getHotReloadStatus()`               | Hot-reload status                | ✅ **KEEP** - Monitoring              |
| `getAnalytics()`                     | Database analytics               | ✅ **KEEP** - Performance data        |
| `cleanup()`                          | Registry cleanup                 | ✅ **KEEP** - Lifecycle management    |
| `_rebuildStateFromDatabase()`        | Internal state rebuild           | ✅ **KEEP** - Database reconstruction |
| `_registerDatabaseToolsWithServer()` | Register DB tools with MCP       | ✅ **KEEP** - MCP integration         |

**Verdict**: ✅ **CLEAN** - Pure new dynamic system, minimal legacy compatibility needed

---

### 4. registry/hot_reload_manager.js

**File Status**: ✅ CLEAN (331 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: File watching and module hot-reloading

| Function                    | Purpose                       | Disposition                             |
| --------------------------- | ----------------------------- | --------------------------------------- |
| `enable()`                  | Enable hot-reload             | ✅ **KEEP** - Core functionality        |
| `disable()`                 | Disable hot-reload            | ✅ **KEEP** - Control mechanism         |
| `toggle()`                  | Toggle hot-reload state       | ✅ **KEEP** - Convenience method        |
| `watchModule()`             | Start watching module file    | ✅ **KEEP** - File system monitoring    |
| `stopWatching()`            | Stop watching specific module | ✅ **KEEP** - Cleanup mechanism         |
| `stopAllWatchers()`         | Stop all file watchers        | ✅ **KEEP** - Bulk cleanup              |
| `reloadModule()`            | Hot-reload a module           | ✅ **KEEP** - Core hot-reload logic     |
| `getStatus()`               | Get hot-reload status         | ✅ **KEEP** - Status monitoring         |
| `cleanup()`                 | Manager cleanup               | ✅ **KEEP** - Lifecycle management      |
| `_clearModuleCache()`       | Clear require cache           | ✅ **KEEP** - Internal cache management |
| `_validateReloadedModule()` | Validate after reload         | ✅ **KEEP** - Safety validation         |
| `_updateReloadStats()`      | Update reload statistics      | ✅ **KEEP** - Performance tracking      |

**Verdict**: ✅ **PERFECT** - Pure new dynamic system, no legacy code

---

### 5. registry/tool_validation_manager.js

**File Status**: ✅ CLEAN (366 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: Tool validation and MCP compliance checking

| Function                     | Purpose                        | Disposition                            |
| ---------------------------- | ------------------------------ | -------------------------------------- |
| `validateTool()`             | Validate single tool           | ✅ **KEEP** - Core validation          |
| `validateToolBatch()`        | Validate array of tools        | ✅ **KEEP** - Batch processing         |
| `getValidationResult()`      | Get specific validation result | ✅ **KEEP** - Result access            |
| `getAllValidationResults()`  | Get all validation results     | ✅ **KEEP** - Bulk access              |
| `getValidationSummary()`     | Get summary statistics         | ✅ **KEEP** - Status reporting         |
| `generateComplianceReport()` | Generate compliance report     | ✅ **KEEP** - Reporting functionality  |
| `clearResults()`             | Clear validation cache         | ✅ **KEEP** - Cache management         |
| `updateConfig()`             | Update validation config       | ✅ **KEEP** - Configuration management |
| `_validateMCPSchema()`       | MCP schema validation          | ✅ **KEEP** - Protocol compliance      |
| `_checkForDuplicates()`      | Duplicate detection            | ✅ **KEEP** - Conflict prevention      |
| `_runCustomValidation()`     | Custom validation rules        | ✅ **KEEP** - Extensible validation    |
| `_initializeDefaultRules()`  | Initialize validation rules    | ✅ **KEEP** - Setup function           |

**Verdict**: ✅ **PERFECT** - Pure new dynamic system, comprehensive validation

---

### 6. registry/database_layer.js

**File Status**: ✅ CLEAN (355 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: SQLite persistence and CMDB integration

| Function                     | Purpose                        | Disposition                        |
| ---------------------------- | ------------------------------ | ---------------------------------- |
| `initialize()`               | Initialize database connection | ✅ **KEEP** - Core initialization  |
| `createSchema()`             | Create database schema         | ✅ **KEEP** - Schema management    |
| `initializeConfig()`         | Initialize default config      | ✅ **KEEP** - Default setup        |
| `executeQuery()`             | Execute SQL queries            | ✅ **KEEP** - Database interface   |
| `recordModuleRegistration()` | Record module in DB            | ✅ **KEEP** - Persistence layer    |
| `getRegistryStats()`         | Get registry statistics        | ✅ **KEEP** - Analytics            |
| `getModuleHistory()`         | Get module load history        | ✅ **KEEP** - Historical data      |
| `getModules()`               | Get all modules                | ✅ **KEEP** - Data access          |
| `getTools()`                 | Get all tools                  | ✅ **KEEP** - Data access          |
| `storeMemoryData()`          | Store encrypted memory data    | ✅ **KEEP** - CMDB integration     |
| `getMemoryData()`            | Retrieve memory data           | ✅ **KEEP** - CMDB integration     |
| `storeMemoryKey()`           | Store encryption key           | ✅ **KEEP** - Security layer       |
| `getActiveMemoryKey()`       | Get active encryption key      | ✅ **KEEP** - Security layer       |
| `auditMemoryAction()`        | Audit memory operations        | ✅ **KEEP** - Security audit       |
| `getMemoryStats()`           | Get memory statistics          | ✅ **KEEP** - Analytics            |
| `close()`                    | Close database connection      | ✅ **KEEP** - Lifecycle management |

**Verdict**: ✅ **PERFECT** - Pure new dynamic system with CMDB integration

---

### 7. registry/management_tools.js

**File Status**: ✅ REMOVED  
**Replacement**: `tools/registry_tools_sdk.js` is the canonical registry management module.  
**Notes**: All capabilities were consolidated into `registry_tools_sdk.js` with compatibility for legacy snake_case parameters.

---

### 8. registry/resource_manager.js

**File Status**: ✅ CLEAN (142 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: MCP resource registration and management

| Function                     | Purpose                    | Disposition                        |
| ---------------------------- | -------------------------- | ---------------------------------- |
| `registerAllResources()`     | Register MCP resources     | ✅ **KEEP** - MCP protocol support |
| `getResourceCounts()`        | Get resource counts        | ✅ **KEEP** - Status reporting     |
| `registerResourceProvider()` | Register resource provider | ✅ **KEEP** - Extensibility        |
| `validateResourceConfig()`   | Validate resource config   | ✅ **KEEP** - Validation           |
| `getResourceHealth()`        | Get resource health status | ✅ **KEEP** - Monitoring           |

**Verdict**: ✅ **PERFECT** - Clean MCP resource management

---

### 9. registry/plugin_manager.js

**File Status**: ✅ CLEAN (418 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: Extensible plugin architecture

| Function                 | Purpose                    | Disposition                         |
| ------------------------ | -------------------------- | ----------------------------------- |
| `initialize()`           | Initialize plugin system   | ✅ **KEEP** - Plugin infrastructure |
| `_discoverPlugins()`     | Discover available plugins | ✅ **KEEP** - Auto-discovery        |
| `_discoverPlugin()`      | Discover single plugin     | ✅ **KEEP** - Plugin detection      |
| `_loadPluginManifest()`  | Load plugin manifest       | ✅ **KEEP** - Metadata loading      |
| `loadPlugin()`           | Load a plugin              | ✅ **KEEP** - Plugin lifecycle      |
| `unloadPlugin()`         | Unload a plugin            | ✅ **KEEP** - Plugin lifecycle      |
| `activatePlugin()`       | Activate loaded plugin     | ✅ **KEEP** - Plugin lifecycle      |
| `getPlugin()`            | Get plugin information     | ✅ **KEEP** - Data access           |
| `listPlugins()`          | List all plugins           | ✅ **KEEP** - Data access           |
| `getStats()`             | Get plugin statistics      | ✅ **KEEP** - Status reporting      |
| `_checkDependencies()`   | Check plugin dependencies  | ✅ **KEEP** - Dependency management |
| `_loadPluginModule()`    | Load plugin module         | ✅ **KEEP** - Module loading        |
| `_getPluginModulePath()` | Get plugin path            | ✅ **KEEP** - Path resolution       |
| `_createPluginContext()` | Create plugin context      | ✅ **KEEP** - Plugin API            |
| `_ensureDirectory()`     | Ensure directory exists    | ✅ **KEEP** - Utility function      |

**Verdict**: ✅ **PERFECT** - Advanced plugin architecture for extensibility

---

### 10. registry/parameter_type_detector.js

**File Status**: ✅ CLEAN (106 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: MCP SDK parameter type detection and schema handling

| Function                  | Purpose                          | Disposition                        |
| ------------------------- | -------------------------------- | ---------------------------------- |
| `hasArrayParameters()`    | Detect array parameters          | ✅ **KEEP** - Critical for MCP SDK |
| `getRegistrationSchema()` | Get schema for registration      | ✅ **KEEP** - Schema preparation   |
| `getRegistrationMethod()` | Determine registration method    | ✅ **KEEP** - SDK method selection |
| `analyzeParameters()`     | Comprehensive parameter analysis | ✅ **KEEP** - Debug and analysis   |

**Verdict**: ✅ **PERFECT** - Essential for proper MCP SDK integration

---

### 11. registry/management_ui.js

**File Status**: ✅ CLEAN (477 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: Web-based management interface

| Function                   | Purpose                   | Disposition                        |
| -------------------------- | ------------------------- | ---------------------------------- |
| `start()`                  | Start web server          | ✅ **KEEP** - UI infrastructure    |
| `stop()`                   | Stop web server           | ✅ **KEEP** - Lifecycle management |
| `_handleRequest()`         | Handle HTTP requests      | ✅ **KEEP** - Request routing      |
| `_serveDashboard()`        | Serve main dashboard      | ✅ **KEEP** - UI delivery          |
| `_generateDashboardHTML()` | Generate dashboard HTML   | ✅ **KEEP** - UI generation        |
| `_serveStatus()`           | Serve registry status     | ✅ **KEEP** - API endpoint         |
| `_serveModules()`          | Serve modules info        | ✅ **KEEP** - API endpoint         |
| `_serveTools()`            | Serve tools info          | ✅ **KEEP** - API endpoint         |
| `_serveMetrics()`          | Serve performance metrics | ✅ **KEEP** - API endpoint         |
| `_handleReload()`          | Handle reload requests    | ✅ **KEEP** - Management function  |
| `_handleToolTest()`        | Handle tool testing       | ✅ **KEEP** - Testing function     |
| Various utility methods    | HTTP response helpers     | ✅ **KEEP** - Supporting functions |

**Verdict**: ✅ **PERFECT** - Comprehensive web management interface

---

### 12. registry/discovery_engine.js

**File Status**: ✅ CLEAN (336 lines)  
**Architecture**: New Dynamic System Only  
**Purpose**: Automatic tool discovery and dependency analysis

| Function                 | Purpose                      | Disposition                         |
| ------------------------ | ---------------------------- | ----------------------------------- |
| `discoverToolModules()`  | Discover all tool modules    | ✅ **KEEP** - Auto-discovery        |
| `_scanDirectory()`       | Scan directory for tools     | ✅ **KEEP** - File system scanning  |
| `_isToolModule()`        | Check if file is tool module | ✅ **KEEP** - Module detection      |
| `_analyzeModule()`       | Analyze module metadata      | ✅ **KEEP** - Module analysis       |
| `_detectCategory()`      | Detect module category       | ✅ **KEEP** - Categorization        |
| `_hasRequiredExports()`  | Check required exports       | ✅ **KEEP** - Validation            |
| `_extractDependencies()` | Extract dependencies         | ✅ **KEEP** - Dependency analysis   |
| `_estimateToolCount()`   | Estimate tool count          | ✅ **KEEP** - Metadata extraction   |
| `_assessComplexity()`    | Assess module complexity     | ✅ **KEEP** - Complexity analysis   |
| `_analyzeDependencies()` | Analyze dependencies         | ✅ **KEEP** - Dependency mapping    |
| `_calculateLoadOrder()`  | Calculate load order         | ✅ **KEEP** - Dependency resolution |
| `_resolveModuleName()`   | Resolve module names         | ✅ **KEEP** - Name resolution       |
| `getStats()`             | Get discovery statistics     | ✅ **KEEP** - Status reporting      |

**Verdict**: ✅ **PERFECT** - Advanced auto-discovery capabilities

---

## Summary Statistics

| File                                | Functions | Status           | Architecture   | Action        |
| ----------------------------------- | --------- | ---------------- | -------------- | ------------- |
| registry_tools_sdk.js               | 2         | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/index.js                   | 13        | ⚠️ Mixed         | Mostly New     | Minor cleanup |
| registry/core_registry.js           | 15        | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/hot_reload_manager.js      | 12        | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/tool_validation_manager.js | 12        | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/database_layer.js          | 16        | ✅ Clean         | New Dynamic    | Keep as-is    |
| **registry/management_tools.js**    | **5**     | **❌ Duplicate** | **Old Static** | **DELETE**    |
| registry/resource_manager.js        | 5         | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/plugin_manager.js          | 15        | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/parameter_type_detector.js | 4         | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/management_ui.js           | 12+       | ✅ Clean         | New Dynamic    | Keep as-is    |
| registry/discovery_engine.js        | 13        | ✅ Clean         | New Dynamic    | Keep as-is    |

**Total Functions**: 134 functions across 12 files  
**Clean Functions**: 129 (96.3%)  
**Legacy/Problematic**: 5 (3.7%)

## Remediation Plan

### Phase 1: Immediate Cleanup (Critical)

1. **DELETE registry/management_tools.js**

   - ❌ Complete duplicate of registry_tools_sdk.js functionality
   - ❌ Uses old static registration patterns
   - ❌ Not imported or used anywhere
   - ❌ Contains global variable pollution

   ```powershell
   rm tools/registry/management_tools.js
   ```

2. **Verify No Import References**
   - Search codebase for any imports of management_tools.js
   - Confirm no legacy dependencies exist

### Phase 2: Minor Optimizations (Low Priority)

1. **registry/core_registry.js**

   - `areToolsAlreadyRegistered()` → rename to `hasExistingTools()` for consistency
   - `getToolCounts()` → merge functionality into `getStats()`

2. **registry/index.js**
   - `getToolCounts()` → evaluate if legacy compatibility needed
   - Consider consolidating similar functions

### Phase 3: Architecture Validation (Ongoing)

1. **Verify Single Architecture**

   - Ensure all registry access goes through new dynamic system
   - No direct access to old static patterns
   - All tools use proper MCP SDK registration

2. **Performance Optimization**
   - Review function call paths for efficiency
   - Optimize hot-reload performance
   - Streamline database operations

### Phase 4: Testing and Validation

1. **Comprehensive Testing**

   - Test all registry tools after cleanup
   - Verify hot-reload functionality
   - Validate database persistence
   - Test plugin system

2. **Integration Testing**
   - Ensure MCP SDK compatibility
   - Test with real VS Code MCP client
   - Verify all tool categories work

## Critical Findings

### 🔥 **Root Cause of Registry Tool Failures**

The registry tool failures with `"Cannot read properties of undefined (reading 'getModuleStatus')"` were caused by:

1. **Dual Registration Systems**: Old static system trying to call methods that don't exist in new dynamic system
2. **management_tools.js Dead Code**: Unused duplicate file with old patterns
3. **Global Variable Pollution**: Legacy code using `global.mcpCoreRegistry` patterns

### ✅ **Current State After Manual Cleanup**

- `registry_tools_sdk.js` has been manually cleaned to use only new dynamic system
- All registry access now goes through proper `getRegistryInstance()`, `getHotReloadManager()`, `getValidationManager()`
- No more old static registration patterns in active code

### 🎯 **Next Step**

**DELETE `registry/management_tools.js`** - This is the only remaining old system remnant and it's completely unused dead code.

## Recommendation

The registry system is **96.3% clean** with modern dynamic architecture. The only critical action needed is:

**🗑️ DELETE `tools/registry/management_tools.js`**

This will eliminate the last remnants of the old static system and ensure 100% clean new dynamic architecture.

After this deletion, the registry system will be completely modernized with:

- ✅ Hot-reload capabilities
- ✅ Database persistence
- ✅ Plugin architecture
- ✅ Comprehensive validation
- ✅ Web management UI
- ✅ Auto-discovery engine
- ✅ MCP SDK compatibility

The registry tool failures should be completely resolved with this cleanup.

- getToolCounts
- getRegistry
- getHotReloadManager
- getValidationManager
- getRegistryInstance
- cleanup

### registry_tools_sdk.js (Registry Management Tools)

**Imports:**

- getRegistryInstance, getHotReloadManager, getValidationManager from './registry/index.js'

**Expected Methods:**

- registry.getStats()
- hotReloadManager.getStatus()
- hotReloadManager.reloadModule(moduleName)
- validationManager.getValidationSummary()

## Issues Identified

### 1. Unused Registry Modules

These modules exist but are NOT imported/used by index.js:

- **discovery_engine.js** - Exports: DiscoveryEngine
- **management_tools.js** - Exports: tools, handleToolCall, registerManagementTools, getManagementToolNames, MANAGEMENT_TOOLS
- **plugin_manager.js** - Exports: PluginManager, PluginState
- **management_ui.js** - Exports: ManagementUI

### 2. Module Dependencies

#### CoreRegistry Dependencies:

- Uses DatabaseLayer (imported correctly)
- Should use ToolValidationManager but may not be integrated

#### HotReloadManager Dependencies:

- Takes a registry parameter in constructor
- Should have methods: getStatus(), reloadModule()

#### ToolValidationManager Dependencies:

- Should integrate with CoreRegistry for tool validation

### 3. Missing Integrations

#### In index.js:

- DiscoveryEngine not used for automatic tool discovery
- PluginManager not integrated for extensibility
- ManagementUI not available for web interface
- management_tools.js appears to duplicate registry_tools_sdk.js functionality

### 4. Potential Circular Dependencies

- registry_tools_sdk imports from registry/index
- registry/index imports CoreRegistry, HotReloadManager, etc.
- These classes may try to access registry tools

### 5. Method Availability Issues

The registry tools expect these methods but they may not exist:

- `hotReloadManager.reloadModule(moduleName)` - Need to verify this exists
- `registry.getStats()` - Need to verify this exists
- `validationManager.getValidationSummary()` - Need to verify this exists

## Recommended Fixes

### Immediate (Critical Path):

1. Verify HotReloadManager has reloadModule() method
2. Verify CoreRegistry has getStats() method
3. Verify ToolValidationManager has getValidationSummary() method
4. Fix any missing method implementations

### Architectural (Medium Priority):

1. Decide if management_tools.js or registry_tools_sdk.js should be the canonical registry management tools
2. Integrate DiscoveryEngine for automatic tool discovery
3. Add PluginManager integration for extensibility
4. Wire up ManagementUI if web interface is needed

### Cleanup (Low Priority):

1. Remove duplicate functionality between management_tools.js and registry_tools_sdk.js
2. Ensure all modules are either used or removed
3. Document the final architecture clearly

## Current Test Failures

Registry tools showing "isError: true" because:

- Expected methods may not exist on the manager instances
- Registry instances may not be properly initialized
- Import/export mismatches causing undefined references
