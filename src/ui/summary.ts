import { summarize, type Statistics } from '../game/score';
import { workTime } from '../game/state';
import type { GameContent, GameState } from '../game/types';
import { createReviewLog } from './review-log';

function createStatistics(totals: Statistics, scoreLabel: string): HTMLElement {
  const statistics = document.createElement('div');
  statistics.className = 'summary-statistics';
  for (const text of [`${scoreLabel}：${totals.points}/${totals.maxPoints}`, `裁决正确：${totals.correctVerdicts}/${totals.reviewed}`,
    `放入 bug／后门：${totals.bugsMerged}`, `违规合入：${totals.violationsMerged}`, `误伤好 PR：${totals.goodPrsHarmed}`]) {
    const item = document.createElement('p');
    item.textContent = text;
    statistics.append(item);
  }
  return statistics;
}

export function createDaySummary(state: GameState, content: GameContent, onNextDay?: () => void, onFinishCampaign?: () => void): HTMLElement {
  const definition = content.campaign.days.find((entry) => entry.day === state.day);
  if (!definition) throw new Error(`缺少第 ${state.day} 天关卡`);
  const records = state.records.filter((record) => definition.caseIds.includes(record.caseId));
  const totals = summarize(records, content);
  const section = document.createElement('section');
  section.className = 'day-summary';
  section.setAttribute('aria-labelledby', 'day-summary-title');
  const title = document.createElement('h2');
  title.id = 'day-summary-title';
  title.tabIndex = -1;
  title.textContent = `第 ${state.day} 天日结`;
  const clock = document.createElement('time');
  clock.dateTime = workTime(state, content);
  clock.textContent = clock.dateTime;
  clock.setAttribute('aria-label', `工作时钟 ${clock.dateTime}`);
  section.append(title, clock, createStatistics(totals, '当日得分'));
  if (onNextDay) {
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'primary-button';
    next.textContent = '下一天';
    next.addEventListener('click', onNextDay);
    section.append(next);
  }
  if (onFinishCampaign) {
    const finish = document.createElement('button');
    finish.type = 'button';
    finish.className = 'primary-button';
    finish.textContent = '查看最终成绩';
    finish.addEventListener('click', onFinishCampaign);
    section.append(finish);
  }
  section.append(createReviewLog(records, content));
  return section;
}

export function createFinalSummary(state: GameState, content: GameContent, navigation?: { onReplay: () => void; onHome: () => void }): HTMLElement {
  const section = document.createElement('section');
  section.className = 'final-summary';
  section.setAttribute('aria-labelledby', 'final-summary-title');
  const title = document.createElement('h2');
  title.id = 'final-summary-title';
  title.tabIndex = -1;
  title.textContent = '最终成绩';
  const seed = document.createElement('p');
  seed.textContent = `挑战种子：${state.seed}`;
  const totals = summarize(state.records, content);
  section.append(title, seed, createStatistics(totals, '总得分'));
  if (navigation) {
    const actions = document.createElement('div');
    actions.className = 'shift-actions';
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'primary-button';
    replay.textContent = '同种子再来一次';
    replay.addEventListener('click', navigation.onReplay);
    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'secondary-button';
    home.textContent = '返回首页';
    home.addEventListener('click', navigation.onHome);
    actions.append(replay, home);
    section.append(actions);
  }
  section.append(createReviewLog(state.records, content));
  return section;
}
