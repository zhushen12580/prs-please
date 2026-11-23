import { campaign, cases, rules } from '../content/load';
import { summarize } from '../game/score';
import { canAdvanceDay, canSubmit, createGame, currentCase, transition, workTime, type GameAction } from '../game/state';
import type { GameState } from '../game/types';
import { createBriefing } from './briefing';
import { createDecision } from './decision';
import { createFeedback } from './feedback';
import { createHome } from './home';
import { createReview } from './review';
import { createDaySummary } from './summary';

export function mountApp(root: HTMLElement): void {
  const main = document.createElement('main');
  main.className = 'app';

  const header = document.createElement('header');
  header.className = 'app-header';

  const eyebrow = document.createElement('p');
  eyebrow.className = 'eyebrow';
  eyebrow.textContent = '开源维护者的五日值班';

  const title = document.createElement('h1');
  title.textContent = 'PRs, Please';

  header.append(eyebrow, title);

  const view = document.createElement('div');
  view.className = 'app-view';
  const content = { campaign, cases, rules };
  let state: GameState;

  function dispatch(action: GameAction): boolean {
    const next = transition(state, action, content);
    if (next === state) return false;
    state = next;
    return true;
  }

  function render(): void {
    main.classList.toggle('app-workbench', state.phase !== 'briefing');
    if (state.phase === 'briefing') {
      const day = campaign.days.find((entry) => entry.day === state.day);
      const newRule = rules.find((rule) => rule.id === day?.newRuleId);
      if (!newRule) throw new Error(`缺少第 ${state.day} 天规则`);
      const briefing = createBriefing(state.seed, state.day, newRule);
      const startReview = document.createElement('button');
      startReview.type = 'button';
      startReview.className = 'primary-button';
      startReview.textContent = '开始评审';
      startReview.addEventListener('click', () => {
        if (dispatch({ type: 'startReview' })) render();
      });
      briefing.append(startReview);
      view.replaceChildren(briefing);
      briefing.querySelector<HTMLHeadingElement>('h2')?.focus();
      return;
    }
    if (state.phase === 'daySummary') {
      const day = state.day;
      const summary = createDaySummary(state, content, canAdvanceDay(state, content) ? () => {
        if (dispatch({ type: 'nextDay', day })) render();
      } : undefined);
      view.replaceChildren(summary);
      summary.querySelector<HTMLHeadingElement>('h2')?.focus();
      return;
    }
    const reviewCase = currentCase(state, content);
    const locked = state.phase === 'feedback';
    const decisionStatus = () => ({ verdict: state.draft.verdict, canSubmit: canSubmit(state, content), locked: state.phase !== 'review' });
    const decision = createDecision(decisionStatus(), (verdict) => {
      dispatch({ type: 'selectVerdict', verdict });
      decision.update(decisionStatus());
    }, () => {
      if (dispatch({ type: 'submit', caseId: reviewCase.id })) render();
    });
    const definition = campaign.days.find((entry) => entry.day === state.day);
    if (!definition) throw new Error(`缺少第 ${state.day} 天关卡`);
    let feedback: HTMLElement | undefined;
    if (locked) {
      const record = state.records.find((entry) => entry.caseId === reviewCase.id);
      if (!record) throw new Error(`缺少裁决 ${reviewCase.id}`);
      feedback = createFeedback(reviewCase, record, state.day, rules);
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'primary-button';
      next.textContent = state.position === definition.caseIds.length - 1 ? '查看日结' : '下一份';
      next.addEventListener('click', () => {
        if (dispatch({ type: 'next', caseId: reviewCase.id })) render();
      });
      feedback.append(next);
    }
    const review = createReview({ reviewCase, day: state.day, position: state.position + 1,
      total: definition.caseIds.length, time: workTime(state, content), rules,
      initialEvidenceIds: state.draft.evidenceIds, locked, decision: decision.element, feedback,
      onEvidenceChange: (evidenceIds) => {
        dispatch({ type: 'selectEvidence', evidenceIds });
        decision.update(decisionStatus());
      } });
    const seedLabel = document.createElement('p');
    seedLabel.className = 'shift-details';
    seedLabel.textContent = `挑战种子：${state.seed}`;
    const points = document.createElement('p');
    points.className = 'shift-score';
    points.textContent = `累计得分：${summarize(state.records, content).points} 分`;
    view.replaceChildren(seedLabel, points, review);
    (feedback ?? review).querySelector<HTMLHeadingElement>('h2')?.focus();
  }

  view.append(createHome((seed) => {
    state = createGame(seed, content);
    render();
  }));

  main.append(header, view);
  root.replaceChildren(main);
}
