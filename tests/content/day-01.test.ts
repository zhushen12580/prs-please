import { describe, expect, test } from 'vitest';
import { campaign, cases as loadedCases, getDayCases, rules } from '../../src/content/load';
import { answerKey } from '../fixtures/answer-key';

const dayOneIds = ['d1-01', 'd1-02', 'd1-03', 'd1-04', 'd1-05', 'd1-06'];
const cases = getDayCases(1);

describe('第一天真实内容', () => {
  test('最终映射是五天三十个 ID，第一天集合保持六个真实案例', () => {
    expect(campaign).toEqual({
      contentVersion: '1.0.0',
      days: [
        { day: 1, newRuleId: 'R1', caseIds: dayOneIds },
        { day: 2, newRuleId: 'R2', caseIds: ['d2-01', 'd2-02', 'd2-03', 'd2-04', 'd2-05', 'd2-06'] },
        { day: 3, newRuleId: 'R3', caseIds: ['d3-01', 'd3-02', 'd3-03', 'd3-04', 'd3-05', 'd3-06'] },
        { day: 4, newRuleId: 'R4', caseIds: ['d4-01', 'd4-02', 'd4-03', 'd4-04', 'd4-05', 'd4-06'] },
        { day: 5, newRuleId: 'R5', caseIds: ['d5-01', 'd5-02', 'd5-03', 'd5-04', 'd5-05', 'd5-06'] },
      ],
    });
    expect(cases.map((item) => item.id)).toEqual(dayOneIds);
    expect(loadedCases.filter((item) => dayOneIds.includes(item.id))).toEqual(cases);
    expect(() => getDayCases(0)).toThrow(/不存在/);
  });

  test('三个正常、三个 R1/bug；人工答案独立锁定裁决与充分证据', () => {
    expect(Object.keys(answerKey).filter((id) => id.startsWith('d1-'))).toEqual(dayOneIds);
    expect(cases.filter((item) => item.finding === null)).toHaveLength(3);
    for (const item of cases) {
      const expected = answerKey[item.id];
      expect(expected).toBeDefined();
      if (item.finding === null) {
        expect(expected).toEqual({ verdict: 'approve', evidenceSets: [] });
        expect(item.ci.status).toBe('passed');
        expect(item.approvalExplanation).toMatch(/[\u4e00-\u9fff]/);
      } else {
        expect(item.finding.ruleId).toBe('R1');
        expect(item.finding.impact).toBe('bug');
        expect(item.ci.status).toBe('failed');
        expect(item.finding.evidenceSets).toEqual(expected.evidenceSets);
        expect(rules.find((rule) => rule.id === item.finding?.ruleId)?.violationVerdict)
          .toBe(expected.verdict);
        expect(item.finding.explanation).toMatch(/[\u4e00-\u9fff]/);
        for (const set of expected.evidenceSets) {
          for (const id of set) expect(item.ci.logs.some((log) => log.id === id)).toBe(true);
        }
      }
    }
  });

  test('每题资料、来源和 diff 齐全，证据唯一且可选，行号符合增删语义', () => {
    for (const item of cases) {
      expect(item.title.trim()).not.toBe('');
      expect(item.description.summary.trim()).not.toBe('');
      expect(item.description.disclosure.text.trim()).not.toBe('');
      expect(item.contributor.name.trim()).not.toBe('');
      expect(item.contributor.handle.trim()).not.toBe('');
      expect(item.contributor.toolRecords.length).toBeGreaterThan(0);
      expect(item.ci.logs.length).toBeGreaterThan(0);
      expect(item.files.length).toBeGreaterThanOrEqual(1);
      expect(item.files.length).toBeLessThanOrEqual(2);
      const lines = item.files.flatMap((file) => file.lines);
      expect(lines.length).toBeGreaterThanOrEqual(12);
      expect(lines.length).toBeLessThanOrEqual(35);
      const selectable = [item.description.disclosure, ...item.contributor.toolRecords,
        ...item.ci.logs, ...lines];
      const ids = selectable.map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const set of item.finding?.evidenceSets ?? []) {
        for (const id of set) expect(ids).toContain(id);
      }
      for (const file of item.files) {
        expect(file.path.trim()).not.toBe('');
        for (const line of file.lines) {
          if (line.kind === 'add') {
            expect(line.oldLine).toBeNull();
            expect(line.newLine).toBeGreaterThan(0);
          } else if (line.kind === 'delete') {
            expect(line.newLine).toBeNull();
            expect(line.oldLine).toBeGreaterThan(0);
          } else {
            expect(line.oldLine).toBeGreaterThan(0);
            expect(line.newLine).toBeGreaterThan(0);
          }
        }
      }
      expect(item.sources.length).toBeGreaterThan(0);
      for (const source of item.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(source.theme.trim()).not.toBe('');
        expect(source.note).toContain('原创');
        expect(source.note).toContain('虚构');
      }
    }
  });

  test('六种不同改动包含正常测试维护、合规 AI 和纯文本 HTML 字符串', () => {
    expect(new Set(cases.map((item) => item.title)).size).toBe(6);
    expect(new Set(cases.map((item) => item.description.summary)).size).toBe(6);
    expect(new Set(cases.map((item) => item.files.flatMap((file) => file.lines)
      .filter((line) => line.kind !== 'context').map((line) => line.text).join('\n'))).size).toBe(6);
    expect(cases[0].title).toContain('分页');
    expect(cases[1].title).toContain('测试');
    const labelSource = cases[1].files.find((file) => file.path === 'src/escape-label.ts');
    const labelTests = cases[1].files.find((file) => file.path === 'tests/escape-label.test.ts');
    expect(labelSource?.lines.some((line) => line.text.includes('export function escapeLabel'))).toBe(true);
    expect(labelTests?.lines.some((line) => line.text === "import { escapeLabel } from '../src/escape-label';"))
      .toBe(true);
    expect(labelTests?.lines.filter((line) => line.kind === 'delete')).toHaveLength(0);
    expect(cases[2].title).toContain('键盘');
    expect(cases[2].description.disclosure.text).toContain('AI');
    expect(cases[2].contributor.toolRecords.some((record) => record.text.includes('AI'))).toBe(true);
    expect(cases[2].finding).toBeNull();
    expect(cases[3].ci.logs.map((log) => log.text).join('\n')).toContain('时区');
    expect(cases[4].ci.logs.map((log) => log.text).join('\n')).toContain('TS2322');
    expect(cases[5].ci.logs.map((log) => log.text).join('\n')).toContain('空输入');
    expect(cases.flatMap((item) => item.files.flatMap((file) => file.lines))
      .some((line) => line.text.includes('<strong>'))).toBe(true);
  });
});
