import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mountApp } from '../../src/ui/app';

const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map((name) => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));

beforeEach(() => {
  // jsdom 不实现 modal 生命周期；真实的焦点约束及 Escape 由浏览器验证。
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  } });
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  dialogMethods.forEach((name, index) => {
    const descriptor = originalMethods[index];
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  });
});

function mount(): HTMLElement {
  const root = document.createElement('div');
  document.body.append(root);
  mountApp(root);
  return root;
}

function button(root: ParentNode, name: string): HTMLButtonElement {
  const found = [...root.querySelectorAll('button')].find((entry) => entry.textContent === name && !entry.hidden);
  expect(found, `缺少按钮：${name}`).toBeDefined();
  if (!found) throw new Error(`缺少按钮：${name}`);
  return found;
}

function start(root: HTMLElement, seed = 'maintainer-001'): void {
  const input = root.querySelector('input');
  const form = root.querySelector('form');
  if (!input || !form) throw new Error('缺少种子表单');
  input.value = seed;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  button(root, root.querySelector('.home')?.textContent?.includes('继续值班') ? '重新开始' : '开始值班').focus();
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function dialog(root: HTMLElement): HTMLDialogElement {
  const found = root.querySelector<HTMLDialogElement>('dialog[open]');
  expect(found, '应在覆盖前显示确认对话框').not.toBeNull();
  if (!found) throw new Error('缺少确认对话框');
  return found;
}

function reviewWithDraft(root: HTMLElement): void {
  start(root);
  button(root, '开始评审').click();
  button(root, '批准').click();
  button(root, '提交裁决').click();
  button(root, '下一份').click();
  root.querySelector<HTMLButtonElement>('[data-evidence-id="disclosure"]')?.click();
  button(root, '要求修改').click();
}

function expectDraft(root: HTMLElement): void {
  expect(root.querySelector('#review-title')?.textContent).toContain('PR d1-05 ·');
  expect(root.querySelector('time')?.textContent).toBe('10:30');
  expect(root.querySelector('.shift-score')?.textContent).toBe('累计得分：10 分');
  expect(root.querySelector('[aria-label="待审进度：第 2 份，共 6 份"]')?.textContent).toBe('2/6');
  expect(root.querySelector('[data-evidence-id="disclosure"]')?.getAttribute('aria-pressed')).toBe('true');
  expect(button(root, '要求修改').getAttribute('aria-pressed')).toBe('true');
  expect(button(root, '提交裁决').disabled).toBe(false);
}

function expectFresh(root: HTMLElement, seed: string, id: string): void {
  expect(root.querySelector('h2')?.textContent).toBe('第 1 天简报');
  expect(root.querySelector('code')?.textContent).toBe(seed);
  expect(document.activeElement).toBe(root.querySelector('h2'));
  button(root, '开始评审').click();
  expect(root.querySelector('#review-title')?.textContent).toContain(`PR ${id} ·`);
  expect(root.querySelector('time')?.textContent).toBe('09:00');
  expect(root.querySelector('.shift-score')?.textContent).toBe('累计得分：0 分');
  expect(root.querySelector('[aria-label="待审进度：第 1 份，共 6 份"]')?.textContent).toBe('1/6');
  expect(root.querySelectorAll('[aria-pressed="true"]')).toHaveLength(0);
  expect(button(root, '提交裁决').disabled).toBe(true);
}

describe('覆盖确认与内存导航', () => {
  test('第一次开局不确认；已有未评审的简报也必须确认，取消后可继续原简报', () => {
    const root = mount();
    expect(root.querySelector('.home')?.textContent).not.toContain('继续值班');
    start(root);
    expect(root.querySelector('dialog[open]')).toBeNull();
    button(root, '返回首页').click();
    expect(document.activeElement).toBe(root.querySelector('#home-title'));
    start(root, 'maintainer-002');
    const confirmation = dialog(root);
    expect(confirmation.textContent).toContain('maintainer-001');
    expect(confirmation.textContent).toContain('maintainer-002');
    expect(confirmation.textContent).toMatch(/清空.*成绩.*草稿/);
    button(confirmation, '取消').click();
    expect(root.querySelector('input')?.value).toBe('maintainer-002');
    expect(document.activeElement).toBe(button(root, '重新开始'));
    button(root, '继续值班').click();
    expect(root.querySelector('h2')?.textContent).toBe('第 1 天简报');
    expect(root.querySelector('code')?.textContent).toBe('maintainer-001');
  });

  test.each(['取消', 'Escape'])('%s 覆盖后继续同一 PR，保留裁决、证据草稿、记录和 10 分', (method) => {
    const root = mount();
    reviewWithDraft(root);
    button(root, '返回首页').click();
    start(root, 'maintainer-002');
    const confirmation = dialog(root);
    expect(document.activeElement).toBe(button(confirmation, '取消'));
    if (method === '取消') button(confirmation, '取消').click();
    else confirmation.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(root.contains(confirmation)).toBe(false);
    button(root, '继续值班').click();
    expectDraft(root);
    button(root, '提交裁决').click();
    expect(root.querySelector('.shift-score')?.textContent).toBe('累计得分：15 分');
  });

  test.each(['maintainer-001', ' \tmaintainer-002\n '])('确认覆盖 %j 清空旧记录与草稿并允许重新裁决', (seed) => {
    const root = mount();
    reviewWithDraft(root);
    button(root, '返回首页').click();
    start(root, seed);
    const confirm = button(dialog(root), '确认覆盖');
    confirm.click();
    expectFresh(root, seed.trim(), seed.trim() === 'maintainer-001' ? 'd1-02' : 'd1-03');
    // 旧对话框按钮的重复事件不能再次清空已经开始的新局。
    button(root, '批准').click();
    button(root, '提交裁决').click();
    confirm.click();
    expect(root.querySelector('.shift-score')?.textContent).toBe('累计得分：10 分');
    expect(root.querySelector('.feedback')).not.toBeNull();
  });

  test.each(['', '中文', 'bad seed', 'a'.repeat(33)])('有当前局时非法种子 %j 仍先校验，且不影响原局', (seed) => {
    const root = mount();
    reviewWithDraft(root);
    button(root, '返回首页').click();
    start(root, seed);
    expect(root.querySelector('dialog[open]')).toBeNull();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('1–32');
    button(root, '继续值班').click();
    expectDraft(root);
  });

  test('反馈返回首页后继续仍锁定，取消覆盖不会重复计分', () => {
    const root = mount();
    start(root);
    button(root, '开始评审').click();
    button(root, '批准').click();
    button(root, '提交裁决').click();
    button(root, '返回首页').click();
    start(root);
    button(dialog(root), '取消').click();
    button(root, '继续值班').click();
    expect(root.querySelector('.feedback')).not.toBeNull();
    expect(button(root, '提交裁决').disabled).toBe(true);
    expect(root.querySelector('time')?.textContent).toBe('10:30');
    expect(root.querySelector('.shift-score')?.textContent).toBe('累计得分：10 分');
  });

  test('最终页可取消同种子重玩、返回首页继续原成绩，再确认重玩得到全新局', () => {
    const root = mount();
    start(root);
    for (let day = 1; day <= 5; day++) {
      button(root, '开始评审').click();
      for (let index = 0; index < 6; index++) {
        button(root, '批准').click();
        button(root, '提交裁决').click();
        button(root, index === 5 ? '查看日结' : '下一份').click();
      }
      button(root, day === 5 ? '查看最终成绩' : '下一天').click();
    }
    expect(root.querySelectorAll('.summary-record')).toHaveLength(30);
    button(root, '同种子再来一次').focus();
    button(root, '同种子再来一次').click();
    button(dialog(root), '取消').click();
    expect(document.activeElement).toBe(button(root, '同种子再来一次'));
    expect(root.querySelector('.final-summary')?.textContent).toContain('总得分：110/300');
    expect(root.querySelectorAll('.summary-record')).toHaveLength(30);
    button(root, '返回首页').click();
    expect(root.querySelector('dialog[open]')).toBeNull();
    button(root, '继续值班').click();
    expect(root.querySelector('.final-summary')?.textContent).toContain('总得分：110/300');
    button(root, '同种子再来一次').click();
    button(dialog(root), '确认覆盖').click();
    expectFresh(root, 'maintainer-001', 'd1-02');
    expect(root.querySelectorAll('.summary-record')).toHaveLength(0);
  });
});
