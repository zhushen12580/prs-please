import rules from '../data/rules.json';
import { createBriefing } from './briefing';
import { createHome } from './home';

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
    view.replaceChildren(briefing);
    briefing.querySelector<HTMLHeadingElement>('h2')?.focus();
  }));

  main.append(header, view);
  root.replaceChildren(main);
}
