import { afterEach, describe, expect, test } from 'vitest';
import { mountApp } from '../../src/ui/app';

afterEach(() => {
  document.body.replaceChildren();
});

function openHome() {
  const root = document.createElement('div');
  document.body.append(root);
  mountApp(root);
  const input = root.querySelector('input');
  const form = root.querySelector('form');
  expect(input, '首页应有种子输入框').not.toBeNull();
  expect(form, '首页应有开始值班表单').not.toBeNull();
  if (!input || !form) throw new Error('缺少首页表单');
  return { root, input, form };
}

function submit(form: HTMLFormElement) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

const futureRuleBodies = [
  '使用的项目 API 必须存在且符合随附说明。',
  '使用 AI 辅助必须在 PR 描述的披露栏说明。',
  '不得删除或削弱相关测试来制造 CI 通过。',
  '不得引入隐藏执行、凭据外传或绕过验证的后门。',
];

test('五条规则按天解锁，各有正反例，只有后门规则使用拒绝裁决', async () => {
  const { default: rules } = await import('../../src/data/rules.json');
  expect(rules.map(({ id, unlockDay, violationVerdict }) => ({ id, unlockDay, violationVerdict })))
    .toEqual([
      { id: 'R1', unlockDay: 1, violationVerdict: 'request_changes' },
      { id: 'R2', unlockDay: 2, violationVerdict: 'request_changes' },
      { id: 'R3', unlockDay: 3, violationVerdict: 'request_changes' },
      { id: 'R4', unlockDay: 4, violationVerdict: 'request_changes' },
      { id: 'R5', unlockDay: 5, violationVerdict: 'reject' },
    ]);
  for (const rule of rules) {
    for (const text of [rule.title, rule.body, rule.examples.approve, rule.examples.violation]) {
      expect(text).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(rule.examples.approve).not.toBe(rule.examples.violation);
  }
});

describe('首页与第一天简报', () => {
  test('首页说明玩法及三种裁决，默认种子有可访问名称', () => {
    const { root, input } = openHome();
    expect(root.querySelector('h1')?.textContent).toBe('PRs, Please');
    expect(root.textContent).toContain('5 个工作日');
    expect(root.textContent).toContain('每天 6 份 PR');
    expect([...root.querySelectorAll('dt')].map((term) => term.textContent))
      .toEqual(['批准', '要求修改', '拒绝']);
    expect([...root.querySelectorAll('dd')].every((description) => description.textContent?.trim()))
      .toBe(true);
    expect(input.value).toBe('maintainer-001');
    expect(input.labels?.[0]?.textContent).toBe('挑战种子');
    expect(root.querySelector('button[type="submit"]')?.textContent).toBe('开始值班');
  });

  test.each(['', '中文', 'has space', 'a'.repeat(33), 'seed!'])('无效种子 %j 留在首页并关联错误', (seed) => {
    const { root, input, form } = openHome();
    input.value = seed;
    submit(form);

    const error = root.querySelector('[role="alert"]');
    expect(root.contains(form)).toBe(true);
    expect(error?.textContent).toContain('1–32');
    expect(error?.textContent).toContain('字母');
    expect(error?.textContent).toContain('数字');
    expect(error?.hasAttribute('hidden')).toBe(false);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')?.split(/\s+/)).toContain(error?.id);
    expect(document.activeElement).toBe(input);
    expect(root.textContent).not.toContain('第 1 天简报');
  });

  test.each(['a', 'a'.repeat(32), ' \tmaintainer-002\n '])('有效种子 %j 进入仅含 R1 的简报', (seed) => {
    const { root, input, form } = openHome();
    input.value = seed;
    submit(form);

    expect(root.querySelector('h2')?.textContent).toBe('第 1 天简报');
    expect(root.querySelector('code')?.textContent).toBe(seed.trim());
    expect(root.textContent).toContain('R1');
    expect(root.textContent).toContain('CI 必须通过；失败须修复后重审。');
    expect(root.textContent).toContain('可以批准');
    expect(root.textContent).toContain('要求修改');
    expect(root.querySelectorAll('.rule-example')).toHaveLength(2);
    expect(root.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(root.querySelector('h2'));
    for (const body of futureRuleBodies) expect(root.textContent).not.toContain(body);
    for (const id of ['R2', 'R3', 'R4', 'R5']) expect(root.textContent).not.toContain(id);
    expect(root.textContent).not.toMatch(/登录|API Key|密钥/);
  });

  test('无效输入修正后可用默认种子开局', () => {
    const { root, input, form } = openHome();
    input.value = 'bad seed';
    submit(form);
    input.value = 'maintainer-001';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.hasAttribute('aria-invalid')).toBe(false);
    expect(root.querySelector('[role="alert"]')?.hasAttribute('hidden')).toBe(true);
    submit(form);
    expect(root.querySelector('h2')?.textContent).toBe('第 1 天简报');
    expect(root.querySelector('code')?.textContent).toBe('maintainer-001');
  });
});
