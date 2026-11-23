import rawCampaign from '../data/campaign.json';
import rawRules from '../data/rules.json';
import dayOne from '../data/cases/day-01.json';
import dayTwo from '../data/cases/day-02.json';
import dayThree from '../data/cases/day-03.json';
import dayFour from '../data/cases/day-04.json';
import { parseCampaign, parseRules, validateDay } from './validate';
import type { ReviewCase } from '../game/types';

export const campaign = parseCampaign(rawCampaign);
export const rules = parseRules(rawRules);

// 只登记已经完成的真实内容；未来关卡由后续任务逐日加入。
const loadedDays = new Map<number, ReviewCase[]>([
  [1, validateDay(dayOne, 1, campaign, rules, 'src/data/cases/day-01.json')],
  [2, validateDay(dayTwo, 2, campaign, rules, 'src/data/cases/day-02.json')],
  [3, validateDay(dayThree, 3, campaign, rules, 'src/data/cases/day-03.json')],
  [4, validateDay(dayFour, 4, campaign, rules, 'src/data/cases/day-04.json')],
]);

export const cases = [...loadedDays.values()].flat();

export function getDayCases(day: number): readonly ReviewCase[] {
  if (!campaign.days.some((entry) => entry.day === day)) throw new Error(`第 ${day} 天不存在`);
  const cases = loadedDays.get(day);
  if (!cases) throw new Error(`第 ${day} 天的案例尚未加载`);
  return cases;
}
