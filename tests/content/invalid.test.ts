import { describe, expect, test } from 'vitest';
import { validateContent } from '../../src/content/validate';
import { rawContent, setField } from '../fixtures/content';

type Path = readonly (string | number)[];
const casePath = (file: number, index: number, ...path: Path): Path => ['caseFiles', file, 'data', index, ...path];

const invalid: [string, Path, unknown, string][] = [
  ['重复案例 ID', casePath(4, 0, 'id'), 'd1-01', 'src/data/cases/day-05.json[0].id'],
  ['未归属案例', casePath(0, 0, 'id'), 'unassigned', 'src/data/cases/day-01.json[0].id'],
  ['映射缺失案例', ['campaign', 'days', 0, 'caseIds', 0], 'missing', 'src/data/campaign.json.days[0].caseIds[0]'],
  ['重复映射', ['campaign', 'days', 1, 'caseIds', 0], 'd1-01', 'src/data/campaign.json.days[1].caseIds[0]'],
  ['未来规则', casePath(0, 3, 'finding', 'ruleId'), 'R2', 'src/data/cases/day-01.json[3].finding.ruleId'],
  ['未知规则', casePath(0, 3, 'finding', 'ruleId'), 'R9', 'src/data/cases/day-01.json[3].finding.ruleId'],
  ['错误影响', casePath(4, 2, 'finding', 'impact'), 'bug', 'src/data/cases/day-05.json[2].finding.impact'],
  ['CI 失败题伪绿', casePath(0, 3, 'ci', 'status'), 'passed', 'src/data/cases/day-01.json[3].ci.status'],
  ['正常题 CI 失败', casePath(0, 0, 'ci', 'status'), 'failed', 'src/data/cases/day-01.json[0].ci.status'],
  ['悬空证据', casePath(2, 2, 'finding', 'evidenceSets', 0, 1), 'missing', 'src/data/cases/day-03.json[2].finding.evidenceSets[0][1]'],
  ['非可选资料', casePath(1, 2, 'finding', 'evidenceSets', 0, 0), 'path.resolve', 'src/data/cases/day-02.json[2].finding.evidenceSets[0][0]'],
  ['空充分组合列表', casePath(2, 2, 'finding', 'evidenceSets'), [], 'src/data/cases/day-03.json[2].finding.evidenceSets'],
  ['空充分组合', casePath(2, 2, 'finding', 'evidenceSets', 0), [], 'src/data/cases/day-03.json[2].finding.evidenceSets[0]'],
  ['组内重复', casePath(2, 2, 'finding', 'evidenceSets', 0), ['disclosure', 'disclosure'], 'src/data/cases/day-03.json[2].finding.evidenceSets[0][1]'],
  ['等价重复组', casePath(2, 2, 'finding', 'evidenceSets'), [['tool-parser-ai', 'disclosure'], ['disclosure', 'tool-parser-ai']], 'src/data/cases/day-03.json[2].finding.evidenceSets[1]'],
  ['跨资料证据 ID 重复', casePath(0, 0, 'ci', 'logs', 0, 'id'), 'disclosure', 'src/data/cases/day-01.json[0].ci.logs[0].id'],
  ['行号与 kind 不符', casePath(0, 0, 'files', 0, 'lines', 0, 'newLine'), null, 'src/data/cases/day-01.json[0].files[0].lines[0].newLine'],
  ['旧行号重复', casePath(0, 0, 'files', 0, 'lines', 1, 'oldLine'), 1, 'src/data/cases/day-01.json[0].files[0].lines[1].oldLine'],
  ['新行号倒序', casePath(0, 0, 'files', 0, 'lines', 2, 'newLine'), 1, 'src/data/cases/day-01.json[0].files[0].lines[2].newLine'],
  ['空标题', casePath(0, 0, 'title'), ' \n ', 'src/data/cases/day-01.json[0].title'],
  ['字段类型', casePath(0, 0, 'contributor', 'handle'), 123, 'src/data/cases/day-01.json[0].contributor.handle'],
  ['缺批准解释', casePath(0, 0, 'approvalExplanation'), undefined, 'src/data/cases/day-01.json[0].approvalExplanation'],
  ['缺 finding', casePath(0, 0, 'finding'), undefined, 'src/data/cases/day-01.json[0].finding'],
  ['空文件列表', casePath(0, 0, 'files'), [], 'src/data/cases/day-01.json[0].files'],
  ['缺正文', ['rules', 0, 'body'], undefined, 'src/data/rules.json[0].body'],
  ['重复规则', ['rules', 1, 'id'], 'R1', 'src/data/rules.json[1].id'],
  ['未知新规则', ['campaign', 'days', 0, 'newRuleId'], 'R9', 'src/data/campaign.json.days[0].newRuleId'],
  ['非法规则 ID', ['rules', 0, 'id'], 'R9', 'src/data/rules.json[0].id'],
  ['错误违规裁决', ['rules', 0, 'violationVerdict'], 'reject', 'src/data/rules.json[0].violationVerdict'],
  ['错误后门裁决', ['rules', 4, 'violationVerdict'], 'request_changes', 'src/data/rules.json[4].violationVerdict'],
  ['空版本', ['campaign', 'contentVersion'], '', 'src/data/campaign.json.contentVersion'],
  ['少一天', ['campaign', 'days'], [], 'src/data/campaign.json.days'],
  ['每日少题', ['campaign', 'days', 0, 'caseIds'], [], 'src/data/campaign.json.days[0].caseIds'],
  ['重复日', ['campaign', 'days', 1, 'day'], 1, 'src/data/campaign.json.days[1].day'],
  ['未知字段不能暗存答案', casePath(0, 0, 'verdict'), 'approve', 'src/data/cases/day-01.json[0].verdict'],
  ['finding 不能另存裁决', casePath(0, 3, 'finding', 'verdict'), 'reject', 'src/data/cases/day-01.json[3].finding.verdict'],
];

describe('整库非法夹具与文件/字段定位', () => {
  test.each(invalid)('%s', (_name, path, value, location) => {
    const input = rawContent();
    setField(input, path, value);
    expect(() => validateContent(input.campaign, input.rules, input.caseFiles)).toThrow(location);
  });

  test.each(['http://example.com', 'javascript:alert(1)', '/relative', 'https://', 'not a URL', 'ftp://example.com'])
    ('来源 URL 不合法：%s', (url) => {
      const input = rawContent();
      input.caseFiles[2].data[2].sources[0].url = url;
      expect(() => validateContent(input.campaign, input.rules, input.caseFiles))
        .toThrow('src/data/cases/day-03.json[2].sources[0].url');
    });

  test('缺整个案例文件、空文件或某个案例，错误指出 campaign 中悬空的具体映射', () => {
    for (const mode of ['file', 'empty', 'case']) {
      const input = rawContent();
      if (mode === 'file') input.caseFiles.pop();
      else if (mode === 'empty') input.caseFiles[4].data = [];
      else input.caseFiles[4].data.shift();
      expect(() => validateContent(input.campaign, input.rules, input.caseFiles))
        .toThrow('src/data/campaign.json.days[4].caseIds[0]');
    }
  });

  test('额外的第 31 题未归属，错误指向实际文件而非猜测日期', () => {
    const input = rawContent();
    input.caseFiles[0].data.push({ ...input.caseFiles[0].data[0], id: 'extra' });
    expect(() => validateContent(input.campaign, input.rules, input.caseFiles))
      .toThrow('src/data/cases/day-01.json[6].id');
  });

  test('规则解锁日必须与规则身份及 campaign 当日一致', () => {
    const input = rawContent();
    input.rules[0].unlockDay = 2;
    input.rules[1].unlockDay = 1;
    expect(() => validateContent(input.campaign, input.rules, input.caseFiles))
      .toThrow('src/data/rules.json[0].unlockDay');
    const mapping = rawContent();
    mapping.campaign.days[0].newRuleId = 'R2';
    mapping.campaign.days[1].newRuleId = 'R1';
    expect(() => validateContent(mapping.campaign, mapping.rules, mapping.caseFiles))
      .toThrow('src/data/campaign.json.days[0].newRuleId');
  });

  test('合法字段和 CI 也不能掩盖错误的每日分布', () => {
    const input = rawContent();
    setField(input, casePath(4, 2, 'finding'), {
      ruleId: 'R4', impact: 'bug', evidenceSets: [['diagnostic-credential-upload']], explanation: '人为改变分类。',
    });
    expect(() => validateContent(input.campaign, input.rules, input.caseFiles))
      .toThrow('src/data/campaign.json.days[4].caseIds');
  });

  test('非数组案例文件有来源定位', () => {
    const input = rawContent();
    expect(() => validateContent(input.campaign, input.rules, [{ source: 'src/data/cases/broken.json', data: null }]))
      .toThrow('src/data/cases/broken.json');
  });
});
