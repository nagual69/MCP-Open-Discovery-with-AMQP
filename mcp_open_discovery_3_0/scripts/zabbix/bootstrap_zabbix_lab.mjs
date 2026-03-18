const config = {
  baseUrl: process.env.ZABBIX_BOOTSTRAP_BASE_URL || 'http://zabbix-web:8080',
  username: process.env.ZABBIX_BOOTSTRAP_USERNAME || 'Admin',
  password: process.env.ZABBIX_BOOTSTRAP_PASSWORD || 'zabbix',
  hostGroupName: process.env.ZABBIX_BOOTSTRAP_GROUP || 'MCP Open Discovery Lab',
  primaryHost: process.env.ZABBIX_BOOTSTRAP_AGENT_HOST || 'Zabbix Test Agent',
  primaryDns: process.env.ZABBIX_BOOTSTRAP_AGENT_DNS || 'zabbix-agent',
  secondaryHost: process.env.ZABBIX_BOOTSTRAP_AGENT2_HOST || 'Test Web Server',
  secondaryDns: process.env.ZABBIX_BOOTSTRAP_AGENT2_DNS || 'zabbix-agent-2',
  primaryTemplate: process.env.ZABBIX_BOOTSTRAP_AGENT_TEMPLATE || 'Linux by Zabbix agent',
  secondaryTemplate: process.env.ZABBIX_BOOTSTRAP_AGENT2_TEMPLATE || 'Linux by Zabbix agent',
  staleHost: process.env.ZABBIX_BOOTSTRAP_STALE_HOST || 'Zabbix server',
  timeoutMs: Number.parseInt(process.env.ZABBIX_BOOTSTRAP_TIMEOUT_MS || '180000', 10),
  retryDelayMs: Number.parseInt(process.env.ZABBIX_BOOTSTRAP_RETRY_DELAY_MS || '5000', 10),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callZabbix(method, params, auth) {
  const payload = {
    jsonrpc: '2.0',
    method,
    params,
    id: Date.now(),
  };

  if (auth) {
    payload.auth = auth;
  }

  const response = await fetch(`${config.baseUrl}/api_jsonrpc.php`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json-rpc',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} calling ${method}`);
  }

  const body = await response.json();
  if (body.error) {
    throw new Error(`${method} failed: ${body.error.message} ${body.error.data || ''}`.trim());
  }

  return body.result;
}

async function waitForApi() {
  const deadline = Date.now() + config.timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      return await callZabbix('user.login', {
        username: config.username,
        password: config.password,
      });
    }
    catch (error) {
      lastError = error;
      console.log(`[zabbix-bootstrap] Waiting for API: ${error.message}`);
      await sleep(config.retryDelayMs);
    }
  }

  throw new Error(`Timed out waiting for Zabbix API: ${lastError?.message || 'unknown error'}`);
}

async function ensureHostGroup(auth, name) {
  const existing = await callZabbix('hostgroup.get', {
    output: ['groupid', 'name'],
    filter: { name: [name] },
  }, auth);

  if (existing.length > 0) {
    return existing[0].groupid;
  }

  const created = await callZabbix('hostgroup.create', { name }, auth);
  return created.groupids[0];
}

async function ensureTemplate(auth, name) {
  const existing = await callZabbix('template.get', {
    output: ['templateid', 'host', 'name'],
    filter: { host: [name] },
  }, auth);

  if (existing.length === 0) {
    throw new Error(`Template not found: ${name}`);
  }

  return existing[0].templateid;
}

async function getHost(auth, host) {
  const hosts = await callZabbix('host.get', {
    output: ['hostid', 'host', 'name', 'status'],
    filter: { host: [host] },
    selectInterfaces: ['interfaceid', 'ip', 'dns', 'port', 'type', 'useip', 'main'],
    selectParentTemplates: ['templateid', 'name'],
    selectGroups: ['groupid', 'name'],
  }, auth);

  return hosts[0] || null;
}

async function ensureHost(auth, hostDefinition) {
  const existing = await getHost(auth, hostDefinition.host);
  const desiredInterface = {
    type: 1,
    main: 1,
    useip: 0,
    ip: '',
    dns: hostDefinition.dns,
    port: '10050',
  };

  if (!existing) {
    const created = await callZabbix('host.create', {
      host: hostDefinition.host,
      name: hostDefinition.name,
      status: 0,
      interfaces: [desiredInterface],
      groups: [{ groupid: hostDefinition.groupId }],
      templates: [{ templateid: hostDefinition.templateId }],
    }, auth);
    return { action: 'created', hostId: created.hostids[0] };
  }

  await callZabbix('host.update', {
    hostid: existing.hostid,
    name: hostDefinition.name,
    status: 0,
    groups: [{ groupid: hostDefinition.groupId }],
    templates: [{ templateid: hostDefinition.templateId }],
  }, auth);

  const primaryInterface = existing.interfaces.find((item) => Number(item.main) === 1) || existing.interfaces[0];
  if (primaryInterface) {
    await callZabbix('hostinterface.update', {
      interfaceid: primaryInterface.interfaceid,
      ...desiredInterface,
    }, auth);
  }
  else {
    await callZabbix('hostinterface.create', {
      hostid: existing.hostid,
      ...desiredInterface,
    }, auth);
  }

  return { action: 'updated', hostId: existing.hostid };
}

async function removeStaleLoopbackHost(auth, hostName) {
  const existing = await getHost(auth, hostName);
  if (!existing) {
    return { action: 'absent' };
  }

  const agentInterface = existing.interfaces.find((item) => Number(item.type) === 1);
  if (!agentInterface) {
    return { action: 'kept', reason: 'no-agent-interface' };
  }

  const isLoopbackSeed = (agentInterface.ip === '127.0.0.1' || agentInterface.dns === 'localhost') && String(agentInterface.port) === '10050';
  if (!isLoopbackSeed) {
    return { action: 'kept', reason: 'not-loopback-seed' };
  }

  await callZabbix('host.delete', [existing.hostid], auth);
  return { action: 'deleted', hostId: existing.hostid };
}

async function main() {
  console.log(`[zabbix-bootstrap] Waiting for ${config.baseUrl}`);
  const auth = await waitForApi();

  const groupId = await ensureHostGroup(auth, config.hostGroupName);
  const primaryTemplateId = await ensureTemplate(auth, config.primaryTemplate);
  const secondaryTemplateId = await ensureTemplate(auth, config.secondaryTemplate);

  const staleResult = await removeStaleLoopbackHost(auth, config.staleHost);
  const primaryResult = await ensureHost(auth, {
    host: config.primaryHost,
    name: config.primaryHost,
    dns: config.primaryDns,
    groupId,
    templateId: primaryTemplateId,
  });
  const secondaryResult = await ensureHost(auth, {
    host: config.secondaryHost,
    name: config.secondaryHost,
    dns: config.secondaryDns,
    groupId,
    templateId: secondaryTemplateId,
  });

  console.log('[zabbix-bootstrap] Completed host sync');
  console.log(JSON.stringify({
    staleHost: staleResult,
    primaryHost: primaryResult,
    secondaryHost: secondaryResult,
  }, null, 2));

  await callZabbix('user.logout', [], auth);
}

main().catch((error) => {
  console.error(`[zabbix-bootstrap] ${error.stack || error.message}`);
  process.exit(1);
});