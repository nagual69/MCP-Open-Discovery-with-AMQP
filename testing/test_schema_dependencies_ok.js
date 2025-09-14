const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

(async () => {
  const schemaPath = path.join(__dirname, '..', 'docs', 'mcp-od-marketplace', 'specs', 'schemas', 'mcp-plugin.schema.v2.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  const manifest = {
    manifestVersion: '2',
    name: 'alpha',
    version: '1.2.3',
    entry: 'dist/index.js',
    dist: { hash: 'sha256:' + 'a'.repeat(64) },
    dependencies: ['bravo','charlie']
  };
  const ok = validate(manifest);
  if (!ok) {
    console.error('FAIL: dependencies rejected by schema', validate.errors);
    process.exit(1);
  }
  console.log('PASS: schema accepts dependencies');
})();
