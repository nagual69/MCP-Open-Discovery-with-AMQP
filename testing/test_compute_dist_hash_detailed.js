const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { computeDistHashDetailed } = require('../tools/registry/plugin_loader');

function writeFile(p, content) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, content); }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcpod-hash-'));
  const dist = path.join(tmp, 'dist');
  writeFile(path.join(dist, 'index.js'), 'export const x=1;');
  writeFile(path.join(dist, 'sub', 'a.txt'), 'hello');
  writeFile(path.join(dist, 'sub', 'b.bin'), Buffer.from([1,2,3,4,5]));

  const { hashHex, fileCount, totalBytes, files } = computeDistHashDetailed(dist);
  if (!hashHex || fileCount !== 3 || !Array.isArray(files) || files.length !== 3) {
    console.error('FAIL: unexpected details', { hashHex, fileCount, totalBytes, files });
    process.exit(1);
  }

  // Recreate hash independently to ensure algorithm match
  const sorted = files.slice().sort();
  const h = crypto.createHash('sha256');
  for (const rel of sorted) {
    h.update(rel); h.update('\0'); h.update(fs.readFileSync(path.join(dist, rel)));
  }
  const expected = h.digest('hex');
  if (expected.toLowerCase() !== hashHex.toLowerCase()) {
    console.error('FAIL: hash mismatch', { expected, hashHex });
    process.exit(1);
  }
  console.log('PASS: computeDistHashDetailed');
})();
