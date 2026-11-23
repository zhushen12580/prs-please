import { describe, expect, test, vi } from 'vitest';
import manifest from '../../package.json';
import { campaign, cases, getDayCases, rules } from '../../src/content/load';
import { validateContent } from '../../src/content/validate';
import { standardVerdict } from '../../src/game/rules';
import { answerKey } from '../fixtures/answer-key';
import { rawContent } from '../fixtures/content';

describe('整库内容契约', () => {
  test('统一校验全部真实 JSON，五天各六题，三十题唯一且映射完整', () => {
    const input = rawContent();
    const before = structuredClone(input);
    expect(validateContent(input.campaign, input.rules, input.caseFiles)).toEqual({ campaign, rules, cases });
    expect(input).toEqual(before);
    expect(cases).toHaveLength(30);
    expect(new Set(cases.map((item) => item.id)).size).toBe(30);
    expect(campaign.days.map((day) => day.day)).toEqual([1, 2, 3, 4, 5]);
    for (const day of campaign.days) {
      expect(day.caseIds).toHaveLength(6);
      expect(getDayCases(day.day).map((item) => item.id)).toEqual(day.caseIds);
    }
    expect(campaign.days.flatMap((day) => day.caseIds).sort()).toEqual(cases.map((item) => item.id).sort());
    // 直接写入命令输出，确保非交互环境的精简测试 reporter 也会显示验收结果。
    process.stdout.write('30 个唯一案例；第 1–5 天各 6 个；规则与证据引用有效\n');
  });

  test('归属只由 campaign 决定，不受文件名、文件顺序、案例顺序或 ID 前缀影响', () => {
    const input = rawContent();
    // 交换两天的正常案例并同步唯一映射；不能把 ID 的 d1/d5 前缀当日期。
    input.campaign.days[0].caseIds[0] = 'd5-01';
    input.campaign.days[4].caseIds[0] = 'd1-01';
    const caseFiles = input.caseFiles.reverse().map((file, index) => ({
      source: `src/data/cases/repacked-${index}.json`, data: file.data.reverse(),
    }));
    const parsed = validateContent(input.campaign, input.rules, caseFiles);
    expect(parsed.campaign.days[0].caseIds).toEqual(['d5-01', 'd1-02', 'd1-03', 'd1-04', 'd1-05', 'd1-06']);
    expect(parsed.campaign.days[4].caseIds).toEqual(['d1-01', 'd5-02', 'd5-03', 'd5-04', 'd5-05', 'd5-06']);
    expect(new Set(parsed.cases.map((item) => item.id)).size).toBe(30);
  });

  test('逐日分布与全库影响/裁决总数锁定；人工答案独立核对每题', () => {
    expect(campaign.days.map((day) => getDayCases(day.day).reduce<Record<string, number>>((counts, item) => {
      const key = item.finding?.ruleId ?? 'approve';
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {}))).toEqual([
      { approve: 3, R1: 3 }, { approve: 2, R2: 3, R1: 1 }, { approve: 2, R3: 3, R2: 1 },
      { approve: 2, R4: 3, R1: 1 }, { approve: 2, R5: 2, R3: 1, R4: 1 },
    ]);
    const impacts: Record<string, number> = {};
    const verdicts: Record<string, number> = {};
    for (const day of campaign.days) {
      for (const item of getDayCases(day.day)) {
        const impact = item.finding?.impact ?? 'normal';
        impacts[impact] = (impacts[impact] ?? 0) + 1;
        const verdict = standardVerdict(item, rules, day.day);
        verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
        expect(verdict).toBe(answerKey[item.id].verdict);
        expect(item.finding?.evidenceSets ?? []).toEqual(answerKey[item.id].evidenceSets);
        expect(item).not.toHaveProperty('verdict');
        if (item.finding) expect(item.finding).not.toHaveProperty('verdict');
      }
    }
    expect(impacts).toEqual({ normal: 11, bug: 13, policy: 4, backdoor: 2 });
    expect(verdicts).toEqual({ approve: 11, request_changes: 17, reject: 2 });
  });

  test('两份指定合规 AI 正常题与三类原始来源齐全，三十份叙事和实质改动不同', () => {
    for (const id of ['d1-03', 'd3-02']) {
      const item = cases.find((item) => item.id === id);
      expect(item?.finding).toBeNull();
      expect(item?.description.disclosure.text).toContain('AI');
      expect(item?.contributor.toolRecords.some((entry) => entry.text.includes('AI'))).toBe(true);
    }
    const sources = cases.flatMap((item) => item.sources);
    for (const url of [
      'https://godotengine.org/article/contribution-policy-2026/',
      'https://curl.se/dev/contribute.html',
      'https://www.openwall.com/lists/oss-security/2024/03/29/4',
    ]) {
      const source = sources.find((entry) => entry.url === url);
      expect(source).toBeDefined();
      expect(source?.theme.trim()).not.toBe('');
      expect(source?.note).toContain('原创');
      expect(source?.note).toContain('虚构');
    }
    expect(new Set(cases.map((item) => item.title)).size).toBe(30);
    expect(new Set(cases.map((item) => item.description.summary)).size).toBe(30);
    expect(new Set(cases.map((item) => item.files.flatMap((file) => file.lines)
      .filter((line) => line.kind !== 'context').map((line) => line.text).join('\n'))).size).toBe(30);
  });

  test('生产加载入口也拒绝缺题，无法绕过整库校验', async () => {
    vi.resetModules();
    vi.doMock('../../src/data/cases/day-05.json', () => ({ default: [] }));
    try {
      await expect(import('../../src/content/load')).rejects.toThrow('src/data/campaign.json.days[4].caseIds[0]');
    } finally {
      vi.doUnmock('../../src/data/cases/day-05.json');
      vi.resetModules();
    }
  });

  test('独立命令运行全部内容测试，build 在 Vite 前进行类型及内容检查且保留参数传递', () => {
    expect(manifest.scripts).toHaveProperty('check:content', 'vitest run tests/content');
    expect(manifest.scripts.build).toBe('npm run typecheck && npm run check:content && vite build');
  });
});
