import { scoreDecision, summarize } from '../game/score';
import { workTime } from '../game/state';
import type { GameContent, GameState } from '../game/types';
import { createResultDetails } from './feedback';
import { verdictLabels } from './decision';

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
  section.append(title, clock);
  const statistics = document.createElement('div');
  statistics.className = 'summary-statistics';
  for (const text of [`当日得分：${totals.points}/${totals.maxPoints}`, `裁决正确：${totals.correctVerdicts}/${totals.reviewed}`,
    `违规合入：${totals.violationsMerged}`, `放入 bug／后门：${totals.bugsMerged}`, `误伤好 PR：${totals.goodPrsHarmed}`]) {
    const item = document.createElement('p');
    item.textContent = text;
    statistics.append(item);
  }
  section.append(statistics);
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
  for (const record of records) {
    const reviewCase = content.cases.find((entry) => entry.id === record.caseId);
    if (!reviewCase) throw new Error(`缺少案例 ${record.caseId}`);
    const article = document.createElement('article');
    article.className = 'summary-record';
    const heading = document.createElement('h3');
    heading.textContent = `PR ${reviewCase.id} · ${reviewCase.title}`;
    article.append(heading, createResultDetails(reviewCase, record, state.day, content.rules));
    section.append(article);
  }
  return section;
}

export function createFinalSummary(state: GameState, content: GameContent): HTMLElement {
  const section = document.createElement('section');
  section.className = 'final-summary';
  section.setAttribute('aria-labelledby', 'final-summary-title');
  const title = document.createElement('h2');
  title.id = 'final-summary-title';
  title.tabIndex = -1;
  title.textContent = '最终成绩';
  const seed = document.createElement('p');
  seed.textContent = `挑战种子：${state.seed}`;
  const score = document.createElement('p');
  score.className = 'summary-statistics';
  const totals = summarize(state.records, content);
  score.textContent = `总得分：${totals.points}/${totals.maxPoints}`;
  section.append(title, seed, score);
  for (const record of state.records) {
    const reviewCase = content.cases.find((entry) => entry.id === record.caseId);
    const day = content.campaign.days.find((entry) => entry.caseIds.includes(record.caseId));
    if (!reviewCase || !day) throw new Error(`缺少案例或关卡 ${record.caseId}`);
    const result = scoreDecision(reviewCase, content.rules, day.day, record);
    const article = document.createElement('article');
    article.className = 'summary-record';
    const heading = document.createElement('h3');
    heading.textContent = `PR ${reviewCase.id} · ${reviewCase.title}`;
    article.append(heading);
    for (const text of [`你的裁决：${verdictLabels[record.verdict]}`, `标准裁决：${verdictLabels[result.standardVerdict]}`,
      `本题得分：${result.points}/10`]) {
      const item = document.createElement('p');
      item.textContent = text;
      article.append(item);
    }
    section.append(article);
  }
  return section;
}
