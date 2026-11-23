import type { DecisionRecord, GameContent } from '../game/types';
import { createResultDetails } from './feedback';

export function createReviewLog(records: readonly DecisionRecord[], content: GameContent): HTMLElement {
  const log = document.createElement('div');
  log.className = 'review-log';
  for (const record of records) {
    const reviewCase = content.cases.find((entry) => entry.id === record.caseId);
    const day = content.campaign.days.find((entry) => entry.caseIds.includes(record.caseId));
    if (!reviewCase || !day) throw new Error(`缺少案例或关卡 ${record.caseId}`);
    const article = document.createElement('article');
    article.className = 'summary-record';
    const heading = document.createElement('h3');
    heading.id = `review-log-${reviewCase.id}`;
    heading.textContent = `PR ${reviewCase.id} · ${reviewCase.title}`;
    article.setAttribute('aria-labelledby', heading.id);
    article.append(heading, createResultDetails(reviewCase, record, day.day, content.rules, 'h4'));
    log.append(article);
  }
  return log;
}
