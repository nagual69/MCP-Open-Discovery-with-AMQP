// Test script for Proxmox API formatting (ACTIVE)
//
// This script tests the formatting and output of various Proxmox API functions exposed by the MCP server.
// It is maintained and reusable for validating API output and display formatting.

const { 
  proxmox_list_nodes, 
  proxmox_get_node_details,
  proxmox_list_vms,
  proxmox_get_vm_details,
  proxmox_list_containers,
  proxmox_list_storage,
  proxmox_list_networks,
  proxmox_cluster_resources
} = require('./mcp_server');

async function runTests() {
  try {
    console.log("\n===== TESTING PROXMOX API FORMATTING =====\n");
    
    // Test proxmox_list_nodes
    console.log("Testing proxmox_list_nodes...");
    const nodes = await proxmox_list_nodes();
    console.log("Result:", nodes);
    console.log("\n---------------------------------\n");
    
    // Get first node name from the response to use in subsequent tests
    let nodeName = null;
    if (typeof nodes === 'string' && nodes.includes('node:')) {
      // Try to extract node name from the formatted response
      const match = nodes.match(/node:\s*(\w+)/);
      if (match) nodeName = match[1];
    }
    
    if (nodeName) {
      // Test proxmox_get_node_details
      console.log(`Testing proxmox_get_node_details for node ${nodeName}...`);
      const nodeDetails = await proxmox_get_node_details({ node: nodeName });
      console.log("Result:", nodeDetails);
      console.log("\n---------------------------------\n");
      
      // Test proxmox_list_vms
      console.log(`Testing proxmox_list_vms for node ${nodeName}...`);
      const vms = await proxmox_list_vms({ node: nodeName });
      console.log("Result:", vms);
      console.log("\n---------------------------------\n");
      
      // Test proxmox_list_containers
      console.log(`Testing proxmox_list_containers for node ${nodeName}...`);
      const containers = await proxmox_list_containers({ node: nodeName });
      console.log("Result:", containers);
      console.log("\n---------------------------------\n");
      
      // Test proxmox_list_storage
      console.log(`Testing proxmox_list_storage for node ${nodeName}...`);
      const storage = await proxmox_list_storage({ node: nodeName });
      console.log("Result:", storage);
      console.log("\n---------------------------------\n");
      
      // Test proxmox_list_networks
      console.log(`Testing proxmox_list_networks for node ${nodeName}...`);
      const networks = await proxmox_list_networks({ node: nodeName });
      console.log("Result:", networks);
      console.log("\n---------------------------------\n");
    }
    
    // Test proxmox_cluster_resources
    console.log("Testing proxmox_cluster_resources...");
    const resources = await proxmox_cluster_resources();
    console.log("Result:", resources);
    console.log("\n---------------------------------\n");
    
    console.log("All tests completed successfully!");
  } catch (error) {
    console.error("Error during testing:", error);
  }
}

runTests();
