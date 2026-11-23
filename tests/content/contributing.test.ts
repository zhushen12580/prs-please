import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseCase, parseRules, validateContent } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { scoreDecision } from '../../src/game/score';
import { rawContent } from '../fixtures/content';

function examples() {
  const guide = readFileSync('CONTRIBUTING.md', 'utf8');
  return [...guide.matchAll(/<!-- case-example: ([a-z-]+) -->\r?\n```json\r?\n([\s\S]*?)\r?\n```/g)]
    .map((match) => ({ label: match[1], data: JSON.parse(match[2]) as unknown }));
}

function example(label: string) {
  const entry = examples().find((item) => item.label === label);
  if (!entry) throw new Error(`CONTRIBUTING.md: 缺少标注的 ${label} JSON 示例`);
  return parseCase(entry.data, `CONTRIBUTING.md#${label}`);
}

describe('投稿指南中的真实 JSON 示例', () => {
  test('直接读取两个标注代码块，分别为完整正常案例与问题案例', () => {
    expect(examples().map((item) => item.label)).toEqual(['approve', 'request-changes']);
    for (const { label, data } of examples()) {
      expect(parseCase(data, `CONTRIBUTING.md#${label}`)).toEqual(data);
    }
  });

  test('正常示例有批准解释、已披露的 AI 使用和自包含 API 参考，可在第 3 天批准', () => {
    const item = example('approve');
    expect(item.finding).toBeNull();
    expect(item.approvalExplanation?.trim()).not.toBe('');
    expect(item.description.disclosure.text).toContain('AI');
    expect(item.contributor.toolRecords.some((entry) => entry.text.includes('AI'))).toBe(true);
    expect(item.apiReference?.length).toBeGreaterThan(0);
    expect(standardVerdict(item, parseRules(rawContent().rules), 3)).toBe('approve');
  });

  test('R3 示例的两组等价证据各自都需要工具记录与空披露栏，单项不充分', () => {
    const item = example('request-changes');
    const rules = parseRules(rawContent().rules);
    expect(item.ci.status).toBe('passed');
    expect(item.description.disclosure).toEqual({ id: 'disclosure', text: '' });
    expect(item.finding).toMatchObject({
      ruleId: 'R3', impact: 'policy',
      evidenceSets: [['tool-assistant-run', 'disclosure'], ['tool-export-report', 'disclosure']],
    });
    expect(item).not.toHaveProperty('approvalExplanation');
    for (const record of item.contributor.toolRecords) expect(record.text).toContain('AI');
    expect(standardVerdict(item, rules, 3)).toBe('request_changes');
    const points = (evidenceIds: string[]) => scoreDecision(item, rules, 3, {
      caseId: item.id, verdict: 'request_changes', evidenceIds,
    }).points;
    expect(points(['tool-assistant-run', 'disclosure'])).toBe(10);
    expect(points(['disclosure', 'tool-export-report'])).toBe(10);
    expect(points(['disclosure'])).toBe(5);
    expect(points(['tool-assistant-run'])).toBe(5);
    expect(points(['tool-assistant-run', 'tool-export-report', 'disclosure'])).toBe(5);
  });

  test('文档示例不占用生产 ID；按同日同类别替换并更新版本与映射后通过整库校验', () => {
    const input = rawContent();
    const replacements = [
      { oldId: 'd3-01', item: example('approve') },
      { oldId: 'd3-03', item: example('request-changes') },
    ];
    const originalIds = input.campaign.days.flatMap((day) => day.caseIds);
    for (const { item } of replacements) expect(originalIds).not.toContain(item.id);
    input.campaign.contentVersion = '1.0.1';
    input.campaign.days[2].caseIds = input.campaign.days[2].caseIds.map((id) =>
      replacements.find((entry) => entry.oldId === id)?.item.id ?? id);
    const files = input.caseFiles.map((file) => ({
      source: file.source,
      data: file.data.map((item) => replacements.find((entry) => entry.oldId === item.id)?.item ?? item),
    }));
    const result = validateContent(input.campaign, input.rules, files);
    expect(result.campaign.contentVersion).toBe('1.0.1');
    expect(result.cases).toHaveLength(30);
    expect(result.campaign.days.map((day) => day.caseIds.length)).toEqual([6, 6, 6, 6, 6]);
    expect(result.campaign.days[2].caseIds).toEqual([
      'guide-d3-group-label', 'd3-02', 'guide-d3-normalize-labels', 'd3-04', 'd3-05', 'd3-06',
    ]);
    for (const { oldId, item } of replacements) {
      expect(result.cases).toContainEqual(item);
      expect(result.cases.some((entry) => entry.id === oldId)).toBe(false);
    }
  });
});
