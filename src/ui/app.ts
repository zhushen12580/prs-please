import { campaign, getDayCases, rules } from '../content/load';
import { orderCases } from '../game/random';
import { createBriefing } from './briefing';
import { createHome } from './home';
import { createReview } from './review';

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
  view.append(createHome((seed) => {
    const firstRule = rules.find((rule) => rule.unlockDay === 1);
    if (!firstRule) throw new Error('缺少第 1 天规则');
    const briefing = createBriefing(seed, 1, firstRule);
    const startReview = document.createElement('button');
    startReview.type = 'button';
    startReview.className = 'primary-button';
    startReview.textContent = '开始评审';
    startReview.addEventListener('click', () => {
      const day = campaign.days.find((entry) => entry.day === 1);
      if (!day) throw new Error('缺少第 1 天关卡');
      const [firstId] = orderCases(day.caseIds, campaign.contentVersion, seed, 1);
      const reviewCase = getDayCases(1).find((entry) => entry.id === firstId);
      if (!reviewCase) throw new Error(`缺少案例 ${firstId}`);
      const review = createReview({ reviewCase, day: 1, position: 1, total: day.caseIds.length, time: '09:00', rules });
      const seedLabel = document.createElement('p');
      seedLabel.className = 'shift-details';
      seedLabel.textContent = `挑战种子：${seed}`;
      main.classList.add('app-workbench');
      view.replaceChildren(seedLabel, review);
      review.querySelector<HTMLHeadingElement>('h2')?.focus();
    });
    briefing.append(startReview);
    view.replaceChildren(briefing);
    briefing.querySelector<HTMLHeadingElement>('h2')?.focus();
  }));

  main.append(header, view);
  root.replaceChildren(main);
}
