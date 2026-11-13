import { expect, test, type Page } from "@playwright/test";
import { LOCALES, VIEWPORTS, axe, checkPage } from "./helpers";
import { chooseStandard, fillParcel, fillRecipient, fillSender, start } from "./flow";

const PASSWORD = "fastgo-demo-2026";
const CUSTOMER = "+216 98 000 001";
const MERCHANT = "+216 71 000 001";
const TEAM_USER = "+216 71 000 012";
const TEAM_ADMIN = "+216 71 000 011";
const EMPTY_CUSTOMER = "+216 98 000 003"; // Lina M., no order
const RETURN_DUE = "+216 98 000 005"; // Hana R., owes 7,000 TND for returned parcels

async function signInAs(page: Page, phone: string, next?: string) {
  await page.goto(`/fr/connexion${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.waitForLoadState("networkidle"); // hydrated: a click before it would submit the form natively
  await page.getByRole("textbox", { name: "Téléphone ou e-mail" }).fill(phone);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  // The mock sign-in takes a moment: leave the page only once the session exists.
  await expect(page).not.toHaveURL(/\/connexion/);
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

test("no session: /compte and /pro go to the sign-in page and keep the way back", async ({
  page,
}) => {
  await page.goto("/fr/compte");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcompte$/);
  await page.goto("/fr/pro");
  await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fpro$/);
});

test("a customer on /pro goes to /compte; a merchant on /compte goes to /pro", async ({ page }) => {
  await signInAs(page, CUSTOMER);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.goto("/fr/pro");
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
  await signInAs(page, MERCHANT);
  await expect(page).toHaveURL(/\/fr\/pro$/);
  await page.goto("/fr/compte");
  await expect(page).toHaveURL(/\/fr\/pro$/);
});

test("a merchant and a team user sign in with no next and land on /pro", async ({ page }) => {
  for (const phone of [MERCHANT, TEAM_USER, TEAM_ADMIN]) {
    await page.goto("/fr/connexion");
    await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
    await signInAs(page, phone);
    await expect(page).toHaveURL(/\/fr\/pro$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  const session = JSON.parse((await stored(page, "fg.mock.session")) ?? "null");
  expect(session).toMatchObject({
    accountId: "acc-merchant-validated",
    userId: "usr-yasmine-admin",
    role: "admin",
  });
});

test("a safe next is honoured over the home page", async ({ page }) => {
  await signInAs(page, MERCHANT, "/suivi");
  await expect(page).toHaveURL(/\/fr\/suivi$/);
});

test("sign-out clears the session and the order draft, and keeps the mock tables", async ({
  page,
}) => {
  await signInAs(page, CUSTOMER);
  await expect(page).toHaveURL(/\/fr\/compte$/);
  await page.goto("/fr/suivi?n=FG-7K4M-2QXP"); // seeds the fixture orders
  await expect(page.getByText("Votre livraison est en cours")).toBeVisible();
  await page.evaluate(() => localStorage.setItem("fg.order.draft.v1", '{"version":1}'));
  const orders = await stored(page, "fg.mock.accountOrders");
  expect(orders).not.toBeNull();

  await page.goto("/fr/compte");
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
  expect(await stored(page, "fg.mock.session")).toBeNull();
  expect(await stored(page, "fg.order.draft.v1")).toBeNull();
  expect(await stored(page, "fg.mock.accountOrders")).toBe(orders);
});

test("the nav has no dead link: only the entries whose page exists", async ({ page }) => {
  await signInAs(page, CUSTOMER);
  const nav = page.getByRole("navigation", { name: "Mon espace" });
  await expect(nav.getByRole("link")).toHaveCount(6); // Accueil, Commandes (PR A), Factures, Réclamations (PR C), Adresses, Profil (PR B)
  await expect(nav.getByRole("link", { name: "Commandes" })).toHaveAttribute(
    "href",
    "/fr/compte/commandes",
  );
  await page.evaluate(() => localStorage.removeItem("fg.mock.session"));
  await signInAs(page, MERCHANT);
  await expect(nav.getByRole("link")).toHaveCount(1);
});

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    for (const [path, phone] of [
      ["compte", CUSTOMER],
      ["pro", MERCHANT],
    ] as const) {
      test(`/${locale.code}/${path} at ${viewport.width}px (signed in)`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await signInAs(page, phone);
        await page.goto(`/${locale.code}/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await checkPage(page, locale, `account-${path}-${locale.code}-${viewport.width}`);
      });
    }
  }
}

// ── PR A: client orders (C01 to C03), cancel (CMD-08), W15 (R504, R605, R607), R903 ─────────────

const orderUrl = (code: string, locale = "fr") => `/${locale}/compte/commandes/${code}`;
const dialog = (page: Page) => page.getByRole("dialog");
const rows = (page: Page) => page.locator("main tbody tr");
const events = (page: Page, code: string, to: string) =>
  page.evaluate(
    ([c, status]) =>
      Object.values(
        JSON.parse(localStorage.getItem("fg.mock.statusEvents") ?? "{}") as Record<
          string,
          { subjectType: string; subjectId: string; toStatus: string }
        >,
      ).filter((e) => e.subjectType === "order" && e.subjectId === c && e.toStatus === status)
        .length,
    [code, to] as const,
  );

/** Edits a row of a mock table, as another tab (or the back-office) would. */
const patchRow = (page: Page, table: string, id: string, patch: Record<string, unknown>) =>
  page.evaluate(
    ([t, i, p]) => {
      const all = JSON.parse(localStorage.getItem(t as string) ?? "{}");
      all[i as string] = { ...all[i as string], ...(p as object) };
      localStorage.setItem(t as string, JSON.stringify(all));
    },
    [table, id, patch] as const,
  );

test.describe("C01 dashboard", () => {
  test("greets the customer, lists the orders in progress and the last deliveries", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await expect(page.getByText("Bonjour Sami")).toBeVisible();
    const inProgress = page.locator('[data-slot="inProgress"]');
    await expect(inProgress.getByText("FG-5A1R-0001")).toBeVisible();
    await expect(
      inProgress.getByRole("link", { name: /Voir le détail de la commande FG-5A1R-0001/ }),
    ).toHaveAttribute("href", "/fr/compte/commandes/FG-5A1R-0001");
    const last = page.locator('[data-slot="lastDeliveries"]');
    await expect(last.getByRole("row")).toHaveCount(4); // header + 3
    // The unpaid and the partly paid invoice (ESP-05): the same 29 DT as on C04 (RV-15).
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("29,000 TND");
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("Montant restant à régler");
    await page.goto("/fr/compte/factures");
    await expect(page.locator("main")).toContainText("29,000 TND");
  });

  test("a customer with nothing to pay sees 0 and is up to date", async ({ page }) => {
    await signInAs(page, EMPTY_CUSTOMER);
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("0,000 TND");
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("Vous êtes à jour.");
  });

  test("a customer who owes return fees sees the amount to settle", async ({ page }) => {
    await signInAs(page, RETURN_DUE);
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("7,000 TND");
    await expect(page.locator('[data-slot="toSettle"]')).toContainText("Montant restant à régler");
  });

  test("an account with no order has empty states", async ({ page }) => {
    await signInAs(page, EMPTY_CUSTOMER);
    await expect(page.getByText("Aucune commande en cours.")).toBeVisible();
    await expect(page.getByText("Aucune livraison terminée pour le moment.")).toBeVisible();
  });

  test("a cut connection shows an error and Réessayer loads the page", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await expect(page.getByText("Bonjour Sami")).toBeVisible();
    await page.evaluate(() => localStorage.setItem("fg.mock.failNext:listOrders", "true"));
    await page.reload();
    await expect(page.getByText("Impossible de charger votre espace.")).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByText("Bonjour Sami")).toBeVisible();
  });
});

test.describe("C02 my orders", () => {
  test("lists the orders, 10 per page, and the chips filter through the URL", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/commandes");
    await expect(rows(page)).toHaveCount(10);
    await expect(page.getByRole("status").filter({ hasText: "Affichage de" })).toContainText(
      "sur 14",
    );
    await page.getByRole("link", { name: "Page suivante" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(rows(page)).toHaveCount(4);

    await page.getByRole("link", { name: "Livrées" }).click();
    await expect(page).toHaveURL(/statut=livrees/);
    await expect(page.getByRole("link", { name: "Livrées" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(rows(page)).toHaveCount(3);
    for (const status of await rows(page).locator("td:nth-child(4)").allTextContents()) {
      expect(status).toContain("Livrée");
    }
    await expect(page.getByRole("link", { name: /^En cours \(\d+\)$/ })).toBeVisible();
  });

  test("the filters survive a reload and a shared link", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/commandes?statut=echecs&q=omar");
    await expect(page.getByRole("link", { name: "Échecs et retours" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByRole("searchbox", { name: "Numéro ou destinataire" })).toHaveValue(
      "omar",
    );
    await expect(rows(page).first()).toBeVisible();
    const before = await rows(page).count();
    expect(before).toBeGreaterThan(0);
    await page.reload();
    await expect(rows(page)).toHaveCount(before);
    await expect(page).toHaveURL(/statut=echecs&q=omar/);
  });

  test("search by recipient or number, then by month", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/commandes");
    await page.getByRole("searchbox", { name: "Numéro ou destinataire" }).fill("fg 5a1c 0002");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page).toHaveURL(/q=fg(\+|%20)5a1c(\+|%20)0002/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("FG-5A1C-0002");
    await page.getByRole("searchbox", { name: "Numéro ou destinataire" }).fill("zzz");
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page.getByText("Aucune commande ne correspond à votre recherche.")).toBeVisible();

    await page.goto("/fr/compte/commandes");
    await expect(rows(page).first()).toBeVisible();
    await page.getByLabel("Mois").selectOption("2026-10");
    await expect(page).toHaveURL(/mois=2026-10/);
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("FG-5A1M-0014");
  });

  test("a canceled order shows under Toutes only", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/compte/commandes?q=FG-5A1X-0009");
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText("Annulée");
    // The chips keep the search: the canceled order is in none of the three filters.
    for (const chip of ["Livrées", "Échecs et retours", /^En cours/]) {
      await page.getByRole("link", { name: chip }).click();
      await expect(
        page.getByText("Aucune commande ne correspond à votre recherche."),
      ).toBeVisible();
    }
    await page.getByRole("link", { name: "Toutes" }).click();
    await expect(rows(page)).toHaveCount(1);
  });

  test("an empty account sees an empty state with a way to order", async ({ page }) => {
    await signInAs(page, EMPTY_CUSTOMER);
    await page.goto("/fr/compte/commandes");
    await expect(page.getByText("Aucune commande pour le moment.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Commander" })).toHaveAttribute(
      "href",
      "/fr/commander",
    );
  });

  test("a cut connection shows an error and Réessayer loads the list", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await expect(page.getByText("Bonjour Sami")).toBeVisible();
    await page.evaluate(() => localStorage.setItem("fg.mock.failNext:listOrders", "true"));
    await page.goto("/fr/compte/commandes");
    await expect(page.getByText("Impossible de charger vos commandes.")).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(rows(page)).toHaveCount(10);
  });

  test("the space guard: no session goes to sign-in, a merchant goes to /pro", async ({ page }) => {
    await page.goto("/fr/compte/commandes");
    await expect(page).toHaveURL(/\/fr\/connexion\?next=%2Fcompte%2Fcommandes$/);
    await signInAs(page, MERCHANT);
    await page.goto("/fr/compte/commandes");
    await expect(page).toHaveURL(/\/fr\/pro$/);
  });
});

test.describe("C03 order detail", () => {
  test("shows the timeline, the route, each price line (R204) and the proof (SUI-05)", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1D-0008"));
    await expect(page.getByRole("heading", { level: 1, name: "Ma commande" })).toBeVisible();
    await expect(page.getByText("FG-5A1D-0008").first()).toBeVisible();
    const timeline = page.getByRole("list", { name: "Historique de la commande" });
    await expect(timeline.getByText("Livrée")).toBeVisible();
    await expect(timeline.getByText("Reçue")).toBeVisible();
    const price = page.getByRole("region", { name: "Prix et règlement" });
    await expect(price).toContainText("Service et zone");
    await expect(price).toContainText("9,000 TND");
    await expect(price).toContainText("Distance");
    await expect(price).toContainText("3,000 TND");
    await expect(price).toContainText("12,000 TND");
    await expect(page.getByText("Preuve de remise")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bon de commande" })).toHaveAttribute(
      "href",
      /bon-de-commande/,
    );
    // Names and addresses only: no phone number anywhere on the page.
    expect(await page.locator("main").innerText()).not.toMatch(/\+216|\b\d{2} \d{3} \d{3}\b/);
  });

  test("R208: both weights, and a notice only when the gap is above the tolerance", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1W-0013"));
    const cards = page.getByRole("listitem").filter({ hasText: "Poids mesuré" });
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Poids déclaré");
    await expect(cards.first()).toContainText("1,5 kg");
    await expect(cards.first()).toContainText("2,3 kg");
    await expect(cards.first()).toContainText("Vous serez prévenu avant la facture");
    await expect(cards.nth(1)).toContainText("1,9 kg");
    await expect(cards.nth(1)).not.toContainText("Vous serez prévenu");
  });

  test("R502 and T19: failure reasons in the timeline, each parcel with its own state", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1Z-0012"));
    const timeline = page.getByRole("list", { name: "Historique de la commande" });
    await expect(timeline).toContainText("remise ratée, Destinataire absent");
    await expect(timeline).toContainText("remise ratée, Téléphone injoignable");
    await expect(page.getByText("Motif de l'échec").first()).toBeVisible();
    await page.goto(orderUrl("FG-5A1Y-0011"));
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByText("Rendu", { exact: true })).toBeVisible();
    await expect(page.getByText("Remis", { exact: true })).toHaveCount(2);
  });

  test("another account's order looks like an unknown code, and a cut connection can retry", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5B2A-0001"));
    await expect(page.getByText("Commande introuvable")).toBeVisible();
    const other = await page.locator("main").innerText();
    await page.goto(orderUrl("FG-ZZZZ-9999"));
    await expect(page.getByText("Commande introuvable")).toBeVisible();
    expect(await page.locator("main").innerText()).toBe(other);
    await page.evaluate(() => localStorage.setItem("fg.mock.failNext:getOrder", "true"));
    await page.goto(orderUrl("FG-5A1C-0002"));
    await expect(page.getByText("Impossible de charger cette commande.")).toBeVisible();
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByText("FG-5A1C-0002").first()).toBeVisible();
  });

  test("an order of W13 with 3 parcels shows 3 parcels whose weights add up", async ({ page }) => {
    await start(page);
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/commander");
    await fillSender(page, CUSTOMER);
    await fillRecipient(page);
    await fillParcel(page, 3);
    await chooseStandard(page);
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    const code = new URL(page.url()).searchParams.get("n")!;
    await page.goto(orderUrl(code));
    await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);
    await expect(page.getByText("Poids déclaré")).toHaveCount(3);
    // 2 kg split in grams, the last parcel takes the remainder: 666 + 666 + 668.
    const grams = await page.evaluate((c) => {
      const parcels = JSON.parse(localStorage.getItem("fg.mock.parcels") ?? "{}") as Record<
        string,
        { orderCode: string; weightDeclaredG: number }
      >;
      return Object.values(parcels)
        .filter((p) => p.orderCode === c)
        .map((p) => p.weightDeclaredG);
    }, code);
    expect(grams.reduce((a, b) => a + b, 0)).toBe(2000);
    await expect(page.getByText("0,668 kg")).toBeVisible();
  });
});

test.describe("CMD-08 cancel (R212, T06)", () => {
  test("T06 case 1: free before the driver arrives, no fee line, the order ends canceled", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1C-0002"));
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page)).toContainText("L'annulation est gratuite");
    await expect(dialog(page)).not.toContainText("TND");
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Commande annulée")).toBeVisible();
    await expect(page.getByText("Annulation sans frais.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toHaveCount(0);
    expect(await events(page, "FG-5A1C-0002", "canceled")).toBe(1);
  });

  test("T06 case 2: after the driver arrived the dialog shows the fee before the confirm", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1B-0004"));
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page)).toContainText("Des frais d'annulation s'appliquent selon les CGV");
    await expect(dialog(page)).toContainText("5,000 TND");
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Frais d'annulation : 5,000 TND.")).toBeVisible();
    expect(await events(page, "FG-5A1B-0004", "canceled")).toBe(1);
  });

  test("T06 case 3: after pickup there is no cancel button, only a claim", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1P-0006"));
    await expect(page.getByText("l'annulation n'est plus possible")).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ouvrir une réclamation" })).toHaveAttribute(
      "href",
      "/fr/compte/reclamations/nouvelle?commande=FG-5A1P-0006",
    );
    // The claim link opens C07 pre-filled with that order (ESP-06).
    await page.getByRole("link", { name: "Ouvrir une réclamation" }).click();
    await expect(page).toHaveURL(/\/fr\/compte\/reclamations\/nouvelle\?commande=FG-5A1P-0006$/);
    await expect(page.getByLabel("Votre message")).toBeVisible();
    await expect(page.locator("main").getByText("FG-5A1P-0006")).toBeVisible();
  });

  test("R505: after a failed pickup the dialog says a fee may apply, with the amount", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1F-0005"));
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page)).toContainText("peuvent s'appliquer selon les CGV");
    await expect(dialog(page)).toContainText("5,000 TND");
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("GOFAST vous le confirmera")).toBeVisible();
  });

  test("the safe button has the focus, Escape keeps the order", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1C-0002"));
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page).getByRole("button", { name: "Garder la commande" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toBeFocused();
    expect(await events(page, "FG-5A1C-0002", "canceled")).toBe(0);
  });

  test("stale page: free when opened, the driver arrives elsewhere, the confirm shows the fee", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1A-0003"));
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toBeVisible();
    // Another tab: the pickup mission reaches "arrived".
    const missionId = await page.evaluate(() => {
      const missions = JSON.parse(localStorage.getItem("fg.mock.missions") ?? "{}") as Record<
        string,
        { orderCode: string }
      >;
      return Object.keys(missions).find((id) => missions[id]!.orderCode === "FG-5A1A-0003")!;
    });
    await patchRow(page, "fg.mock.missions", missionId, {
      status: "arrived",
      arrivedAt: "2026-11-04T09:00:00.000Z",
    });
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page)).toContainText("L'annulation est gratuite");
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(dialog(page)).toContainText("La situation de votre commande a changé");
    await expect(dialog(page)).toContainText("5,000 TND");
    expect(await events(page, "FG-5A1A-0003", "canceled")).toBe(0);
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Frais d'annulation : 5,000 TND.")).toBeVisible();
    expect(await events(page, "FG-5A1A-0003", "canceled")).toBe(1);
  });

  test("stale page: free when opened, picked up elsewhere, the confirm says to open a claim", async ({
    page,
  }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1C-0002"));
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toBeVisible();
    await patchRow(page, "fg.mock.accountOrders", "FG-5A1C-0002", { status: "picked_up" });
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("l'annulation n'est plus possible")).toBeVisible();
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Ouvrir une réclamation" })).toBeVisible();
    expect(await events(page, "FG-5A1C-0002", "canceled")).toBe(0);
  });

  test("double click: one cancel, one event", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1C-0002"));
    await page.getByRole("button", { name: "Annuler la commande" }).dblclick();
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).dblclick();
    await expect(page.getByText("Commande annulée")).toBeVisible();
    expect(await events(page, "FG-5A1C-0002", "canceled")).toBe(1);
  });

  test("a cut connection: an error, then the cancel works", async ({ page }) => {
    await signInAs(page, CUSTOMER);
    await page.goto(orderUrl("FG-5A1C-0002"));
    await expect(page.getByRole("button", { name: "Annuler la commande" })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("fg.mock.failNext:cancelOrder", "true"));
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("La connexion a été coupée. Réessayez.")).toBeVisible();
    expect(await events(page, "FG-5A1C-0002", "canceled")).toBe(0);
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Commande annulée")).toBeVisible();
  });

  test("W16 has the same cancel for a signed-in sender", async ({ page }) => {
    await start(page);
    await signInAs(page, CUSTOMER);
    await page.goto("/fr/commander");
    await fillSender(page, CUSTOMER);
    await fillRecipient(page);
    await fillParcel(page);
    await chooseStandard(page);
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    await page.getByRole("button", { name: "Annuler la commande" }).click();
    await expect(dialog(page)).toContainText("L'annulation est gratuite");
    await dialog(page).getByRole("button", { name: "Oui, annuler" }).click();
    await expect(page.getByText("Commande annulée")).toBeVisible();
    await expect(page.getByText("Annulation sans frais.")).toBeVisible();
  });
});

test.describe("W15: R504, R605, R607 and R903", () => {
  async function reviewAs(page: Page, phone: string, smsLanguage?: "fr" | "ar" | "en") {
    await start(page);
    await signInAs(page, phone);
    await page.goto("/fr/commander");
    await fillSender(page, phone);
    await fillRecipient(page, undefined, smsLanguage);
    await fillParcel(page);
    await chooseStandard(page);
    await page.getByRole("button", { name: "Vérifier ma commande" }).click();
    await expect(page).toHaveURL(/\/commander\/verification$/);
  }

  test("R504: the fee of a new attempt (free) and of the return are shown before validating", async ({
    page,
  }) => {
    await reviewAs(page, CUSTOMER);
    const box = page.getByRole("region", { name: "Si la livraison échoue" });
    await expect(box).toContainText("Frais d'un nouvel essai");
    await expect(box).toContainText("Gratuit");
    await expect(box).toContainText("Frais de retour");
    await expect(box).toContainText("5,000 TND");
  });

  test("R607: port dû needs the box; the order stores the acceptance", async ({ page }) => {
    await reviewAs(page, CUSTOMER);
    const box = page.getByRole("checkbox", { name: /destinataire refuse le colis/ });
    await expect(page.getByRole("button", { name: "Valider la commande" })).toBeVisible();
    await expect(box).toHaveCount(0);
    await page.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    await expect(box).toBeVisible();
    await expect(page.getByText(/le port \(.*TND\) et le retour \(5,000\sTND\)/)).toBeVisible();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(
      page.getByText("Acceptez ces conditions pour payer à la livraison."),
    ).toBeVisible();
    await expect(box).toBeFocused();
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await box.check();
    // Switching the way of paying forgets the box: port dû has to be accepted again.
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await page.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    await expect(box).not.toBeChecked();
    await box.check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    const code = new URL(page.url()).searchParams.get("n")!;
    const stored = JSON.parse(
      (await page.evaluate(() => localStorage.getItem("fg.mock.accountOrders"))) ?? "{}",
    );
    expect(stored[code]).toMatchObject({ freightPayer: "recipient", freightPayerAccepted: true });
  });

  test("R607: a recalculated price unticks the box, whose text names the old amount", async ({
    page,
  }) => {
    await reviewAs(page, CUSTOMER);
    await page.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    const box = page.getByRole("checkbox", { name: /destinataire refuse le colis/ });
    await box.check();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.clock.fastForward("15:05");
    await expect(page.getByText("Le prix a été recalculé.")).toBeVisible();
    await expect(box).not.toBeChecked();
    await page.getByRole("button", { name: "Accepter le nouveau prix" }).click();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(
      page.getByText("Acceptez ces conditions pour payer à la livraison."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/commander\/verification$/);
  });

  test("R605: the balance is shown with cash on pickup and with cash on delivery, and blocks the order", async ({
    page,
  }) => {
    await reviewAs(page, RETURN_DUE);
    const note = page.getByText(/Vous devez 7,000\sTND pour des colis retournés/);
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await expect(note).toBeVisible();
    await expect(note).toContainText("doit être réglé avant une nouvelle commande en espèces");
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "solde de frais de retour",
    );
    await expect(page).toHaveURL(/\/commander\/verification$/);
    await page.getByRole("radio", { name: /Espèces à la livraison/ }).click();
    await expect(note).toBeVisible();
    await page.getByRole("checkbox", { name: /destinataire refuse le colis/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText(
      "solde de frais de retour",
    );
    expect(await page.evaluate(() => localStorage.getItem("fg.mock.orders"))).toBeNull();
  });

  test("R903: the SMS language chosen on W12 is stored with the order and the outbox message", async ({
    page,
  }) => {
    await reviewAs(page, CUSTOMER, "en");
    await page.getByRole("radio", { name: /Espèces à l'enlèvement/ }).click();
    await page.getByRole("checkbox", { name: /CGV/ }).check();
    await page.getByRole("button", { name: "Valider la commande" }).click();
    await expect(page).toHaveURL(/\/commander\/confirmation\?n=FG-/);
    const code = new URL(page.url()).searchParams.get("n")!;
    const state = await page.evaluate(() => ({
      orders: JSON.parse(localStorage.getItem("fg.mock.accountOrders") ?? "{}"),
      outbox: Object.values(JSON.parse(localStorage.getItem("fg.mock.outbox") ?? "{}")),
    }));
    expect(state.orders[code].recipientLocale).toBe("en");
    expect(state.outbox).toMatchObject([
      { orderCode: code, template: "trackingLink", locale: "en" },
    ]);
  });
});

const CANCEL_BUTTON = /^(Annuler la commande|Cancel the order|إلغاء الطلب)$/;

for (const locale of LOCALES) {
  for (const viewport of VIEWPORTS) {
    for (const [name, path] of [
      ["c02", "compte/commandes"],
      ["c02-filtered", "compte/commandes?statut=livrees"],
      ["c03-weights", "compte/commandes/FG-5A1W-0013"],
      ["c03-failures", "compte/commandes/FG-5A1Z-0012"],
      ["c03-free-cancel", "compte/commandes/FG-5A1C-0002"],
      ["c03-claim", "compte/commandes/FG-5A1P-0006"],
      ["c03-not-found", "compte/commandes/FG-5B2A-0001"],
    ] as const) {
      test(`/${locale.code}/${path} at ${viewport.width}px (signed in)`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await signInAs(page, CUSTOMER);
        await page.goto(`/${locale.code}/${path}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        await checkPage(page, locale, `account-${name}-${locale.code}-${viewport.width}`);
      });
    }

    test(`/${locale.code}/compte empty account at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, EMPTY_CUSTOMER);
      await page.goto(`/${locale.code}/compte`);
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      await checkPage(page, locale, `account-c01-empty-${locale.code}-${viewport.width}`);
    });

    test(`C03 cancel dialog in ${locale.code} at ${viewport.width}px passes axe`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await signInAs(page, CUSTOMER);
      await page.goto(`/${locale.code}/compte/commandes/FG-5A1B-0004`);
      await page.getByRole("button", { name: CANCEL_BUTTON }).click();
      await expect(dialog(page)).toBeVisible();
      expect(await axe(page), "axe violations").toEqual([]);
    });
  }
}
