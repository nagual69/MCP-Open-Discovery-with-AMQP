# Proxmox Resource Detection Improvements

## Problem

The test script would sometimes fail when encountering resources of the wrong type, specifically when trying to access containers using VM APIs or vice versa. For example, trying to get VM details for a resource that is actually a container would result in errors like "Configuration file 'nodes/ccctc16gb01/qemu-server/104.conf' does not exist".

## Solution

We've improved the test script to:

1. Efficiently discover resources using the cluster API first (with node API fallback)
2. Accurately detect resource types (VM vs container) before testing
3. Provide clear error messages when resource type mismatches occur
4. Automatically select the correct resource types for testing

## How it Works

### 1. Resource Discovery

The script now uses a more efficient approach to discover resources:

- First tries to get all resources at once using `proxmox_cluster_resources` API
- Falls back to individual node discovery if that fails
- Properly categorizes resources by type (node, VM, container)

### 2. Type Detection

- Added helper functions `isVM()` and `isContainer()` to check resource types
- Implemented robust filtering during discovery to ensure correct type detection
- Enhanced `verifyResourceType()` function to provide suggested tools

### 3. Error Handling

- Added detailed error messages for resource type mismatches
- Extracts and displays the specific configuration file path from error messages
- Provides guidance on using the correct API for each resource type

### 4. Automatic Resource Selection

- Tests now automatically select appropriate resources based on their types
- VM tests only use VM resources, and container tests only use container resources
- When no resources of the needed type exist, tests are automatically skipped

## Testing the Improvements

To test these changes:

1. Run the comprehensive test script with Proxmox testing enabled
2. The script will automatically discover and categorize resources
3. VM and container details tests will be run with the correct resource types

Example:

```bash
node test_comprehensive.js proxmox --proxmox-server=your-server --proxmox-user=your-user --proxmox-password=your-pass
```

## Future Enhancements

- Add option to automatically create test VMs/containers if none exist
- Implement cleanup of test resources after testing
- Add more granular testing of specific resource features
