'use strict';
const http = require('http');
const b = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
const req = http.request({
  hostname: '127.0.0.1', port: 6270, path: '/mcp', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': b.length, 'Accept': 'application/json' }
}, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const m = d.match(/data: (\{.+\})/);
    if (m) {
      const j = JSON.parse(m[1]);
      if (j.result && j.result.tools) {
        console.log('tools/list count:', j.result.tools.length);
        j.result.tools.slice(0, 10).forEach(t => console.log(' ', t.name));
      } else if (j.error) {
        console.log('ERROR:', JSON.stringify(j.error));
      }
    } else {
      console.log('raw:', d.substring(0, 300));
    }
  });
});
req.on('error', e => console.error('req err:', e.message));
req.write(b);
req.end();
