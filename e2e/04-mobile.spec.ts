import { expect, test } from '@playwright/test';
import { signIn, testUser } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('la navigazione inferiore è utilizzabile da telefono', async ({ page }) => {
  await signIn(page, testUser());
  if (page.url().includes('/onboarding')) {
    test.skip(true, 'Serve un utente con onboarding già completato.');
  }

  await page.goto('/oggi');
  const nav = page.getByRole('navigation', { name: 'Navigazione principale' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Esami' })).toBeVisible();

  await nav.getByRole('link', { name: 'Esami' }).click();
  await expect(page).toHaveURL(/\/esami/);

  await page.getByRole('button', { name: 'Altro' }).click();
  await expect(page.getByRole('dialog')).toContainText('Altre sezioni');
});
