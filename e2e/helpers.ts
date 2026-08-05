import type { Page } from '@playwright/test';

export interface TestUser {
  email: string;
  password: string;
}

/** Utente di prova: da variabili d'ambiente oppure generato al volo. */
export function testUser(): TestUser {
  return {
    email: process.env.E2E_EMAIL ?? `studyos-e2e-${Date.now()}@example.com`,
    password: process.env.E2E_PASSWORD ?? 'StudyOS-e2e-2026!',
  };
}

export async function signUp(page: Page, user: TestUser): Promise<void> {
  await page.goto('/registrati');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Crea account' }).click();
}

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/accedi');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await page.waitForURL(/\/(oggi|onboarding)/, { timeout: 30_000 });
}

/** Completa l'onboarding accettando i valori preimpostati. */
export async function completeOnboarding(page: Page): Promise<void> {
  await page.goto('/onboarding');
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('button', { name: 'Avanti' }).click();
  }
  await page.getByRole('button', { name: /Crea tutto e genera il piano/ }).click();
  await page.waitForURL(/\/oggi/, { timeout: 60_000 });
}
