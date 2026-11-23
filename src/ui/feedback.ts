import { activeRules } from '../game/rules';
import { scoreDecision } from '../game/score';
import type { DecisionRecord, ReviewCase, Rule } from '../game/types';
import { verdictLabels } from './decision';

function paragraph(text: string): HTMLParagraphElement {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
}

function evidenceDescriptions(reviewCase: ReviewCase): Map<string, string> {
  const descriptions = new Map<string, string>([
    [reviewCase.description.disclosure.id, `AI 辅助披露：${reviewCase.description.disclosure.text || '（未填写）'}`],
    ...reviewCase.contributor.toolRecords.map((entry): [string, string] => [entry.id, `投稿工具记录：${entry.text}`]),
    ...reviewCase.ci.logs.map((entry): [string, string] => [entry.id, `CI 日志：${entry.text}`]),
  ]);
  for (const file of reviewCase.files) {
    for (const line of file.lines) {
      descriptions.set(line.id, `${file.path} · 旧行 ${line.oldLine ?? '—'} / 新行 ${line.newLine ?? '—'}：${line.text}`);
    }
  }
  return descriptions;
}

function evidenceList(ids: readonly string[], descriptions: ReadonlyMap<string, string>): HTMLUListElement {
  const list = document.createElement('ul');
  for (const id of new Set(ids)) {
    const item = document.createElement('li');
    item.textContent = `${id} · ${descriptions.get(id) ?? '未知证据'}`;
    list.append(item);
  }
  return list;
}

// 反馈、日结和最终复盘共用解释视图，所有题库文本保持为文本节点。
export function createResultDetails(reviewCase: ReviewCase, record: DecisionRecord, day: number, rules: readonly Rule[], headingTag: 'h3' | 'h4' = 'h3'): HTMLElement {
  const details = document.createElement('div');
  details.className = 'result-details';
  const score = scoreDecision(reviewCase, rules, day, record);
  const outcome = paragraph(!score.verdictCorrect ? '裁决错误'
    : !score.evidenceCorrect ? '裁决正确，但证据不完整或含无关项' : '裁决正确，获得满分');
  outcome.className = `result-outcome ${score.points === 10 ? 'result-correct' : 'result-incomplete'}`;
  details.append(outcome, paragraph(`你的裁决：${verdictLabels[record.verdict]}`),
    paragraph(`标准裁决：${verdictLabels[score.standardVerdict]}`), paragraph(`本题得分：${score.points}/10`));

  const active = activeRules(rules, day);
  const applicable = active.find((rule) => rule.id === reviewCase.finding?.ruleId);
  details.append(paragraph(applicable ? `适用规则：${applicable.id} · ${applicable.title}` : '本题无生效违规，批准无需证据。'));
  const rulesHeading = document.createElement(headingTag);
  rulesHeading.textContent = '生效规则';
  const ruleList = document.createElement('ul');
  for (const rule of active) {
    const item = document.createElement('li');
    item.textContent = `${rule.id} · ${rule.title}：${rule.body}`;
    ruleList.append(item);
  }
  details.append(rulesHeading, ruleList);

  const descriptions = evidenceDescriptions(reviewCase);
  const selectedHeading = document.createElement(headingTag);
  selectedHeading.textContent = '你的证据';
  details.append(selectedHeading, record.evidenceIds.length ? evidenceList(record.evidenceIds, descriptions) : paragraph('未选择证据。'));
  const correctHeading = document.createElement(headingTag);
  correctHeading.textContent = '正确证据';
  details.append(correctHeading);
  if (applicable && reviewCase.finding) {
    reviewCase.finding.evidenceSets.forEach((ids, index) => {
      if (index > 0) details.append(paragraph('或满足以下一组：'));
      details.append(paragraph(`充分证据组 ${index + 1}（本组各项需同时选中）`), evidenceList(ids, descriptions));
    });
  } else details.append(paragraph('批准不要求选择证据，判分忽略已选证据。'));

  const explanationHeading = document.createElement(headingTag);
  explanationHeading.textContent = '判题解释';
  details.append(explanationHeading, paragraph(reviewCase.finding?.explanation ?? reviewCase.approvalExplanation ?? ''));
  const sourcesHeading = document.createElement(headingTag);
  sourcesHeading.textContent = '灵感来源与原创改写';
  details.append(sourcesHeading);
  for (const source of reviewCase.sources) {
    const link = document.createElement('a');
    link.href = source.url;
    link.textContent = source.theme;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    details.append(link, paragraph(source.note));
  }
  return details;
}

export function createFeedback(reviewCase: ReviewCase, record: DecisionRecord, day: number, rules: readonly Rule[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'feedback';
  section.setAttribute('aria-labelledby', 'feedback-title');
  const title = document.createElement('h2');
  title.id = 'feedback-title';
  title.tabIndex = -1;
  title.textContent = '裁决反馈';
  section.append(title, createResultDetails(reviewCase, record, day, rules));
  return section;
}
