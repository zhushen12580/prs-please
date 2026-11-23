import { afterEach, expect, test } from 'vitest';
import { mountApp } from '../src/ui/app';

afterEach(() => {
  document.body.replaceChildren();
});

test('挂载应用后，主区域显示项目名称', () => {
  const root = document.createElement('div');
  document.body.append(root);

  mountApp(root);

  const main = root.querySelector('main');
  expect(main).not.toBeNull();
  expect(main?.querySelector('h1')?.textContent).toBe('PRs, Please');
});
