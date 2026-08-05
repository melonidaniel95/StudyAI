import { expect, test } from '@playwright/test';
import { signIn, testUser } from './helpers';

test.describe('Piano giornaliero e sessione di studio', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, testUser());
    if (page.url().includes('/onboarding')) {
      test.skip(true, 'Serve un utente con onboarding già completato (E2E_EMAIL / E2E_PASSWORD).');
    }
  });

  test('la pagina Oggi mostra il piano', async ({ page }) => {
    await page.goto('/oggi');
    await expect(page.getByRole('heading', { name: 'Il tuo piano di oggi' })).toBeVisible();
    await expect(page.getByText('Tempo disponibile')).toBeVisible();
  });

  test('avvio e completamento di una sessione, con aggiornamento del progresso', async ({ page }) => {
    await page.goto('/oggi');

    const start = page.getByRole('button', { name: 'Inizia sessione' }).first();
    if (!(await start.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Genera il piano|Rigenera il piano/ }).first().click();
      await expect(page.getByRole('button', { name: 'Inizia sessione' }).first()).toBeVisible({
        timeout: 30_000,
      });
    }

    await page.getByRole('button', { name: 'Inizia sessione' }).first().click();
    await page.waitForURL(/\/sessione\//, { timeout: 30_000 });

    await expect(page.getByRole('timer')).toBeVisible();
    await page.getByRole('button', { name: 'Concludi' }).click();

    await expect(page.getByRole('heading', { name: 'Come è andata?' })).toBeVisible();
    await page.getByLabel('4', { exact: true }).first().check().catch(() => undefined);
    await page.getByRole('button', { name: /Salva e aggiorna il piano|Salva sul dispositivo/ }).click();

    await page.waitForURL(/\/oggi/, { timeout: 30_000 });
    await expect(page.getByText('Già studiato oggi')).toBeVisible();
  });

  test('registrazione di un ripasso', async ({ page }) => {
    await page.goto('/ripassi');
    await expect(page.getByRole('heading', { name: 'Ripassi' })).toBeVisible();

    const reveal = page.getByRole('button', { name: /Ho provato: mostra i dettagli/ });
    if (await reveal.isVisible().catch(() => false)) {
      await reveal.click();
      await page.getByRole('button', { name: /Ricordavo bene/ }).click();
      await expect(page.getByText(/Ripasso registrato|Ripassi completati/)).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});
