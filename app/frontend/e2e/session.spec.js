import { expect, test } from '@playwright/test';

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('a temporary startup failure keeps the saved sign-in and offers retry', async ({ page }) => {
  let available = false;
  await page.addInitScript(() => { localStorage.setItem('user_number', 'remembered-user'); localStorage.setItem('language', 'en'); });
  await page.route('**/api/**', route => {
    if (route.request().url().endsWith('/api/auth/me')) {
      return available
        ? json(route, 401, { detail: 'Session expired' })
        : json(route, 503, { detail: 'Temporarily unavailable' });
    }
    if (route.request().url().endsWith('/api/auth/refresh')) return json(route, 401, { detail: 'Expired' });
    return json(route, 200, {});
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Try again|Réessayer/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('user_number'))).toBe('remembered-user');
  available = true;
  await page.getByRole('button', { name: /Try again|Réessayer/ }).click();
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('user_number'))).toBeNull();
  await expect(page.getByRole('checkbox', { name: /Remember this device|Se souvenir de cet appareil/ })).toBeChecked();
});
