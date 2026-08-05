import { expect, test } from '@playwright/test';
import { signIn, signUp, testUser } from './helpers';

test.describe('Registrazione e accesso', () => {
  test('la pagina di accesso è raggiungibile e in italiano', async ({ page }) => {
    await page.goto('/accedi');
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('le route private rimandano all’accesso', async ({ page }) => {
    await page.goto('/oggi');
    await expect(page).toHaveURL(/\/accedi/);
  });

  test('registrazione e accesso', async ({ page }) => {
    const user = testUser();
    await signUp(page, user);
    // Con la conferma email attiva compare il messaggio; altrimenti si va all'onboarding.
    const confirmation = page.getByText(/email di conferma|Registrazione completata/i);
    if (await confirmation.isVisible().catch(() => false)) {
      test.info().annotations.push({
        type: 'nota',
        description: 'Conferma email attiva: disattivala in Supabase per i test automatici.',
      });
      return;
    }
    await signIn(page, user);
    await expect(page).toHaveURL(/\/(oggi|onboarding)/);
  });
});
