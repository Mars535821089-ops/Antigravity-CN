import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const overrides = JSON.parse(await readFile(
  new URL('../src/dictionaries/overrides.json', import.meta.url), 'utf8',
));
const placeholders = text => [...text.matchAll(/\{\d+\}/g)].map(match => match[0]).sort();

test('2.28 newly reviewed navigation and settings labels have Chinese overrides', () => {
  for (const [source, expected] of [
    ['Reopen Closed Tab', '重新打开已关闭的标签页'],
    ['Open in Side Panel', '在侧边栏中打开'],
    ['Remote Agents Data', '远程智能体数据'],
    ['Search Workspaces…', '搜索工作区…'],
    ['Search Projects…', '搜索项目…'],
    ['Search tabs, files, extensions, artifacts, commands...', '搜索标签页、文件、扩展、产物和命令…'],
    ['End Live chat', '结束实时语音'],
    ['Built-in Browser', '内置浏览器'],
  ]) {
    assert.equal(overrides[source], expected, source);
  }
});

test('2.28 interpolated labels retain every substitution slot', () => {
  for (const [source, translation] of Object.entries(overrides)) {
    assert.deepEqual(placeholders(translation), placeholders(source), source);
  }
  for (const source of [
    '{0} (Default)',
    'Recording shortcut for {0}. Press keys to bind, Enter to save, Escape to cancel.',
    'Shortcut {0} for {1}',
    'Remove shortcut {0} for {1}',
    'Reset {0} to default',
    '{0}, voice {1} of {2}',
    'Sign in from the {0} panel.',
    'Account this MCP server uses: {0}',
    'Where the agent runs, current: {0}',
    'Live chat, {0}',
    'Blocked: {0}',
    'Details for {0}',
    'About {0}',
  ]) {
    assert.ok(overrides[source], `missing override: ${source}`);
    assert.deepEqual(placeholders(overrides[source]), placeholders(source), source);
  }
});

test('2.28 destructive-action and privacy warnings preserve their safety meaning', () => {
  const allowList = overrides[
    "The agent auto-executes commands matched by an allow list entry. For Unix shells, an allow list entry matches a command if its space-separated tokens form a prefix of the command's tokens. For PowerShell, the entry tokens may match any contiguous subsequence of the command tokens."
  ];
  assert.match(allowList, /自动执行/);
  assert.match(allowList, /Unix shell/);
  assert.match(allowList, /PowerShell/);
  assert.match(allowList, /任意连续子序列/);

  const deletion = overrides[
    "This permanently deletes all of your Remote Agents conversations, projects, scheduled tasks, connected plugins and settings, and stops any running remote agents. It can't be undone. Data in the desktop app and your Google account are not affected, and you can keep using Remote Agents afterwards."
  ];
  assert.match(deletion, /永久删除/);
  assert.match(deletion, /停止正在运行的远程智能体/);
  assert.match(deletion, /无法撤销/);
  assert.match(deletion, /桌面应用及 Google 账号中的数据不会受到影响/);
  assert.match(deletion, /仍可继续使用远程智能体/);

  const privacy = overrides[
    'You should not enter any sensitive information on this site (for example, passwords or credit cards), because it could be stolen by attackers.'
  ];
  assert.match(privacy, /请勿/);
  assert.match(privacy, /敏感信息/);
  assert.match(privacy, /密码或信用卡信息/);
  assert.match(privacy, /攻击者可能会窃取/);

  const denyList = overrides[
    'The agent asks for permission before executing commands matched by a deny list entry. The deny list follows the same matching rules as the allow list and takes precedence over the allow list.'
  ];
  assert.match(denyList, /请求许可/);
  assert.match(denyList, /优先于允许列表/);
});
