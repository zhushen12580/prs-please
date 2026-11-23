import { describe, expect, test } from 'vitest';
import { campaign, cases, rules } from '../../src/content/load';
import type { DecisionRecord, GameState } from '../../src/game/types';
import { createDaySummary, createFinalSummary } from '../../src/ui/summary';

const content = { campaign, cases, rules };
const records: DecisionRecord[] = [
  { caseId: 'd1-05', verdict: 'request_changes', evidenceIds: ['disclosure'] },
  { caseId: 'd3-03', verdict: 'approve', evidenceIds: [] },
  { caseId: 'd4-03', verdict: 'request_changes', evidenceIds: ['fee-free-assertion'] },
  { caseId: 'd5-03', verdict: 'request_changes', evidenceIds: ['diagnostic-credential-upload'] },
  { caseId: 'd3-02', verdict: 'reject', evidenceIds: ['disclosure'] },
];
const state: GameState = { seed: 'maintainer-001', contentVersion: '1.0.0', phase: 'final', day: 5, position: 5,
  records, draft: { verdict: null, evidenceIds: [] } };

describe('共享日结与最终复盘', () => {
  test('最终页包含完整汇总，按每条记录实际所属日解释规则', () => {
    const final = createFinalSummary(state, content);
    for (const text of ['总得分：15/50', '裁决正确：2/5', '放入 bug／后门：0', '违规合入：1', '误伤好 PR：1']) {
      expect(final.textContent).toContain(text);
    }
    const entries = final.querySelectorAll('article');
    expect(entries).toHaveLength(5);
    expect(entries[0].textContent).toContain('裁决正确，但证据不完整或含无关项');
    expect(entries[0].textContent).toContain('disclosure · AI 辅助披露');
    expect(entries[0].textContent).toContain('ci-type-failure · CI 日志');
    expect(entries[0].textContent).toContain('TS2322');
    expect(entries[0].textContent).toContain('R1 · CI 必须通过');
    expect(entries[0].textContent).not.toContain('R2');
    expect(entries[2].textContent).toContain('旧行 6 / 新行 —');
    expect(entries[3].textContent).toContain('标准裁决：拒绝');
    expect(entries[3].textContent).toContain('适用规则：R5');
    for (const [index, record] of records.entries()) {
      const entry = entries[index];
      const reviewCase = cases.find(({ id }) => id === record.caseId)!;
      expect(entry.querySelector('h3')?.textContent).toBe(`PR ${reviewCase.id} · ${reviewCase.title}`);
      for (const heading of ['你的证据', '正确证据', '判题解释', '灵感来源与原创改写']) {
        expect([...entry.querySelectorAll('h4')].some((node) => node.textContent === heading)).toBe(true);
      }
      expect(entry.textContent).toContain(reviewCase.finding?.explanation ?? reviewCase.approvalExplanation);
      for (const source of reviewCase.sources) {
        const link = [...entry.querySelectorAll('a')].find((node) => node.href === source.url);
        expect(link?.textContent).toBe(source.theme);
        expect(link?.target).toBe('_blank');
        expect(link?.rel).toBe('noopener noreferrer');
        expect(entry.textContent).toContain(source.note);
      }
    }
  });

  test('日结只显示本日记录，并与最终页同一条记录的内容完全一致', () => {
    const final = createFinalSummary(state, content);
    const day = createDaySummary({ ...state, phase: 'daySummary', day: 3 }, content);
    expect(day.querySelectorAll('article')).toHaveLength(2);
    expect(day.textContent).toContain('当日得分：0/20');
    expect(day.textContent).toContain('裁决正确：0/2');
    for (const article of day.querySelectorAll('article')) {
      const matching = [...final.querySelectorAll('article')].find((entry) => entry.querySelector('h3')?.textContent === article.querySelector('h3')?.textContent);
      expect(article.textContent).toBe(matching?.textContent);
    }
    expect(day.textContent).not.toContain('PR d1-05');
    expect(day.textContent).not.toContain('PR d5-03');
  });

  test('标题、所选证据、解释和来源说明保持纯文本', () => {
    const reviewCase = structuredClone(cases.find(({ id }) => id === 'd1-02')!);
    const payload = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    reviewCase.title = payload;
    reviewCase.description.disclosure.text = payload;
    if (reviewCase.finding === null) reviewCase.approvalExplanation = payload;
    reviewCase.sources[0].theme = payload;
    reviewCase.sources[0].note = payload;
    const final = createFinalSummary({ ...state, records: [{ caseId: reviewCase.id, verdict: 'approve', evidenceIds: ['disclosure'] }] },
      { ...content, cases: [reviewCase] });
    expect(final.querySelectorAll('img, script, [onerror]')).toHaveLength(0);
    expect(final.querySelector('.result-details')?.textContent).toContain(payload);
    expect(final.querySelector('a')?.textContent).toBe(payload);
  });
});
