import { expect, test } from '@playwright/test';
import { completeOnboarding, signIn, signUp, testUser } from './helpers';

test('completamento dell’onboarding e creazione dei dati iniziali', async ({ page }) => {
  const user = testUser();
  await signUp(page, user);
  await signIn(page, user).catch(() => undefined);

  if (!page.url().includes('/onboarding')) {
    await page.goto('/onboarding');
  }
  if (page.url().includes('/oggi')) test.skip(true, 'Onboarding già completato per questo utente.');

  await expect(page.getByRole('heading', { name: /Configuriamo StudyAI/ })).toBeVisible();
  await completeOnboarding(page);

  await page.goto('/esami');
  await expect(page.getByText('Elementi di Elettronica')).toBeVisible();
  await expect(page.getByText('Metodi Probabilistici')).toBeVisible();
});
