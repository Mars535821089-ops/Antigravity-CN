import fs from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = await fs.readFile(new URL('../src/permission/permission-ui.js', import.meta.url), 'utf8');
const context = {
  document: { documentElement: {}, querySelectorAll: () => [] },
  MutationObserver: class { observe() {} },
  queueMicrotask,
  NodeFilter: { SHOW_TEXT: 4 },
};
vm.runInNewContext(source, context);
const { translate } = context.__antigravityCnPermissionUiV1;
const command = `python3 -c 'print("in this project")'`;
assert.equal(translate('Yes, allow this time', 'option'), '是，仅允许这一次');
for (const [scope, chinese] of [
  ['in this conversation','在当前对话中'],['in this project','在当前项目中'],
  ['in this workspace','在当前工作区中'],['globally','在全局范围内'],
]) {
  assert.equal(translate(`Yes, and always allow '${command}' ${scope}`, 'option'),
    `是，并始终允许 '${command}' ${chinese}`);
}
assert.equal(translate("Yes, and always allow '", 'option'), "是，并始终允许 '");
assert.equal(translate(' in this project', 'option'), ' 在当前项目中');
assert.equal(translate('Allow test operation?', 'header'), '是否允许test operation？');
assert.equal(translate('the auto-run safety check did not reach a decision', 'reason'), '自动执行安全检查未能得出结论');
assert.equal(translate('(tell the agent what to do instead)', 'option'), '（请告诉智能体应如何操作）');
assert.equal(translate(command, 'option'), command);
assert.equal(translate('Allow test operation?', 'reason'), 'Allow test operation?');
assert.equal(translate('Do not change user text: Yes, and always allow', 'option'),
  'Do not change user text: Yes, and always allow');
console.log('PASS: fixed permission labels, four scopes, split nodes, command preservation, header and reason');
