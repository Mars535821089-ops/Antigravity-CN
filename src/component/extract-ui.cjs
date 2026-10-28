const fs = require('fs');
const vm = require('vm');
const acorn = require('acorn');
const base=process.env.ANTIGRAVITY_CN_BUILD_DIR;
if(!base)throw Error('Build directory required');
const source = fs.readFileSync(`${base}/main.js`, 'utf8');
const tree = acorn.parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
const payload = fs.readFileSync(`${base}/payload.base.js`, 'utf8');
const context = {
  document: { readyState: 'loading', addEventListener() {} },
  Element: { prototype: { attachShadow() {} } },
  Node: { TEXT_NODE: 3 },
};
const exportable = payload.replace(
  "  if (document.readyState === 'loading') {",
  '  globalThis.__translationAudit = {dictionary, translateString};\n' +
  "  if (document.readyState === 'loading') {",
);
vm.runInNewContext(exportable, context);
const { dictionary, translateString } = context.__translationAudit;
const records = new Map();
const uiKeys = new Set([
  'label','title','description','placeholder','tooltip','tooltipText','aria-label',
  'emptyText','loadingText','errorMessage','confirmText','cancelText','buttonText',
  'helperText','content','children','text','message','subtitle','name',
  'emptyMessage','emptyMessagePlural','searchPlaceholder','displayName','displayLabel',
  'heading','subheading','buttonLabel','tooltipContent','emptyStateMessage','emptyStateTitle',
]);
const functionalKeys = new Set(['type','className','id','key','value','data-testid','href','src','role','name']);
function meaningful(text) {
  return typeof text === 'string' && /[A-Za-z]{2}/.test(text) &&
    text.length > 1 && text.length < 2500 && !/^[\s\d.,:;_\/\\{}\[\]<>#@=+*%!?-]*$/.test(text) &&
    !/^(?:https?:|data:|blob:|plugin:|\/|\.\/)/.test(text) &&
    !/^[\w-]+\.(?:js|css|json|png|svg|jpg|md|ts|tsx)$/.test(text);
}
function add(node, reason) {
  if (node.start>=source.indexOf('const KHc=') && node.end<source.indexOf(';',source.indexOf('const KHc=')))return;
  let value;
  if (node.type === 'Literal' && typeof node.value === 'string') value=node.value;
  else if (node.type === 'TemplateLiteral') {
    value=node.quasis.map((q,i)=>q.value.cooked+(i<node.expressions.length?`{${i}}`:'')).join('');
  }
  if (!meaningful(value)) return;
  const key = `${node.start}:${node.end}`;
  if (!records.has(key)) records.set(key, {start:node.start,end:node.end,text:value,reason,kind:node.type});
}
function child(node, reason) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'Literal' || node.type === 'TemplateLiteral') add(node, reason);
  else if (node.type === 'ConditionalExpression') { child(node.consequent, reason);child(node.alternate, reason); }
  else if (node.type === 'LogicalExpression') child(node.right,reason);
  else if (node.type === 'BinaryExpression' && node.operator === '+') {child(node.left,reason);child(node.right,reason);}
  else if (node.type === 'ArrayExpression') node.elements.forEach(n=>child(n,reason));
}
function walk(node,parent) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && node.callee?.type === 'MemberExpression' &&
      node.callee.property?.name === 'createElement') {
    for (const arg of node.arguments.slice(2)) child(arg,'component-child');
    const props=node.arguments[1];
    if(props?.type==='ObjectExpression') {
      for(const property of props.properties) {
        const key=property.key?.name??property.key?.value;
        if(uiKeys.has(key)&&!functionalKeys.has(key)) child(property.value,`component-prop:${key}`);
      }
    }
  }
  if (node.type === 'Property') {
    const key=node.key?.name??node.key?.value;
    const codeSample=parent?.type==='ObjectExpression'&&parent.properties.some(p=>
      ['color','tokenType'].includes(p.key?.name??p.key?.value));
    if(!codeSample&&uiKeys.has(key)&&!functionalKeys.has(key)) child(node.value,`ui-field:${key}`);
  }
  for(const [key,value] of Object.entries(node)) {
    if(['start','end','loc','type'].includes(key))continue;
    if(Array.isArray(value))value.forEach(n=>walk(n,node));
    else if(value&&typeof value==='object')walk(value,node);
  }
}
walk(tree);
const all=Array.from(records.values());
const unique=Array.from(new Set(all.map(x=>x.text)));
const missing=unique.filter(text=>!(text.trim() in dictionary) && !Object.keys(dictionary).some(k=>k.toLowerCase()===text.trim().toLowerCase()));
const translated=Object.fromEntries(unique.map(text=>[text,translateString(text)]));
fs.writeFileSync(`${base}/ui-nodes.json`,JSON.stringify(all,null,2));
fs.writeFileSync(`${base}/ui-strings.json`,JSON.stringify(unique,null,2));
fs.writeFileSync(`${base}/missing-ui.json`,JSON.stringify(missing,null,2));
fs.writeFileSync(`${base}/upstream-dictionary.json`,JSON.stringify(dictionary,null,2));
fs.writeFileSync(`${base}/upstream-translations.json`,JSON.stringify(translated,null,2));
console.log(JSON.stringify({nodes:all.length,unique:unique.length,missing:missing.length,dictionary:Object.keys(dictionary).length}));
console.log('MISSING_COUNT',missing.length);
