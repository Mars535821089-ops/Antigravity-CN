(() => {
  const key = '__antigravityCnPermissionUiV1';
  if (globalThis[key]) { globalThis[key].scan(); return; }

  const exact = new Map([
    ['Yes, allow this time', '是，仅允许这一次'],
    ['Yes, allow', '是，允许'],
    ['Yes, and always allow', '是，并始终允许'],
    ['Yes, save rule', '是，保存规则'],
    ['the auto-run safety check did not reach a decision', '自动执行安全检查未能得出结论'],
    ['The auto-run safety check did not reach a decision', '自动执行安全检查未能得出结论'],
    ['No', '否'],
    ['不', '否'],
    ['(tell the agent what to do instead)', '（请告诉智能体应如何操作）'],
    ['tell the agent what to do instead', '请告诉智能体应如何操作'],
    ['in this conversation', '在当前对话中'],
    ['in this project', '在当前项目中'],
    ['in this workspace', '在当前工作区中'],
    ['when not in a project', '在项目之外'],
    ['globally', '在全局范围内'],
    ['for all projects', '对所有项目'],
  ]);
  const scopes = [
    ['when not in a project', '在项目之外'],
    ['in this conversation', '在当前对话中'],
    ['in this project', '在当前项目中'],
    ['in this workspace', '在当前工作区中'],
    ['for all projects', '对所有项目'],
    ['globally', '在全局范围内'],
  ];
  const excluded = 'pre,code,[data-testid="permission-target-editor"],' +
    '[data-testid="user-input-step"],[data-ag-localization-skip],' +
    'input,textarea,[contenteditable]:not([contenteditable="false"]),.monaco-editor,.xterm,.terminal';

  function translate(value, kind) {
    const core = value.trim();
    if (!core) return value;
    let translated = exact.get(core);
    if (!translated && kind === 'option') {
      for (const [suffix, chinese] of scopes) {
        if (core === "'" + ' ' + suffix || core === '"' + ' ' + suffix ||
            core === '’ ' + suffix || core === '” ' + suffix) {
          translated = core.slice(0, 2) + chinese;
          break;
        }
      }
    }
    if (!translated && kind === 'option') {
      translated = core;
      for (const [source, target] of [
        ['Yes, and always allow', '是，并始终允许'],
        ['Yes, save rule for', '是，保存以下操作的规则：'],
        ['Yes, save rule', '是，保存规则'],
      ]) {
        if (translated.startsWith(source) &&
            (translated.length === source.length || /\s/.test(translated[source.length]))) {
          translated = target + translated.slice(source.length);
          for (const [suffix, chinese] of scopes) {
            if (translated.endsWith(' ' + suffix)) {
              translated = translated.slice(0, -suffix.length) + chinese;
              break;
            }
          }
          break;
        }
      }
    }
    if (!translated && kind === 'header' && /^Allow [\s\S]+\?$/.test(core)) {
      translated = '是否允许' + core.slice(6, -1) + '？';
    }
    return translated && translated !== core
      ? value.slice(0, value.indexOf(core)) + translated + value.slice(value.indexOf(core) + core.length)
      : value;
  }

  function localize(root) {
    const cards = root.matches?.('[data-testid="interaction-takeover-card"]')
      ? [root] : Array.from(root.querySelectorAll('[data-testid="interaction-takeover-card"]'));
    for (const card of cards) {
      // A generic question from an agent is not a permission template.
      if (!card.querySelector('[data-testid="permission-target-editor"]')) continue;
      const walker = card.ownerDocument.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const element = node.parentElement;
        if (!element || element.closest(excluded)) continue;
        const kind = element.closest('[data-testid="ask-question-option-text"],[data-testid="ask-question-writein"]')
          ? 'option' : element.closest('[data-testid="ask-question-header-text"]') ? 'header' : 'reason';
        const original = node.nodeValue;
        const translated = translate(original, kind);
        if (translated !== original) node.nodeValue = translated;
      }
      for (const input of card.querySelectorAll('[data-testid="ask-question-writein"] input,[data-testid="ask-question-writein"] textarea')) {
        const placeholder = input.getAttribute('placeholder');
        if (placeholder) input.setAttribute('placeholder', translate(placeholder, 'option'));
      }
    }
  }

  let scheduled = false;
  const scan = () => localize(document);
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; scan(); });
  });
  globalThis[key] = { translate, localize, scan };
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      scan();
    }, { once: true });
  }
})();
