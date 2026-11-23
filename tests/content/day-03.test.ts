import { describe, expect, test } from 'vitest';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { validateDay } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { answerKey } from '../fixtures/answer-key';

const ids = ['d3-01', 'd3-02', 'd3-03', 'd3-04', 'd3-05', 'd3-06'];

describe('第三天披露政策真实内容', () => {
  test('第三天六题按 campaign 加载，十八题唯一且第四天尚未加载', () => {
    const day = getDayCases(3);
    expect(day.map((item) => item.id)).toEqual(ids);
    expect(campaign.days[2]).toEqual({ day: 3, newRuleId: 'R3', caseIds: ids });
    expect(cases).toHaveLength(18);
    expect(new Set(cases.map((item) => item.id)).size).toBe(18);
    expect(validateDay(day, 3, campaign, rules, 'src/data/cases/day-03.json')).toEqual(day);
    expect(() => getDayCases(4)).toThrow(/尚未加载/);
  });

  test('两份正常、三份 R3/policy、一份 R2/bug，全部 CI 通过，答案独立锁定', () => {
    const day = getDayCases(3);
    expect(day.map((item) => item.finding?.ruleId ?? 'approve')).toEqual([
      'approve', 'approve', 'R3', 'R3', 'R3', 'R2',
    ]);
    expect(Object.keys(answerKey).filter((id) => id.startsWith('d3-'))).toEqual(ids);
    for (const item of day) {
      const answer = answerKey[item.id];
      expect(standardVerdict(item, rules, 3)).toBe(answer.verdict);
      expect(item.ci.status).toBe('passed');
      if (item.finding) {
        expect(item.finding.impact).toBe(item.id === 'd3-06' ? 'bug' : 'policy');
        expect(item.finding.evidenceSets).toEqual(answer.evidenceSets);
        expect(item.finding.explanation).toMatch(/[\u4e00-\u9fff]/);
      } else {
        expect(answer).toEqual({ verdict: 'approve', evidenceSets: [] });
        expect(item.approvalExplanation).toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });

  test('每组披露证据共同包含明确 AI 使用记录和空栏，一题有两份独立的使用记录', () => {
    const day = getDayCases(3);
    for (const item of day.slice(2, 5)) {
      expect(item.description.disclosure.text).toBe('');
      const disclosureId = item.description.disclosure.id;
      for (const set of item.finding?.evidenceSets ?? []) {
        expect(set).toHaveLength(2);
        expect(set).toContain(disclosureId);
        const tool = item.contributor.toolRecords.find((record) => set.includes(record.id));
        expect(tool?.text).toContain('AI');
        expect(tool?.text).toMatch(/采纳|接受|应用/);
      }
    }
    const alternatives = day[4].finding?.evidenceSets;
    expect(alternatives).toEqual([
      ['tool-tests-ai', 'disclosure'], ['tool-tests-import', 'disclosure'],
    ]);
    const tools = day[4].contributor.toolRecords;
    expect(tools.find((entry) => entry.id === 'tool-tests-ai')?.text).toContain('生成');
    expect(tools.find((entry) => entry.id === 'tool-tests-import')?.text).toContain('导入');
  });

  test('空栏本身不是违规，合规 AI 序列化可批准，不存在的事务 API 有完整参考', () => {
    const day = getDayCases(3);
    expect(day[0].title).toContain('并发');
    expect(day[0].description.disclosure.text).toBe('');
    expect(day[0].contributor.toolRecords[0].text).toContain('未使用 AI');
    expect(day[0].finding).toBeNull();
    expect(day[1].title).toContain('序列化');
    expect(day[1].description.disclosure.text).toContain('AI');
    expect(day[1].contributor.toolRecords[0].text).toContain('AI');
    expect(day[1].finding).toBeNull();
    const api = day[5].apiReference?.map((entry) => `${entry.signature}\n${entry.notes}`).join('\n');
    expect(api).toContain('store.transaction');
    expect(api).toContain('Promise');
    expect(api).toContain('不存在 atomic');
    expect(day[5].files.flatMap((file) => file.lines).find((line) => line.id === 'transaction-invented-call')?.text)
      .toBe('  return store.atomic(async (tx) => {');
  });

  test('每题改动不同、材料与证据完整，来源说明区分原创政策与 Godot 原文', () => {
    const day = getDayCases(3);
    expect(new Set(day.map((item) => item.title)).size).toBe(6);
    expect(new Set(day.map((item) => item.description.summary)).size).toBe(6);
    expect(new Set(day.map((item) => item.files.flatMap((file) => file.lines)
      .filter((line) => line.kind !== 'context').map((line) => line.text).join('\n'))).size).toBe(6);
    for (const item of day) {
      expect(item.contributor.name).toContain('虚构');
      expect(item.contributor.toolRecords.length).toBeGreaterThan(0);
      expect(item.ci.logs.length).toBeGreaterThan(0);
      expect(item.files.length).toBeGreaterThanOrEqual(1);
      expect(item.files.length).toBeLessThanOrEqual(2);
      const lines = item.files.flatMap((file) => file.lines);
      expect(lines.length).toBeGreaterThanOrEqual(12);
      expect(lines.length).toBeLessThanOrEqual(35);
      const selectable = [item.description.disclosure, ...item.contributor.toolRecords, ...item.ci.logs, ...lines];
      const evidenceIds = selectable.map((entry) => entry.id);
      expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
      for (const set of item.finding?.evidenceSets ?? []) {
        for (const id of set) expect(evidenceIds).toContain(id);
      }
      for (const source of item.sources) {
        expect(new URL(source.url).protocol).toBe('https:');
        expect(source.note).toContain('原创');
        expect(source.note).toContain('虚构');
      }
    }
    const source = day[2].sources.find((entry) => entry.url === 'https://godotengine.org/article/contribution-policy-2026/');
    expect(source?.theme).toContain('披露');
    expect(source?.note).toContain('虚构项目规则');
    expect(source?.note).toContain('完整政策');
  });
});
