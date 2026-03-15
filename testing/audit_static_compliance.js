/**
 * Quick MCP Response Format Compliance Audit
 * 
 * This script does a static analysis of tool modules to check MCP response format compliance
 * without executing actual network commands.
 */

const fs = require('fs');
const path = require('path');

/**
 * Analyze a tool module file for response format compliance
 */
function analyzeToolModule(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n🔍 Analyzing ${fileName}...`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];
  
  // Look for return statements in tool handlers
  const returnStatements = [];
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes('return {') && !line.includes('//')) {
      // Found a return statement, collect the full object
      let returnObj = '';
      let braceCount = 0;
      let j = i;
      
      while (j < lines.length) {
        const currentLine = lines[j].trim();
        returnObj += currentLine + '\n';
        
        // Count braces to find the end of the object
        for (const char of currentLine) {
          if (char === '{') braceCount++;
          if (char === '}') braceCount--;
        }
        
        if (braceCount === 0 && currentLine.includes('}')) {
          break;
        }
        j++;
      }
      
      returnStatements.push({
        lineNumber: i + 1,
        content: returnObj
      });
    }
  }
  
  console.log(`   Found ${returnStatements.length} return statements`);
  
  // Analyze each return statement
  returnStatements.forEach((stmt, index) => {
    console.log(`   📝 Checking return statement ${index + 1} (line ${stmt.lineNumber}):`);
    
    // Check for required MCP format patterns
    const hasContent = stmt.content.includes('content:');
    const hasContentArray = stmt.content.includes('content: [') || stmt.content.includes('content:[');
    const hasTextType = stmt.content.includes('type: "text"') || stmt.content.includes("type: 'text'");
    const hasTextField = stmt.content.includes('text:');
    const hasIsError = stmt.content.includes('isError:');
    
    if (!hasContent) {
      issues.push(`Line ${stmt.lineNumber}: Missing 'content' field`);
    } else if (!hasContentArray) {
      issues.push(`Line ${stmt.lineNumber}: 'content' should be an array`);
    } else {
      console.log(`      ✅ Has content array`);
    }
    
    if (!hasTextType) {
      issues.push(`Line ${stmt.lineNumber}: Missing 'type: "text"' in content`);
    } else {
      console.log(`      ✅ Has type: "text"`);
    }
    
    if (!hasTextField) {
      issues.push(`Line ${stmt.lineNumber}: Missing 'text' field in content`);
    } else {
      console.log(`      ✅ Has text field`);
    }
    
    if (stmt.content.includes('error') || stmt.content.includes('Error')) {
      if (!hasIsError) {
        console.log(`      ⚠️  Appears to be error response but missing 'isError: true'`);
      } else {
        console.log(`      ✅ Has isError for error response`);
      }
    }
  });
  
  return {
    fileName,
    returnStatements: returnStatements.length,
    issues
  };
}

/**
 * Run the static analysis audit
 */
function runStaticAudit() {
  console.log('🔍 Starting Static MCP Response Format Compliance Audit...\n');
  
  const toolFiles = [
    './plugins/src/net-utils/src/index.ts',
    './plugins/src/memory-cmdb/src/index.ts', 
    './plugins/src/nmap/src/index.ts',
    './plugins/src/proxmox/src/index.ts',
    './plugins/src/snmp/src/index.ts'
  ];
  
  const results = [];
  let totalIssues = 0;
  
  toolFiles.forEach(file => {
    if (fs.existsSync(file)) {
      const result = analyzeToolModule(file);
      results.push(result);
      totalIssues += result.issues.length;
      
      if (result.issues.length === 0) {
        console.log(`   ✅ No issues found`);
      } else {
        console.log(`   ❌ Found ${result.issues.length} issues:`);
        result.issues.forEach(issue => {
          console.log(`      - ${issue}`);
        });
      }
    } else {
      console.log(`   ⚠️  File not found: ${file}`);
    }
  });
  
  // Summary
  console.log('\n📊 Static Analysis Summary:');
  console.log(`   Files analyzed: ${results.length}`);
  console.log(`   Total return statements: ${results.reduce((sum, r) => sum + r.returnStatements, 0)}`);
  console.log(`   Total issues: ${totalIssues}`);
  
  if (totalIssues === 0) {
    console.log('\n🎉 All tool modules appear to be MCP response format compliant!');
  } else {
    console.log('\n⚠️  Some issues found. Review the details above.');
  }
  
  return results;
}

// Run the audit
if (require.main === module) {
  runStaticAudit();
}

module.exports = { runStaticAudit, analyzeToolModule };
