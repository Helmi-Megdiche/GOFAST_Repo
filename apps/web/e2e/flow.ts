import { expect, type Page } from "@playwright/test";
import { MORNING } from "./helpers";

/** The order flow W11 to W15 on mock data, shared by order-flow.spec.ts and account.spec.ts. Fake names and phones only. */

export const SENDER_PHONE = "+216 20 000 000";

export const textbox = (page: Page, name: string) =>
  page.getByRole("textbox", { name, exact: true });

export async function start(page: Page, locale = "fr") {
  await page.clock.install({ time: MORNING });
  await page.goto(`/${locale}/commander`);
  await expect(page).toHaveURL(new RegExp(`/${locale}/commander/expediteur$`));
}

export async function fillSender(
  page: Page,
  phone = SENDER_PHONE,
  address = "Avenue Habib Bourguiba",
) {
  await textbox(page, "Adresse de collecte").fill(address.slice(0, 6));
  await page.getByRole("button", { name: address }).click();
  await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
  await textbox(page, "Votre nom").fill("Yasmine K.");
  await textbox(page, "Téléphone").fill(phone);
  await page.getByLabel("Créneau de collecte").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function fillRecipient(
  page: Page,
  address = "Rue Ibn Khaldoun",
  smsLanguage?: "fr" | "ar" | "en",
) {
  await expect(page).toHaveURL(/\/commander\/destinataire$/);
  await textbox(page, "Adresse de livraison").fill(address.slice(0, 6));
  await page.getByRole("button", { name: address }).click();
  await expect(page.getByRole("status").filter({ hasText: /desservie/ })).toBeVisible();
  await textbox(page, "Nom du destinataire").fill("Amel B.");
  await textbox(page, "Téléphone").fill("+216 50 000 000");
  if (smsLanguage) await page.getByLabel("Langue du SMS et du lien").selectOption(smsLanguage);
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function fillParcel(page: Page, count = 1) {
  await expect(page).toHaveURL(/\/commander\/colis$/);
  await page.getByRole("radio", { name: /Petit colis/ }).check();
  if (count > 1) await textbox(page, "Nombre de colis").fill(String(count));
  await textbox(page, "Poids estimé (kg)").fill("2");
  await textbox(page, "Contenu").fill("Vêtements");
  await textbox(page, "Valeur déclarée (TND, facultatif)").fill("48,500");
  await page.getByRole("checkbox", { name: "Colis fragile" }).check();
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function chooseStandard(page: Page) {
  await expect(page).toHaveURL(/\/commander\/service$/);
  await page.getByRole("radio", { name: /Standard/ }).click();
  await expect(page.getByRole("radio", { name: /Standard/ })).toBeChecked();
}

export async function toReview(page: Page, phone = SENDER_PHONE) {
  await fillSender(page, phone);
  await fillRecipient(page);
  await fillParcel(page);
  await chooseStandard(page);
  await page.getByRole("button", { name: "Vérifier ma commande" }).click();
  await expect(page).toHaveURL(/\/commander\/verification$/);
}

export async function payAndAccept(page: Page) {
  await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
  await expect(page.getByRole("radio", { name: /Espèces à l'enlèvement/ })).toBeChecked();
  await page.getByRole("checkbox", { name: /CGV/ }).check();
}
