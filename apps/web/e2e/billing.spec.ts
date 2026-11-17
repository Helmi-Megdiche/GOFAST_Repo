import { expect, test, type Page } from "@playwright/test";
import { LOCALES, VIEWPORTS, checkPage, openForm } from "./helpers";

const PASSWORD = "fastgo-demo-2026";
const CUSTOMER = "+216 98 000 001";
const MB = 1024 * 1024;

async function signInAs(page: Page, phone: string) {
  await openForm(page, "/fr/connexion");
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(phone);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/connexion/);
}

const main = (page: Page) => page.locator("main");
const loaded = (page: Page) => expect(page.locator("main [aria-busy='true']")).toHaveCount(0);

const file = (name: string, size: number, mimeType: string) => ({
  name,
  mimeType,
  buffer: Buffer.alloc(size, 1),
});

const rows = (page: Page, table: string) =>
  page.evaluate((key) => Object.keys(JSON.parse(localStorage.getItem(key) ?? "{}")).length, table);

test.describe("C04 to C07 pages (ESP-05, ESP-06)", () => {
  const PAGES: [string, string, string][] = [
    ["c04-invoices", "compte/factures", "FAC-2026-0000003"],
    ["c05-invoice", "compte/factures/FAC-2026-0000004", "FG-5A1Y-0011"],
    ["c06-claims", "compte/reclamations", "T-2041"],
    ["c07-new", "compte/reclamations/nouvelle?commande=FG-5A1D-0008", "FG-5A1D-0008"],
    ["c07-claim", "compte/reclamations/T-2041", "T-2041"],
  ];
  for (const locale of LOCALES) {
    for (const viewport of VIEWPORTS) {
      for (const [name, path, marker] of PAGES) {
        test(`${name} ${locale.code} ${viewport.width}px`, async ({ page }) => {
          await page.setViewportSize(viewport);
          await signInAs(page, CUSTOMER);
          await page.goto(`/${locale.code}/${path}`);
          await expect(main(page).getByText(marker).first()).toBeVisible();
          await loaded(page);
          await checkPage(page, locale, `${name}-${locale.code}-${viewport.width}`);
        });
      }
    }
  }
});

test.describe("C04 and C05 invoices", () => {
  test("the list shows invoices and the issued credit note, not the proposal", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures");
    await expect(main(page).getByRole("link", { name: "Voir AV-2026-0000001" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: /^Voir FAC-/ })).toHaveCount(4);
    await expect(main(page).getByText("À régler").first()).toBeVisible();
  });

  test("R602: a corrected invoice shows its credit note, and the credit note shows its invoice", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000003");
    await page.getByRole("link", { name: /Corrigée par l'avoir/ }).click();
    await expect(main(page).getByText("Cet avoir corrige la facture")).toBeVisible();
    await main(page)
      .getByRole("link", { name: /Cet avoir corrige/ })
      .click();
    await expect(main(page).getByText("Partielle").first()).toBeVisible();
  });

  test("R606 T19: three parcels' freight and the return fee; R204 stamp; VAT is a placeholder; no TTN", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000004");
    const table = main(page).getByRole("table");
    await expect(table.getByText("Livraison Standard, colis 1")).toBeVisible();
    await expect(table.getByText("Livraison Standard, colis 2")).toBeVisible();
    await expect(table.getByText("Livraison Standard, colis 3")).toBeVisible();
    await expect(table.getByText("Frais de retour, colis 3")).toBeVisible();
    await expect(table.getByText("5,000 TND")).toBeVisible();
    await expect(main(page).getByText("Timbre fiscal")).toBeVisible();
    await expect(main(page).getByText("[TVA]")).toBeVisible();
    await expect(main(page).getByText("El Fatoora")).toHaveCount(0);
    await expect(main(page).getByText("Sami T.")).toBeVisible();
  });

  test("a multi-order invoice lists its orders", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000002");
    await expect(main(page).getByRole("link", { name: "FG-5A1D-0008" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "FG-5A1W-0013" })).toBeVisible();
    await expect(main(page).getByText("À régler").first()).toBeVisible();
  });

  test("another account's invoice answers exactly like a missing one", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000005");
    await expect(main(page).getByText("Facture introuvable")).toBeVisible();
    const foreign = await main(page).innerText();
    await page.goto("/fr/compte/factures/FAC-2026-0000999");
    await expect(main(page).getByText("Facture introuvable")).toBeVisible();
    expect(await main(page).innerText()).toBe(foreign);
  });
});

test.describe("C07 new claim", () => {
  test("'Contester' on a one-order invoice opens the claim with that order", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000001");
    await page.getByRole("link", { name: "Contester cette facture" }).click();
    await expect(page).toHaveURL(/nouvelle\?facture=FAC-2026-0000001$/);
    await expect(main(page).getByText("FG-5A1M-0014")).toBeVisible();
    await expect(page.getByLabel("Sujet")).toHaveValue("billing");
  });

  test("'Contester' on a two-order invoice: the client must pick the order first", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/factures/FAC-2026-0000002");
    await page.getByRole("link", { name: "Contester cette facture" }).click();
    await expect(main(page).getByText("Choisissez la commande concernée").first()).toBeVisible();
    await expect(page.getByLabel("Votre message")).toHaveCount(0);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(
      main(page).getByRole("alert").filter({ hasText: "Choisissez la commande" }),
    ).toBeVisible();
    await page.getByRole("radio").nth(1).check();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/facture=FAC-2026-0000002&commande=FG-5A1W-0013$/);
    await expect(page.getByLabel("Votre message")).toBeVisible();
    await expect(main(page).getByText("FG-5A1W-0013").first()).toBeVisible();
  });

  test("an order outside the invoice, and another account's order, are not found", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(
      "/fr/compte/reclamations/nouvelle?facture=FAC-2026-0000002&commande=FG-5A1M-0014",
    );
    await expect(main(page).getByText("Commande ou facture introuvable")).toBeVisible();
    await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5B2A-0001");
    await expect(main(page).getByText("Commande ou facture introuvable")).toBeVisible();
    await page.goto("/fr/compte/reclamations/nouvelle?facture=FAC-2026-0000005");
    await expect(main(page).getByText("Commande ou facture introuvable")).toBeVisible();
  });

  test("R801 R802 R804: the delay, the declared value or the flat cap, the reply time", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5A1D-0008");
    await expect(main(page).getByText("dans les 48 h qui suivent")).toBeVisible();
    await expect(main(page).getByText("Valeur déclarée de la commande")).toBeVisible();
    await expect(main(page).getByText("120,000 TND")).toBeVisible();
    await expect(main(page).getByText("Sous 48 h")).toBeVisible();
    await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5A1M-0014");
    await expect(main(page).getByText("le forfait des CGV s'applique")).toBeVisible();
    await expect(main(page).getByText("100,000 TND")).toBeVisible();
    await expect(main(page).getByText("[FORFAIT]")).toHaveCount(0);
    await expect(main(page).getByText("[DÉLAI CGV]")).toHaveCount(0);
  });

  test("a claim is saved once on a double click, and the damage claim leaves the order alone", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5A1D-0008");
    await page.getByLabel("Sujet").selectOption("damage");
    await page.getByLabel("Votre message").fill("Le colis est arrivé cabossé.");
    const before = await page.evaluate(() => localStorage.getItem("fg.mock.parcels"));
    const send = page.getByRole("button", { name: "Envoyer la réclamation" });
    await send.dblclick();
    await expect(page).toHaveURL(/reclamations\/T-2042$/);
    await expect(main(page).getByText("Le colis est arrivé cabossé.")).toBeVisible();
    await expect(main(page).getByText("Ouverte").first()).toBeVisible();
    expect(await rows(page, "fg.mock.tickets")).toBe(4);
    expect(await page.evaluate(() => localStorage.getItem("fg.mock.parcels"))).toBe(before);
  });

  test("errors: the empty form names each field and puts the focus on the first", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5A1D-0008");
    await page.getByRole("button", { name: "Envoyer la réclamation" }).click();
    await expect(main(page).getByText("Choisissez un sujet.")).toBeVisible();
    await expect(main(page).getByText("Écrivez votre message.")).toBeVisible();
    await expect(page.getByLabel("Sujet")).toBeFocused();
  });

  test("attachments: exactly 5 MB passes, 5 MB + 1 byte is refused, a sixth file and a .docx are refused", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    const open = async () => {
      await page.goto("/fr/compte/reclamations/nouvelle?commande=FG-5A1D-0008");
      await expect(page.getByLabel("Votre message")).toBeVisible();
      await page.waitForLoadState("networkidle");
    };
    const input = page.locator('input[type="file"]');
    await open();
    await input.setInputFiles(file("exact.png", 5 * MB, "image/png"));
    await expect(main(page).getByText("exact.png")).toBeVisible();
    await expect(main(page).getByText(/Un fichier dépasse|Seuls les images/)).toHaveCount(0);

    await open();
    await input.setInputFiles(file("big.png", 5 * MB + 1, "image/png"));
    await expect(main(page).getByText("Un fichier dépasse 5 Mo.")).toBeVisible();

    await open();
    await input.setInputFiles(
      file(
        "note.docx",
        100,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    );
    await expect(main(page).getByText("Seuls les images et les PDF sont acceptés.")).toBeVisible();

    await open();
    await input.setInputFiles(
      Array.from({ length: 5 }, (_, i) => file(`p${i + 1}.pdf`, 100, "application/pdf")),
    );
    await expect(main(page).getByText(/Un fichier dépasse|Seuls les images/)).toHaveCount(0);
    await input.setInputFiles(file("p6.pdf", 100, "application/pdf"));
    await expect(main(page).getByText("5 fichiers au maximum.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Retirer p6.pdf" }).click();
    await expect(main(page).getByText("5 fichiers au maximum.", { exact: true })).toHaveCount(0);
  });
});

test.describe("C06 and C07 claims", () => {
  test("the list shows the account's claims only", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations");
    await expect(main(page).getByRole("link", { name: "Ouvrir T-2041" })).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Ouvrir T-1988" })).toBeVisible();
    await expect(main(page).getByText("T-2040")).toHaveCount(0);
    await expect(main(page).getByText("À compléter")).toBeVisible();
  });

  test("T30: the internal note is not in the page", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/T-2041");
    await expect(main(page).getByText("Nous sommes désolés")).toBeVisible();
    expect(await page.content()).not.toContain("NOTE INTERNE");
    expect(await main(page).innerText()).not.toContain("vérifier le constat");
  });

  test("replying to a claim to complete makes it open again, once", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/T-2041");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(main(page).getByText("Écrivez votre message.")).toBeVisible();
    await page.getByLabel("Votre réponse").fill("Voici la photo.");
    await page.getByRole("button", { name: "Envoyer", exact: true }).click();
    await expect(main(page).getByText("Voici la photo.")).toBeVisible();
    await expect(main(page).getByText("Ouverte").first()).toBeVisible();
    await expect(main(page).getByText("Le service client attend votre réponse.")).toHaveCount(0);
  });

  test("R804: a closed claim is reopened within 30 days", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.clock.setFixedTime(new Date("2026-11-20T09:00:00Z"));
    await page.goto("/fr/compte/reclamations/T-1988");
    await expect(main(page).getByText("Résolue").first()).toBeVisible();
    await expect(main(page).getByText("Possible jusqu'au")).toBeVisible();
    await page.getByRole("button", { name: "Rouvrir la réclamation" }).click();
    await expect(main(page).getByText("Ouverte").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Rouvrir la réclamation" })).toHaveCount(0);
    await expect(page.getByLabel("Votre réponse")).toBeVisible();
  });

  test("R804: after the window the claim is archived and read-only", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.clock.setFixedTime(new Date("2026-12-10T09:00:00Z"));
    await page.goto("/fr/compte/reclamations/T-1988");
    await expect(main(page).getByText("Archivée").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Rouvrir la réclamation" })).toHaveCount(0);
    await expect(page.getByLabel("Votre réponse")).toHaveCount(0);
    await expect(main(page).getByText("Le retard est confirmé")).toBeVisible();
    await page.goto("/fr/compte/reclamations");
    await expect(main(page).getByText("Archivée")).toBeVisible();
  });

  test("stale page: closed claim reopened elsewhere, the second click refreshes the page", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.clock.setFixedTime(new Date("2026-11-20T09:00:00Z"));
    await page.goto("/fr/compte/reclamations/T-1988");
    const reopen = page.getByRole("button", { name: "Rouvrir la réclamation" });
    await expect(reopen).toBeVisible();
    // Another tab reopens the claim.
    await page.evaluate(() => {
      const key = "fg.mock.tickets";
      const tickets = JSON.parse(localStorage.getItem(key) ?? "{}");
      tickets["T-1988"] = { ...tickets["T-1988"], status: "open", closedAt: null };
      localStorage.setItem(key, JSON.stringify(tickets));
    });
    await reopen.click();
    await expect(main(page).getByText("Cette réclamation n'est plus close.")).toBeVisible();
    await expect(page.getByLabel("Votre réponse")).toBeVisible();
  });

  test("another account's claim answers exactly like a missing one", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/reclamations/T-2040");
    await expect(main(page).getByText("Réclamation introuvable")).toBeVisible();
    const foreign = await main(page).innerText();
    await page.goto("/fr/compte/reclamations/T-9999");
    await expect(main(page).getByText("Réclamation introuvable")).toBeVisible();
    expect(await main(page).innerText()).toBe(foreign);
  });
});
