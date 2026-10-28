const fs=require('fs');
const crypto=require('crypto');
const vm=require('vm');
const acorn=require('acorn');
const base=process.env.ANTIGRAVITY_CN_BUILD_DIR;
const version=process.env.ANTIGRAVITY_CN_VERSION;
if(!base||!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(version))throw Error('Build directory and version required');
const digits=version.split('.').slice(0,2).join('');
const read=name=>JSON.parse(fs.readFileSync(`${base}/${name}`,'utf8'));
const source=fs.readFileSync(`${base}/main.js`,'utf8');
const nodes=read('ui-nodes.json');
const original=read('upstream-dictionary.json');
const automatic=read('local-translations.json');
const overrides=read('overrides.json');
const proper=new Set(('Shift Ctrl Alt Tab Escape Esc Command Option Finder gcert Google Google3 '+
  'GitHub GitLab Chrome Chromium Safari Firebase Antigravity Jetski Cider Buganizer Sponge '+
  'MCP JSON HTML CSS JavaScript Javascript TypeScript Python macOS MacOS Linux Windows WSL '+
  'VCS ABFS CitC Cog Pro Ultra PID CSP PII ADC API UTC Markdown LaTeX Jupyter CRON_TZ').split(' '));
const corrections=[
  [/代理(?!服务器|地址|设置|端口|连接|配置|网络|服务|认证|凭据)/g,'智能体'],
  [/人工制品/g,'产物'],[/分阶段/g,'暂存'],[/未上演/g,'未暂存'],[/喷气滑雪|摩托艇/g,'Jetski'],
  [/苹果酒/g,'Cider'],[/谷歌/g,'Google'],[/代币/g,'词元'],[/捆绑包|捆绑/g,'套件'],
  [/云顶/g,'Cloudtop'],[/主機端點/g,'主机端点'],[/伺服器/g,'服务器'],
];
function technical(text){
  const t=text.trim();
  if(proper.has(t)&&!overrides[t])return 'proper-name';
  if(!/[A-Za-z]/.test(t))return 'already-localized-or-numeric';
  if(!t || t.length<2)return 'punctuation-or-unit';
  if(/@keyframes|font-family:|background-color:|::-webkit|<svg|=>|function\s|\.code-line|\.file-viewer-root/.test(t))return 'style-or-code';
  if(/^(?:https?:|data:|blob:|plugin:|\/|\.\/|~\/|source\s)/.test(t)||t.includes('source ~/.'))return 'path-or-command';
  if(/^[\w./\\_@:#-]+$/.test(t)&&!(/^[A-Za-z]+$/.test(t)))return 'technical-identifier';
  if(/^(?:Gemini|Claude|GPT|Opus|Sonnet)\b/.test(t)&&t.length<65&&!/\b(?:is|will|available|plan|requires|limit|access)\b/i.test(t))return 'model-identifier';
  return null;
}
const lowerOriginal=new Map(Object.entries(original).map(([k,v])=>[k.trim().toLowerCase(),v]));
const merged={...automatic,...original,...overrides};
const lowerMerged=new Map(Object.entries(merged).map(([k,v])=>[k.trim().toLowerCase(),v]));
function translate(text){
  const t=text.trim();
  const reason=technical(text);
  if(reason)return {text,reason};
  let translated=overrides[text]??overrides[t]??original[text]??original[t]??
    lowerOriginal.get(t.toLowerCase())??automatic[text]??automatic[t]??lowerMerged.get(t.toLowerCase());
  if(!translated)return {text,reason:'unmapped'};
  for(const [pattern,value]of corrections)translated=translated.replace(pattern,value);
  const oldSlots=[...text.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort().join();
  const newSlots=[...translated.matchAll(/\{\d+\}/g)].map(x=>x[0]).sort().join();
  if(oldSlots!==newSlots)return {text,reason:'placeholder-mismatch'};
  const translatedCore=translated.trim();
  return {text:text.slice(0,text.indexOf(t))+translatedCore+text.slice(text.indexOf(t)+t.length),reason:'translated'};
}
const replacements=[];
const excluded=[];
const missing=new Set();
for(const node of nodes){
  const result=translate(node.text);
  if(result.reason!=='translated'||result.text===node.text){excluded.push({...node,reason:result.reason});if(result.reason==='unmapped')missing.add(node.text);continue;}
  let replacement;
  if(node.kind==='Literal')replacement=JSON.stringify(result.text);
  else{
    const templateSource=source.slice(node.start,node.end);
    const parsed=acorn.parseExpressionAt(templateSource,0,{ecmaVersion:'latest'});
    if(parsed.type!=='TemplateLiteral')throw Error('Expected template');
    const chunks=result.text.split(/(\{\d+\})/g);
    replacement='`'+chunks.map(chunk=>{
      const slot=chunk.match(/^\{(\d+)\}$/);
      if(slot){
        const expression=parsed.expressions[Number(slot[1])];if(!expression)throw Error('Bad slot');
        let code=templateSource.slice(expression.start,expression.end);
        // These values also drive automation configuration, so translate only
        // their presentation inside the title, never the original enum.
        if(['New {0}','Create {0}','Add {0}'].includes(node.text)) {
          code='(value=>({"Automation":"自动化任务","Scheduled Task":"计划任务","UI Extension":"界面扩展","Extension":"扩展"}[value]??value))('+code+')';
        }
        return '${'+code+'}';
      }
      return chunk.replace(/\\/g,'\\\\').replace(/`/g,'\\`').replace(/\$\{/g,'\\${');
    }).join('')+'`';
  }
  replacements.push({start:node.start,end:node.end,replacement,original:node.text,translated:result.text});
}
replacements.sort((a,b)=>b.start-a.start);
let patched=source;let boundary=Infinity;
for(const r of replacements){if(r.end>boundary)throw Error('Overlapping component patches');patched=patched.slice(0,r.start)+r.replacement+patched.slice(r.end);boundary=r.start;}
const localizedRevision=crypto.createHash('sha256').update(JSON.stringify(replacements)).digest('hex').slice(0,16)+'-ui2';
patched=patched.replace(/^'use strict';/, "'use strict';globalThis.__marsComponentChinese"+digits+"="+JSON.stringify(localizedRevision)+";");
const previewGuard='className:"rounded-xl border border-border overflow-hidden p-4 font-mono text-sm leading-relaxed"';
if(patched.split(previewGuard).length!==2)throw Error('Appearance code preview guard changed');
patched=patched.replace(previewGuard,`"data-ag-localization-skip":true,${previewGuard}`);
new vm.Script(patched);
fs.writeFileSync(`${base}/main.zh-CN.js`,patched);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
fs.writeFileSync(`${base}/bundle-manifest.json`,JSON.stringify({
  appVersion:version,localizedRevision,originalSHA256:hash(source),localizedSHA256:hash(patched),
  originalBytes:Buffer.byteLength(source),localizedBytes:Buffer.byteLength(patched),
},null,2));
const supplementary={};
for(const text of new Set([...nodes.map(n=>n.text),...Object.keys(overrides)])){
  const result=translate(text);if(result.reason==='translated')supplementary[text.trim()]=result.text.trim();
}
let payload=fs.readFileSync(`${base}/payload.base.js`,'utf8');
payload=payload.replaceAll('__marsAntigravityChinese'+digits,'__marsAntigravityChinese'+digits+'UIFull');
const marker='  const combinedDict = Object.assign({}, coreWords, dictionary);';
if(!payload.includes(marker))throw Error('Dictionary extension point changed');
payload=payload.replace(marker,`  Object.assign(dictionary, ${JSON.stringify(supplementary)});\n${marker}`);
const stringStart='  function translateString(text) {\n    if (!text) return text;';
if(!payload.includes(stringStart))throw Error('String translator entry changed');
payload=payload.replace(stringStart,`${stringStart}
    const uiTime=text.trim().match(/^(\\d{1,2}:\\d{2})\\s+(AM|PM)$/i);
    if(uiTime)return text.replace(text.trim(),(uiTime[2].toUpperCase()==='AM'?'上午':'下午')+uiTime[1]);`);
const translateGuard='  function translateNode(node) {\n    if (!node) return;';
if(!payload.includes(translateGuard))throw Error('Translator entry point changed');
payload=payload.replace(translateGuard,`${translateGuard}
    // Translate UI-only input hints without touching typed values or editor text.
    if (node.nodeType === Node.ELEMENT_NODE && ['INPUT','TEXTAREA'].includes(node.tagName)) {
      for (const attr of ['placeholder','title','aria-label']) {
        const text=node.getAttribute(attr);
        if(text) node.setAttribute(attr,translateString(text));
      }
      return;
    }`);
new vm.Script(payload);
fs.writeFileSync(`${base}/payload.js`,payload);
fs.writeFileSync(`${base}/supplementary-dictionary.json`,JSON.stringify(supplementary,null,2));
const coverage={
  sourceUINodes:nodes.length,uniqueUIStrings:new Set(nodes.map(n=>n.text)).size,
  patchedNodes:replacements.length,translatedUnique:new Set(replacements.map(r=>r.original)).size,
  supplementaryEntries:Object.keys(supplementary).length,
  functionalAttributesPatched:0,unmappedUnique:missing.size,
  exclusions:Object.fromEntries([...new Set(excluded.map(x=>x.reason))].map(reason=>[reason,excluded.filter(x=>x.reason===reason).length])),
};
fs.writeFileSync(`${base}/coverage.json`,JSON.stringify(coverage,null,2));
fs.writeFileSync(`${base}/source-translations.json`,JSON.stringify(replacements,null,2));
fs.writeFileSync(`${base}/source-exclusions.json`,JSON.stringify(excluded,null,2));
fs.writeFileSync(`${base}/unmapped.json`,JSON.stringify([...missing],null,2));
console.log('COVERAGE',coverage);console.log('UNMAPPED_COUNT',missing.size);
