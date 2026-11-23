import type { BriefingRule } from '../game/types';
import { verdictLabels } from './decision';

export function createBriefing(seed: string, day: number, rule: BriefingRule): HTMLElement {
  const section = document.createElement('section');
  section.className = 'briefing';
  section.setAttribute('aria-labelledby', 'briefing-title');

  const title = document.createElement('h2');
  title.id = 'briefing-title';
  title.tabIndex = -1;
  title.textContent = `第 ${day} 天简报`;

  const seedLabel = document.createElement('p');
  seedLabel.className = 'shift-details';
  const seedValue = document.createElement('code');
  seedValue.textContent = seed;
  seedLabel.append('挑战种子：', seedValue);

  const note = document.createElement('p');
  note.textContent = day === 1
    ? '今日新增一条规则。先阅读规则，再核对 PR 材料中的证据。'
    : `今日新增一条规则，之前的规则继续生效（${Array.from({ length: day - 1 }, (_, index) => `R${index + 1}`).join('、')}）。先阅读规则，再核对 PR 材料中的证据。`;

  const ruleCard = document.createElement('article');
  ruleCard.className = 'rule-card';
  ruleCard.setAttribute('aria-labelledby', 'new-rule-title');

  const badge = document.createElement('p');
  badge.className = 'rule-badge';
  badge.textContent = '今日新规则';

  const ruleTitle = document.createElement('h3');
  ruleTitle.id = 'new-rule-title';
  ruleTitle.textContent = `${rule.id} · ${rule.title}`;

  const body = document.createElement('p');
  body.className = 'rule-body';
  body.textContent = rule.body;

  ruleCard.append(badge, ruleTitle, body);
  for (const [label, text] of [
    ['可以批准', rule.examples.approve],
    [verdictLabels[rule.violationVerdict], rule.examples.violation],
  ]) {
    const example = document.createElement('section');
    example.className = 'rule-example';
    const heading = document.createElement('h4');
    heading.textContent = label;
    const description = document.createElement('p');
    description.textContent = text;
    example.append(heading, description);
    ruleCard.append(example);
  }

  section.append(title, seedLabel, note, ruleCard);
  return section;
}
