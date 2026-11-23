import type { Rule } from '../game/types';

export function createManual(rules: readonly Rule[], day: number): HTMLDialogElement {
  const manual = document.createElement('dialog');
  manual.className = 'rule-manual';
  manual.tabIndex = -1;
  manual.setAttribute('aria-labelledby', 'manual-title');

  const header = document.createElement('div');
  header.className = 'manual-header';
  const title = document.createElement('h2');
  title.id = 'manual-title';
  title.textContent = '规则手册';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary-button';
  close.textContent = '关闭手册';
  close.addEventListener('click', () => manual.close());
  // 手册只有关闭按钮可操作；双向 Tab 均保持在对话框内。
  manual.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      close.focus();
    }
  });
  header.append(title, close);
  manual.append(header);

  for (const rule of rules) {
    const card = document.createElement('section');
    card.className = 'manual-rule';
    card.dataset.ruleId = rule.id;
    const heading = document.createElement('h3');
    const unlock = document.createElement('p');
    unlock.className = 'field-hint';
    unlock.textContent = `第 ${rule.unlockDay} 天解锁`;
    if (rule.unlockDay > day) {
      heading.textContent = `${rule.id} · 待解锁`;
      card.append(heading, unlock);
    } else {
      heading.textContent = `${rule.id} · ${rule.title}`;
      const status = document.createElement('p');
      status.className = 'rule-badge';
      status.textContent = '生效中';
      const body = document.createElement('p');
      body.className = 'rule-body';
      body.textContent = rule.body;
      card.append(heading, status, unlock, body);
      for (const [label, text] of [
        ['可以批准', rule.examples.approve],
        [rule.violationVerdict === 'reject' ? '拒绝' : '要求修改', rule.examples.violation],
      ]) {
        const example = document.createElement('div');
        example.className = 'rule-example';
        const exampleTitle = document.createElement('h4');
        exampleTitle.textContent = label;
        const description = document.createElement('p');
        description.textContent = text;
        example.append(exampleTitle, description);
        card.append(example);
      }
    }
    manual.append(card);
  }
  return manual;
}
