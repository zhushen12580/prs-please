export function mountApp(root: HTMLElement): void {
  const main = document.createElement('main');
  main.className = 'app';

  const title = document.createElement('h1');
  title.textContent = 'PRs, Please';

  const description = document.createElement('p');
  description.textContent = '一款扮演开源维护者的单人评审小游戏。';

  main.append(title, description);
  root.replaceChildren(main);
}
