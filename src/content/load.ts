import rawCampaign from '../data/campaign.json';
import rawRules from '../data/rules.json';
import dayOne from '../data/cases/day-01.json';
import dayTwo from '../data/cases/day-02.json';
import dayThree from '../data/cases/day-03.json';
import dayFour from '../data/cases/day-04.json';
import dayFive from '../data/cases/day-05.json';
import { validateContent } from './validate';
import type { ReviewCase } from '../game/types';

export const { campaign, rules, cases } = validateContent(rawCampaign, rawRules, [
  { source: 'src/data/cases/day-01.json', data: dayOne },
  { source: 'src/data/cases/day-02.json', data: dayTwo },
  { source: 'src/data/cases/day-03.json', data: dayThree },
  { source: 'src/data/cases/day-04.json', data: dayFour },
  { source: 'src/data/cases/day-05.json', data: dayFive },
]);

const casesById = new Map(cases.map((item) => [item.id, item]));

export function getDayCases(day: number): readonly ReviewCase[] {
  const index = campaign.days.findIndex((entry) => entry.day === day);
  if (index === -1) throw new Error(`第 ${day} 天不存在`);
  return campaign.days[index].caseIds.map((id, caseIndex) => {
    const item = casesById.get(id);
    if (!item) throw new Error(`src/data/campaign.json.days[${index}].caseIds[${caseIndex}]: 案例不存在`);
    return item;
  });
}
