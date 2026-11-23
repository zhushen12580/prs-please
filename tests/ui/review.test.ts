import { afterEach, describe, expect, test, vi } from 'vitest';
import { getDayCases, rules } from '../../src/content/load';
import type { ReviewCase } from '../../src/game/types';
import { mountApp } from '../../src/ui/app';
import { createManual } from '../../src/ui/manual';
import { createReview } from '../../src/ui/review';

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});

function firstCase(id = 'd1-02'): ReviewCase {
  const reviewCase = getDayCases(1).find((entry) => entry.id === id);
  if (!reviewCase) throw new Error(`缺少测试案例 ${id}`);
  return reviewCase;
}

function renderCase(reviewCase = firstCase(), day = 1) {
  const onEvidenceChange = vi.fn();
  const review = createReview({
    reviewCase, day, position: 1, total: 6, time: '09:00', rules, onEvidenceChange,
  });
  document.body.append(review);
  return { review, onEvidenceChange };
}

function evidence(root: ParentNode, id: string): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(`[data-evidence-id="${id}"]`);
  if (!button) throw new Error(`没有渲染证据 ${id}`);
  return button;
}

test('第一天简报通过开始评审进入默认种子的真实首题', () => {
  const root = document.createElement('div');
  document.body.append(root);
  mountApp(root);
  root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const start = [...root.querySelectorAll('button')].find((button) => button.textContent === '开始评审');
  expect(start, '简报应提供开始评审入口').toBeDefined();
  start?.click();

  expect(root.querySelector('h2')?.textContent).toBe('PR d1-02 · 为标签转义合理增加测试覆盖');
  expect(document.activeElement).toBe(root.querySelector('h2'));
  for (const text of ['第 1 天', '1/6', '09:00', 'maintainer-001']) {
    expect(root.textContent).toContain(text);
  }
  const submit = [...root.querySelectorAll('button')].find((button) => button.textContent === '提交裁决');
  expect(submit).toBeDefined();
  expect(submit?.disabled).toBe(true);
});

describe('工作台材料', () => {
  test.each(['d1-02', 'd1-04'])('%s 显示全部可见材料和全部证据，不暴露判题解释或来源', (id) => {
    const reviewCase = firstCase(id);
    const { review } = renderCase(reviewCase);
    for (const text of [reviewCase.id, reviewCase.title, reviewCase.description.summary,
      reviewCase.contributor.name, reviewCase.contributor.handle,
      reviewCase.ci.status === 'passed' ? 'CI 通过' : 'CI 失败']) {
      expect(review.textContent).toContain(text);
    }
    const entries = [reviewCase.description.disclosure, ...reviewCase.contributor.toolRecords,
      ...reviewCase.ci.logs, ...reviewCase.files.flatMap((file) => file.lines)];
    expect(review.querySelectorAll('[data-evidence-id]')).toHaveLength(entries.length);
    for (const entry of entries) {
      const button = evidence(review, entry.id);
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      expect(button.textContent).toContain('未选');
      expect(button.textContent).toContain(entry.text);
    }
    for (const file of reviewCase.files) expect(review.textContent).toContain(file.path);
    expect(review.textContent).not.toContain(reviewCase.finding?.explanation ?? reviewCase.approvalExplanation);
    for (const source of reviewCase.sources) expect(review.textContent).not.toContain(source.url);
  });

  test('统一 diff 显示新增、删除、上下文的标记和适用的新旧行号', () => {
    const { review } = renderCase(firstCase('d1-01'));
    for (const [id, oldLine, newLine, marker] of [
      ['page-function', '1', '1', '·'], ['page-old-end', '7', '—', '−'],
      ['page-fixed-end', '—', '7', '+'],
    ]) {
      const button = evidence(review, id);
      expect(button.querySelector('.diff-old-line')?.textContent).toBe(oldLine);
      expect(button.querySelector('.diff-new-line')?.textContent).toBe(newLine);
      expect(button.querySelector('.diff-marker')?.textContent).toBe(marker);
    }
    expect(review.textContent).toContain('旧行');
    expect(review.textContent).toContain('新行');
  });

  test.each(['disclosure', 'tool-tests', 'ci-label-tests', 'label-function', 'label-html-test'])
  ('普通材料或正常代码 %s 可选中和取消，按稳定 ID 通知，不推进时钟', (id) => {
    const { review, onEvidenceChange } = renderCase();
    const button = evidence(review, id);
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('已选');
    expect(onEvidenceChange).toHaveBeenLastCalledWith([id]);
    expect(review.querySelector('[role="status"]')?.textContent).toBe('已选证据：1 项');
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(button.textContent).toContain('未选');
    expect(onEvidenceChange).toHaveBeenLastCalledWith([]);
    expect(review.querySelector('time')?.textContent).toBe('09:00');
  });

  test('删除行与上下文行能同时选择，取消一项不影响另一项', () => {
    const { review, onEvidenceChange } = renderCase(firstCase('d1-01'));
    const deleted = evidence(review, 'page-old-end');
    const context = evidence(review, 'page-function');
    deleted.click();
    context.click();
    expect(onEvidenceChange).toHaveBeenLastCalledWith(['page-old-end', 'page-function']);
    deleted.click();
    expect(context.getAttribute('aria-pressed')).toBe('true');
    expect(onEvidenceChange).toHaveBeenLastCalledWith(['page-function']);
  });

  test.each([
    ['d4-03', 'fee-free-assertion', '6', '—', '−'],
    ['d4-05', 'rows-exact-assertion', '7', '—', '−'],
    ['d4-05', 'rows-vacuous-assertion', '—', '7', '+'],
  ])('第四天 %s 的必要证据 %s 显示适用行号，按稳定 ID 选择和取消', (caseId, id, oldLine, newLine, marker) => {
    const item = getDayCases(4).find((entry) => entry.id === caseId);
    if (!item) throw new Error(caseId);
    const { review, onEvidenceChange } = renderCase(item, 4);
    const button = evidence(review, id);
    expect(button.querySelector('.diff-old-line')?.textContent).toBe(oldLine);
    expect(button.querySelector('.diff-old-line')?.getAttribute('aria-label')).toBe(`旧行 ${oldLine}`);
    expect(button.querySelector('.diff-new-line')?.textContent).toBe(newLine);
    expect(button.querySelector('.diff-new-line')?.getAttribute('aria-label')).toBe(`新行 ${newLine}`);
    expect(button.querySelector('.diff-marker')?.textContent).toBe(marker);
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();
    expect(onEvidenceChange).toHaveBeenLastCalledWith([id]);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.textContent).toContain('已选');
    button.click();
    expect(onEvidenceChange).toHaveBeenLastCalledWith([]);
    expect(review.querySelector('time')?.textContent).toBe('09:00');
  });

  test('HTML 字符串作为原文渲染，所有材料与可选 API 参考均不会产生元素或事件', () => {
    const reviewCase = structuredClone(firstCase());
    const payload = '<img src=x onerror="document.body.dataset.executed=1"><script>document.body.dataset.executed=1</script>';
    reviewCase.title = payload;
    reviewCase.description.summary = payload;
    reviewCase.description.disclosure.text = payload;
    reviewCase.contributor.name = payload;
    reviewCase.contributor.handle = payload;
    reviewCase.contributor.toolRecords[0].text = payload;
    reviewCase.ci.logs[0].text = payload;
    reviewCase.files[0].path = payload;
    reviewCase.files[0].lines[0].text = payload;
    reviewCase.apiReference = [{ name: payload, signature: payload, notes: payload }];
    const { review } = renderCase(reviewCase);
    expect(review.querySelectorAll('img, script, strong, [onerror]')).toHaveLength(0);
    expect(document.body.dataset.executed).toBeUndefined();
    expect(evidence(review, 'label-html-test').textContent).toContain("'<strong>重点</strong>'");
    expect(evidence(review, 'label-function').textContent).toContain(payload);
    const api = review.querySelector('[aria-label="API 参考"]');
    expect(api?.textContent).toContain(payload);
    expect(api?.querySelectorAll('[data-evidence-id]')).toHaveLength(0);
  });

  test('没有 API 内容时不渲染空资料区；空披露栏有可读提示且仍可选', () => {
    const reviewCase = structuredClone(firstCase());
    reviewCase.description.disclosure.text = '';
    const { review } = renderCase(reviewCase);
    expect(review.querySelector('[aria-label="API 参考"]')).toBeNull();
    const disclosure = evidence(review, 'disclosure');
    expect(disclosure.textContent).toContain('未填写');
    disclosure.click();
    expect(disclosure.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('规则手册', () => {
  test('只渲染 R1 正文和例子，未来规则只有编号、待解锁和解锁日，隐藏 DOM 也没有正文', () => {
    const manual = createManual(rules, 1);
    document.body.append(manual);
    expect(manual.tagName).toBe('DIALOG');
    expect(manual.getAttribute('aria-labelledby')).toBe('manual-title');
    expect(manual.textContent).toContain('R1 · CI 必须通过');
    expect(manual.textContent).toContain('生效中');
    expect(manual.textContent).toContain('第 1 天解锁');
    expect(manual.textContent).toContain(rules[0].body);
    expect(manual.textContent).toContain(rules[0].examples.approve);
    expect(manual.textContent).toContain(rules[0].examples.violation);
    for (const rule of rules.slice(1)) {
      const card = manual.querySelector(`[data-rule-id="${rule.id}"]`);
      expect(card?.textContent).toContain('待解锁');
      expect(card?.textContent).toContain(`第 ${rule.unlockDay} 天解锁`);
      for (const text of [rule.title, rule.body, ...Object.values(rule.examples)]) {
        expect(manual.textContent).not.toContain(text);
      }
    }
  });

  test('打开关闭手册保持当前 PR、证据与时钟，关闭后焦点返回入口', () => {
    const { review } = renderCase();
    const selected = evidence(review, 'label-html-test');
    selected.click();
    const manual = review.querySelector('dialog');
    const trigger = [...review.querySelectorAll('button')].find((button) => button.textContent === '规则手册');
    if (!manual || !trigger) throw new Error('缺少规则手册');
    // jsdom 不实现原生 modal 生命周期；真实 Escape/焦点约束由浏览器测试验证。
    manual.showModal = () => { manual.open = true; };
    manual.close = () => { manual.open = false; manual.dispatchEvent(new Event('close')); };
    trigger.click();
    expect(document.activeElement).toBe(manual);
    expect(manual.open).toBe(true);
    manual.querySelector('button')?.click();
    expect(manual.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(evidence(review, 'label-html-test')).toBe(selected);
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(review.querySelector('h2')?.textContent).toContain('d1-02');
    expect(review.querySelector('time')?.textContent).toBe('09:00');
  });
});
