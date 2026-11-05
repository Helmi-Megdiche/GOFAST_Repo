import { expect, test, type Page } from "@playwright/test";
import { MORNING } from "./helpers";

/**
 * PR #5 round 3, task 1: a service chosen on W14 that one of the addresses stops offering after a
 * change (Rue de Marseille has no Programmée) is cleared, never priced again, and never ordered.
 * Fake names and phones only. Flow helpers copied from abuse.spec.ts (owned by another change).
 */

const textbox = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });
const draft = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("fg.order.draft.v1") ?? "null"));
const orders = (page: Page) =>
  page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem("fg.mock.orders") ?? "{}")).length,
  );

async function start(page: Page) {
  await page.clock.install({ time: MORNING });
  await page.goto("/fr/commander");
  await expect(page).toHaveURL(/\/fr\/commander\/expediteur$/);
}

async function pickAddress(page: Page, label: string, address: string) {
  await textbox(page, label).fill(address.slice(0, 6));
  await page.getByRole("button", { name: address }).click();
  await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
}

async function fillSender(page: Page) {
  await pickAddress(page, "Adresse de collecte", "Avenue Habib Bourguiba");
  await textbox(page, "Votre nom").fill("Yasmine K.");
  await textbox(page, "Téléphone").fill("+216 20 000 000");
  await page.getByLabel("Créneau de collecte").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillRecipient(page: Page) {
  await expect(page).toHaveURL(/\/commander\/destinataire$/);
  await pickAddress(page, "Adresse de livraison", "Rue Ibn Khaldoun");
  await textbox(page, "Nom du destinataire").fill("Amel B.");
  await textbox(page, "Téléphone").fill("+216 50 000 000");
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillParcel(page: Page) {
  await expect(page).toHaveURL(/\/commander\/colis$/);
  await page.getByRole("radio", { name: /Petit colis/ }).check();
  await textbox(page, "Poids estimé (kg)").fill("2");
  await textbox(page, "Contenu").fill("Vêtements");
  await page.getByRole("button", { name: "Continuer" }).click();
}

/** Programmée with a delivery slot, up to W15. */
async function scheduledReview(page: Page) {
  await start(page);
  await fillSender(page);
  await fillRecipient(page);
  await fillParcel(page);
  await expect(page).toHaveURL(/\/commander\/service$/);
  const scheduled = page.getByRole("radio", { name: /Programmée/ });
  await scheduled.click();
  await expect(scheduled).toBeChecked();
  await page.getByLabel("Créneau de livraison").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Vérifier ma commande" }).click();
  await expect(page).toHaveURL(/\/commander\/verification$/);
}

/** Back on W14 after the change: Programmée is cleared, not priced, and W15 stays closed. */
async function expectServiceCleared(page: Page) {
  await expect(page).toHaveURL(/\/commander\/service$/);
  const scheduled = page.getByRole("radio", { name: /Programmée/ });
  await expect(scheduled).toBeDisabled();
  await expect(scheduled).not.toBeChecked();
  await expect(page.getByRole("complementary", { name: "Votre prix" })).toContainText(
    "Il s'affichera",
  );
  await expect.poll(async () => (await draft(page))?.service).toEqual({ code: null, slot: null });
  const saved = await draft(page);
  expect(saved.quote).toBeNull();
  expect(saved.acceptedQuoteId).toBeNull();

  await page.getByRole("button", { name: "Vérifier ma commande" }).click();
  await expect(page.getByText("Choisissez un service.")).toBeVisible();
  await expect(page).toHaveURL(/\/commander\/service$/);
  await expect(page.locator("#service-express")).toBeFocused();

  // The step guard sends W15 back to W14.
  await page.goto("/fr/commander/verification");
  await expect(page).toHaveURL(/\/commander\/service$/);
  expect(await orders(page)).toBe(0);
}

test.describe("service no longer offered by an address (CMD-04, CMD-07)", () => {
  test("arrival changed to Rue de Marseille on W12 clears Programmée", async ({ page }) => {
    await scheduledReview(page);
    await page.getByRole("link", { name: "Modifier : Votre livraison" }).click();
    await expect(page).toHaveURL(/\/commander\/expediteur$/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/commander\/destinataire$/);
    await pickAddress(page, "Adresse de livraison", "Rue de Marseille");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/commander\/colis$/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expectServiceCleared(page);
  });

  test("departure changed to Rue de Marseille on W11 clears Programmée", async ({ page }) => {
    await scheduledReview(page);
    await page.getByRole("link", { name: "Modifier : Votre livraison" }).click();
    await expect(page).toHaveURL(/\/commander\/expediteur$/);
    await pickAddress(page, "Adresse de collecte", "Rue de Marseille");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/commander\/destinataire$/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/commander\/colis$/);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expectServiceCleared(page);
  });
});
