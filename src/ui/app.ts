import { campaign, cases, rules } from '../content/load';
import { summarize } from '../game/score';
import { canAdvanceDay, canFinishCampaign, canSubmit, createGame, currentCase, transition, workTime, type GameAction } from '../game/state';
import type { GameState } from '../game/types';
import { loadGame, saveGame } from '../platform/storage';
import { createBriefing } from './briefing';
import { confirmRestart } from './confirm';
import { createDecision } from './decision';
import { createFeedback } from './feedback';
import { createHome } from './home';
import { createReview } from './review';
import { createDaySummary, createFinalSummary } from './summary';

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

  const homeButton = document.createElement('button');
  homeButton.type = 'button';
  homeButton.className = 'secondary-button home-button';
  homeButton.textContent = '返回首页';
  homeButton.hidden = true;
  homeButton.addEventListener('click', renderHome);
  header.append(eyebrow, title, homeButton);

  const view = document.createElement('div');
  view.className = 'app-view';
  const content = { campaign, cases, rules };
  let state: GameState | undefined = loadGame(window.localStorage, content);

  function dispatch(action: GameAction): boolean {
    if (!state) return false;
    const next = transition(state, action, content);
    if (next === state) return false;
    state = next;
    saveGame(window.localStorage, state);
    return true;
  }

  function requestStart(seed: string): void {
    if (!state) {
      state = createGame(seed, content);
      saveGame(window.localStorage, state);
      render();
      return;
    }
    confirmRestart(view, state.seed, seed, () => {
      if (dispatch({ type: 'restart', seed })) render();
    });
  }

  function renderHome(): void {
    main.classList.remove('app-workbench');
    homeButton.hidden = true;
    const home = createHome(requestStart, { seed: state?.seed, onContinue: state ? render : undefined });
    view.replaceChildren(home);
    home.querySelector<HTMLHeadingElement>('h2')?.focus();
  }

  function render(): void {
    if (!state) return;
    const activeDay = state.day;
    homeButton.hidden = state.phase === 'final';
    main.classList.toggle('app-workbench', state.phase !== 'briefing');
    if (state.phase === 'briefing') {
      const day = campaign.days.find((entry) => entry.day === activeDay);
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
    if (state.phase === 'final') {
      const seed = state.seed;
      const summary = createFinalSummary(state, content, { onReplay: () => requestStart(seed), onHome: renderHome });
      view.replaceChildren(summary);
      summary.querySelector<HTMLHeadingElement>('h2')?.focus();
      return;
    }
    if (state.phase === 'daySummary') {
      const day = state.day;
      const summary = createDaySummary(state, content, canAdvanceDay(state, content) ? () => {
        if (dispatch({ type: 'nextDay', day })) render();
      } : undefined, canFinishCampaign(state, content) ? () => {
        if (dispatch({ type: 'finishCampaign', day })) render();
      } : undefined);
      view.replaceChildren(summary);
      summary.querySelector<HTMLHeadingElement>('h2')?.focus();
      return;
    }
    const reviewCase = currentCase(state, content);
    const locked = state.phase === 'feedback';
    const decisionStatus = () => ({ verdict: state?.draft.verdict ?? null,
      canSubmit: state ? canSubmit(state, content) : false, locked: state?.phase !== 'review' });
    const decision = createDecision(decisionStatus(), (verdict) => {
      dispatch({ type: 'selectVerdict', verdict });
      decision.update(decisionStatus());
    }, () => {
      if (dispatch({ type: 'submit', caseId: reviewCase.id })) render();
    });
    const definition = campaign.days.find((entry) => entry.day === activeDay);
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

  main.append(header, view);
  root.replaceChildren(main);
  renderHome();
}
