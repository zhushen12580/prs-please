import { expect, test } from '@playwright/test';

test('构建产物在默认子路径显示项目名称且没有脚本错误', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const response = await page.goto('./');

  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole('main').getByRole('heading', { name: 'PRs, Please', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle('PRs, Please');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(pageErrors).toEqual([]);
});
