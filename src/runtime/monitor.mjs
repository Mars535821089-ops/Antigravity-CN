import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CDP, discoverApp, isAppPage } from './cdp.mjs';
import { loadBundle, interceptBundle } from './bundle-interceptor.mjs';
import { captureOfficialUI } from './capture-ui.mjs';
import { registerMonitor } from './process-control.mjs';
import { isApprovedSource } from './source-fingerprint.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const pidFile = await registerMonitor(root, 'monitor');
const manifest=JSON.parse(await fs.readFile(root + '/bundle-manifest.json','utf8'));
const supportedVersion = manifest.appVersion;
const componentFlag='__marsComponentChinese'+supportedVersion.split('.').slice(0,2).join('');
const app = '/Applications/Antigravity.app';
const dataDir = `${process.env.HOME}/Library/Application Support/Antigravity`;
const statusPath = `${root}/status.json`;
const worldName = 'antigravity-cn-'+supportedVersion;
const connections = new Map();
const payload = await fs.readFile(`${root}/payload.js`, 'utf8');
const bundle = await loadBundle(root);
let componentBundlePatched = false;
let componentBundleWarning;
let stopping = false;
let currentStatus = '';
let lastFingerprintCheckAt = 0;
let lastFingerprintCheck;

async function status(state, extra = {}) {
  extra={...extra,componentBundlePatched,...(componentBundleWarning?{componentBundleWarning}:{})};
  const key = JSON.stringify({ state, ...extra });
  if (key === currentStatus) return;
  currentStatus = key;
  const value = JSON.stringify({ state, supportedVersion, time: new Date().toISOString(), ...extra }, null, 2);
  await fs.writeFile(`${statusPath}.tmp`, value, { mode: 0o600 });
  await fs.rename(`${statusPath}.tmp`, statusPath);
  console.log(`${new Date().toISOString()} ${state}`);
}

function appVersion() {
  return execFileSync('/usr/bin/plutil', [
    '-extract', 'CFBundleShortVersionString', 'raw', `${app}/Contents/Info.plist`,
  ], { encoding: 'utf8', timeout: 3000 }).trim();
}

function checkListener(port) {
  const output = execFileSync('/usr/sbin/lsof', [
    '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp',
  ], { encoding: 'utf8', timeout: 3000 });
  const pids = [...new Set(output.split('\n').filter(x => /^p\d+$/.test(x)).map(x => x.slice(1)))];
  if (pids.length !== 1) throw new Error('Unexpected debugging listener ownership');
  const command = execFileSync('/bin/ps', ['-p', pids[0], '-o', 'command='], {
    encoding: 'utf8', timeout: 3000,
  }).trim();
  if (command !== `${app}/Contents/MacOS/Antigravity` &&
      !command.startsWith(`${app}/Contents/MacOS/Antigravity `)) {
    throw new Error('Debugging listener is not the expected Antigravity application');
  }
}

async function checkUpdatedFingerprint(version) {
  if (lastFingerprintCheck && lastFingerprintCheck.version === version &&
      Date.now() - lastFingerprintCheckAt < 60_000) {
    return lastFingerprintCheck;
  }
  lastFingerprintCheckAt = Date.now();
  try {
    const captured = await captureOfficialUI();
    const fingerprints = JSON.parse(await fs.readFile(
      join(root, 'source-fingerprints.json'), 'utf8',
    ));
    lastFingerprintCheck = {
      version,
      state: captured.version === version &&
        isApprovedSource(version, captured.sha256, fingerprints)
        ? 'approved-fingerprint' : 'unknown-fingerprint',
      sha256: captured.sha256,
    };
  } catch (error) {
    lastFingerprintCheck = {
      version,
      state: 'fingerprint-check-unavailable',
      error: error.message.slice(0, 200),
    };
  }
  return lastFingerprintCheck;
}

async function inject(client, frameId) {
  const { executionContextId } = await client.send('Page.createIsolatedWorld', {
    frameId, worldName,
  });
  await client.evaluate(payload, { contextId: executionContextId });
}

async function attach(target) {
  const client = await CDP.connect(target.webSocketDebuggerUrl);
  const entry = { client, script: undefined, reloadAttempted:false };
  connections.set(target.id, entry);
  try {
    client.listeners.add(message => {
      if(message.method==='Fetch.requestPaused') {
        interceptBundle(client,message,bundle,(success,warning)=>{
          componentBundlePatched=success;
          componentBundleWarning=warning;
        }).catch(error=>{componentBundleWarning=error.message;});
      }
      if (message.method === 'Page.frameNavigated' && !message.params.frame.parentId && !stopping) {
        const { frame } = message.params;
        try {
          const url = new URL(frame.url);
          if (url.protocol === 'https:' && url.hostname === '127.0.0.1') {
            inject(client, frame.id).catch(() => {});
          }
        } catch {}
      }
    });
    await client.send('Page.enable');
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled',{cacheDisabled:true});
    await client.send('Fetch.enable',{patterns:[{
      urlPattern:'https://127.0.0.1:*/main.js',resourceType:'Script',requestStage:'Response',
    }]});
    // Persistence across reload uses an isolated JS world, as Electron preload does.
    const added = await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: payload, worldName,
    });
    entry.script = added.identifier;
    const { frameTree } = await client.send('Page.getFrameTree');
    await inject(client, frameTree.frame.id);
    const sourceState=await client.evaluate(`({
      revision:globalThis[${JSON.stringify(componentFlag)}],
      ready:document.readyState==='complete'&&!!document.querySelector('[contenteditable="true"],textarea'),
      draft:Array.from(document.querySelectorAll('[contenteditable="true"],textarea'))
        .some(e=>(e.value??e.textContent??'').trim().length>0),
      messages:document.querySelectorAll('[data-testid="user-input-step"]').length
    })`);
    // Preserve live project state; source replacement waits for a natural navigation.
    if(sourceState.revision!==bundle.manifest.localizedRevision&&sourceState.ready&&!sourceState.draft&&!sourceState.messages) {
      entry.reloadAttempted=true; // User prohibits automatic reload; wait for natural navigation.
    } else if(sourceState.revision===bundle.manifest.localizedRevision) componentBundlePatched=true;
    client.ws.addEventListener('close', () => {
      if (connections.get(target.id) === entry) connections.delete(target.id);
    });
    await status('active', { localizedWindows: connections.size, installedVersion: supportedVersion });
  } catch (error) {
    connections.delete(target.id);
    client.close();
    throw error;
  }
}

async function detach(entry) {
  await entry.client.send('Fetch.disable').catch(()=>{});
  await entry.client.send('Network.setCacheDisabled',{cacheDisabled:false}).catch(()=>{});
  if (entry.script) {
    await entry.client.send('Page.removeScriptToEvaluateOnNewDocument', {
      identifier: entry.script,
    }).catch(() => {});
  }
  entry.client.close();
}

async function tick() {
  const version = appVersion();
  if (version !== supportedVersion) {
    for (const entry of connections.values()) await detach(entry);
    connections.clear();
    const updateCheck = await checkUpdatedFingerprint(version);
    await status('version-mismatch', { installedVersion: version, updateCheck });
    return;
  }
  let result;
  try { result = await discoverApp(dataDir); }
  catch {
    for (const entry of connections.values()) entry.client.close();
    connections.clear();
    await status('waiting-for-antigravity');
    return;
  }
  checkListener(result.port);
  const targets = result.targets.filter(isAppPage);
  const ids = new Set(targets.map(target => target.id));
  for (const [id, entry] of connections) {
    if (!ids.has(id)) { await detach(entry); connections.delete(id); }
  }
  for (const target of targets) {
    if (!connections.has(target.id)) await attach(target);
  }
  for(const entry of connections.values()) {
    if(entry.reloadAttempted)continue;
    const check=await entry.client.evaluate(`({
      revision:globalThis[${JSON.stringify(componentFlag)}],
      safe:location.pathname==='/'&&document.readyState==='complete'&&
        !!document.querySelector('[contenteditable="true"],textarea')&&
        !document.querySelector('[role="dialog"],[data-testid="user-input-step"]')&&
        Array.from(document.querySelectorAll('[contenteditable="true"],textarea'))
          .every(e=>!(e.value??e.textContent??'').trim())
    })`);
    if(check.revision===bundle.manifest.localizedRevision)componentBundlePatched=true;
    else if(check.safe) {
      entry.reloadAttempted=true; // Never refresh an application page automatically.
    }
  }
  if (connections.size) await status('active', {
    localizedWindows: connections.size, installedVersion: version,
  });
  else await status('waiting-for-app-window');
}

async function stop() {
  if (stopping) return;
  stopping = true;
  for (const entry of connections.values()) await detach(entry);
  connections.clear();
  await status('stopped');
  await fs.rm(pidFile, { force: true });
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

while (!stopping) {
  try { await tick(); }
  catch (error) { await status('connection-error', { error: error.message.slice(0, 200) }); }
  await new Promise(resolve => setTimeout(resolve, 3000));
}
