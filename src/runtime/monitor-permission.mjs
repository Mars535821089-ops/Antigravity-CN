import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CDP, discoverApp } from './cdp.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const manifest=JSON.parse(await fs.readFile(root + '/bundle-manifest.json','utf8')); const supportedVersion=manifest.appVersion; const sessions=new Map();
let stop=false;
let last='';
const matches=target=>{
  if(target.type!=='page')return false;
  if(target.title!=='Antigravity'&&!target.title.endsWith(' - Antigravity'))return false;
  try {const url=new URL(target.url);return url.protocol==='https:'&&url.hostname==='127.0.0.1';}
  catch{return false;}
};
async function status(state,windows=0){
  const value=JSON.stringify({state,windows});
  if(last===value)return;
  last=value;
  await fs.writeFile(`${root}/status.json`,JSON.stringify({
    state,windows,noRestart:true,noReload:true,updatedAt:new Date().toISOString(),
  },null,2),{mode:0o600});
}
async function tick(){
  const version=execFileSync('/usr/bin/plutil',[
    '-extract','CFBundleShortVersionString','raw','/Applications/Antigravity.app/Contents/Info.plist',
  ],{encoding:'utf8',timeout:3000}).trim();
  if(version!==supportedVersion){await status('version-mismatch');return;}
  const {port,targets}=await discoverApp(`${process.env.HOME}/Library/Application Support/Antigravity`);
  const listener=execFileSync('/usr/sbin/lsof',['-nP',`-iTCP:${port}`,'-sTCP:LISTEN','-Fp'],
    {encoding:'utf8',timeout:3000});
  const pids=[...new Set(listener.split('\n').filter(x=>/^p\d+$/.test(x)).map(x=>x.slice(1)))];
  if(pids.length!==1)throw Error('Unexpected local listener');
  const command=execFileSync('/bin/ps',['-p',pids[0],'-o','command='],
    {encoding:'utf8',timeout:3000}).trim();
  if(!/^\/Applications\/Antigravity\.app\/Contents\/MacOS\/Antigravity(?: |$)/.test(command)){
    throw Error('Unexpected application listener');
  }
  const source=await fs.readFile(`${root}/permission-ui.js`,'utf8');
  const ids=new Set();
  for(const target of targets.filter(matches)){
    ids.add(target.id);
    if(sessions.has(target.id))continue;
    const client=await CDP.connect(target.webSocketDebuggerUrl);
    try{
      const script=await client.send('Page.addScriptToEvaluateOnNewDocument',{
        source,worldName:'antigravity-cn-permission-'+supportedVersion,
      });
      const {frameTree}=await client.send('Page.getFrameTree');
      const {executionContextId}=await client.send('Page.createIsolatedWorld',{
        frameId:frameTree.frame.id,worldName:'antigravity-cn-permission-'+supportedVersion,
      });
      await client.evaluate(source,{contextId:executionContextId});
      sessions.set(target.id,{client,script:script.identifier});
      client.ws.addEventListener('close',()=>sessions.delete(target.id));
    }catch(error){client.close();throw error;}
  }
  for(const [id,entry]of sessions)if(!ids.has(id)){entry.client.close();sessions.delete(id);}
  await status(sessions.size?'active':'waiting-for-window',sessions.size);
}
async function shutdown(){
  if(stop)return;stop=true;
  for(const entry of sessions.values()){
    await entry.client.send('Page.removeScriptToEvaluateOnNewDocument',{identifier:entry.script}).catch(()=>{});
    entry.client.close();
  }
  await status('stopped');process.exit(0);
}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
while(!stop){
  try{await tick();}catch{await status('waiting-for-application',sessions.size);}
  await new Promise(resolve=>setTimeout(resolve,1500));
}
