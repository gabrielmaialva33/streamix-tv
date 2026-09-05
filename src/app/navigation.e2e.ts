import { test, expect, scene } from "@/test/tvBrowser";

for (const route of ["/", "/movies", "/series", "/channels", "/guide", "/favorites", "/profile", "/search"]) {
  test(`${route}: Left returns to the sidebar and Right restores content focus`, async ({ remote }) => {
    await remote.open(route);
    if (["/movies", "/series", "/channels"].includes(route)) {
      await remote.focusIn("sidebar");
      await remote.press("ArrowRight");
    }
    await remote.focusIn("pageContainer");
    await remote.press("ArrowLeft");
    await remote.focusIn("sidebar");
    await remote.press("ArrowRight");
    await remote.focusIn("pageContainer");
    await expect(remote.page).toHaveURL(new RegExp(`#${route}$`));
  });
}

for (const hasPrograms of [false, true]) {
  for (const moveToSidebar of [false, true]) {
    test(`guide: late ${hasPrograms ? "programs" : "empty EPG"} preserves ${moveToSidebar ? "sidebar focus" : "the selected channel"}`, async ({
      remote,
    }) => {
      let release!: () => void;
      const responseReady = new Promise<void>(resolve => {
        release = resolve;
      });
      await remote.page.route("**/api/v1/catalog/channels?*", route =>
        route.fulfill({
          json: {
            data: [201, 202].map(id => ({
              id,
              name: id === 201 ? "Test channel" : "Second channel",
              icon: null,
              provider: { id: 1, name: "Test catalog", type: "xtream" },
            })),
            meta: { pagination: { total: 2, offset: 0, limit: 50, has_more: false } },
          },
        }),
      );
      await remote.page.route("**/api/v1/epg/programs?*", async route => {
        await responseReady;
        await route.fulfill({
          json: {
            programs: hasPrograms
              ? {
                  "202": [
                    {
                      id: "test-program",
                      title: "Test program",
                      start: new Date(Date.now() - 30 * 60_000).toISOString(),
                      end: new Date(Date.now() + 30 * 60_000).toISOString(),
                      description: null,
                      category: null,
                    },
                  ],
                }
              : {},
          },
        });
      });
      try {
        await remote.open("/guide");
        await remote.textVisible("Carregando programação… · OK para assistir ao vivo");
        await remote.press("ArrowLeft");
        await remote.focusIn("sidebar");
        await remote.press("ArrowRight");
        await remote.focusIn("guide-channel-201");
        await remote.press("ArrowDown");
        await remote.focusIn("guide-channel-202");
        if (moveToSidebar) {
          await remote.press("ArrowLeft");
          await remote.focusIn("sidebar");
        }
        release();
        await remote.textVisible(
          hasPrograms ? "Test program" : "Sem programação disponível · OK para assistir ao vivo",
        );
        await expect.poll(async () => (await scene(remote.page)).hasFocus).toBe(true);
        await remote.focusIn(moveToSidebar ? "sidebar" : "pageContainer");
        if (moveToSidebar) {
          await remote.press("ArrowRight");
          await remote.focusIn("pageContainer");
        }
        await remote.focusIn("guide-channel-202");
        await remote.press(hasPrograms ? "ArrowDown" : "ArrowUp");
        await remote.focusIn("guide-channel-201");
        await remote.press(hasPrograms ? "ArrowUp" : "ArrowDown");
        await remote.focusIn("guide-channel-202");
      } finally {
        release();
      }
    });
  }
}

test("guide: OK opens the focused live channel", async ({ remote }) => {
  let release!: () => void;
  const metadataReady = new Promise<void>(resolve => {
    release = resolve;
  });
  // This is a navigation test: hold player metadata until teardown so no
  // playback engine or media request is involved in checking the destination.
  await remote.page.route("**/api/v1/catalog/channels/201", async route => {
    await metadataReady;
    if (!remote.page.isClosed()) await route.fallback();
  });
  try {
    await remote.open("/guide");
    await remote.textVisible("Sem programação disponível · OK para assistir ao vivo");
    await remote.press("ArrowLeft");
    await remote.focusIn("sidebar");
    await remote.press("ArrowRight");
    await remote.focusIn("guide-channel-201");
    await remote.press("Enter");
    await expect(remote.page).toHaveURL(/#\/player\/channel\/201$/);
  } finally {
    await remote.page.close();
    release();
  }
});

test("Back opens the exit dialog and cancel restores the same focus", async ({ remote }) => {
  await remote.open();
  await remote.focusIn("pageContainer");
  const before = await scene(remote.page);
  await remote.back();
  await remote.textVisible("Sair do Streamix?");
  await remote.focusIn("exitDialog");
  await expect.poll(async () => (await scene(remote.page)).focusText).toBe("Cancelar");
  await remote.back();
  await expect.poll(async () => (await scene(remote.page)).text).not.toContain("Sair do Streamix?");
  await remote.focusIn("pageContainer");
  await expect.poll(async () => (await scene(remote.page)).focusText).toBe(before.focusText);
  await expect(remote.page).toHaveURL(/#\/$/);
});

test("provider picker consumes Back before catalog, navigation and route", async ({ remote }) => {
  await remote.open();
  await remote.press("ArrowLeft");
  await remote.focusIn("sidebar");
  await remote.press("ArrowDown");
  await expect.poll(async () => (await scene(remote.page)).focusRoute).toBe("/movies");
  await remote.press("Enter");
  await expect(remote.page).toHaveURL(/#\/movies$/);
  await remote.focusIn("sidebar");
  await remote.textVisible("Todos os provedores");
  await remote.press("Enter");
  await remote.textVisible("Selecione a origem do catálogo");
  await remote.back();
  await expect
    .poll(async () => (await scene(remote.page)).text)
    .not.toContain("Selecione a origem do catálogo");
  await expect(remote.page).toHaveURL(/#\/movies$/);
  await remote.back();
  await expect.poll(async () => (await scene(remote.page)).focusRoute).toBe("/movies");
  await expect(remote.page).toHaveURL(/#\/movies$/);
  await remote.back();
  await expect(remote.page).toHaveURL(/#\/$/);
  await expect.poll(async () => (await scene(remote.page)).hasFocus).toBe(true);
});

for (const [catalog, title] of [
  ["movies", "Movie 1"],
  ["series", "Test series"],
  ["channels", "Test channel"],
]) {
  for (const moveToPicker of [false, true]) {
    test(`${catalog}: late data ${moveToPicker ? "preserves the provider picker" : "fulfills pending grid focus"}`, async ({
      remote,
    }) => {
      let release!: () => void;
      const responseReady = new Promise<void>(resolve => {
        release = resolve;
      });
      await remote.page.route(`**/api/v1/catalog/${catalog}?*`, async route => {
        await responseReady;
        await route.fallback();
      });
      try {
        await remote.open(`/${catalog}`);
        await remote.focusIn("sidebar");
        await remote.press("ArrowRight");
        if (moveToPicker) {
          await remote.press("ArrowLeft");
          await remote.focusIn("sidebar");
          await remote.press("Enter");
          await remote.textVisible("Selecione a origem do catálogo");
        }
        release();
        await remote.textVisible(title);
        await remote.focusIn(moveToPicker ? "sidebar" : "pageContainer");
        if (moveToPicker) {
          await remote.back();
          await expect
            .poll(async () => (await scene(remote.page)).text)
            .not.toContain("Selecione a origem do catálogo");
        }
        await expect(remote.page).toHaveURL(new RegExp(`#/${catalog}$`));
      } finally {
        release();
      }
    });
  }
}

test(
  "an activation click after OK does not select the newly opened picker",
  { tag: "@remote-only" },
  async ({ remote }) => {
    await remote.open("/movies");
    await remote.focusIn("sidebar");
    await remote.press("Enter");
    await remote.textVisible("Selecione a origem do catálogo");
    const center = (await scene(remote.page)).buttonCenter;
    expect(center).not.toBeNull();
    // Some WebViews emit an activation click after the remote's Enter. Reproduce
    // that event at the focused option, without adding a second remote press.
    await remote.page.evaluate(position => {
      document.body.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: position!.x,
          clientY: position!.y,
        }),
      );
    }, center);
    await remote.press("ArrowDown");
    await remote.textVisible("Selecione a origem do catálogo");
    await expect.poll(async () => (await scene(remote.page)).focusText).toContain("Test catalog");
    await remote.back();
    await expect(remote.page).toHaveURL(/#\/movies$/);
  },
);

test("a pointer click selects the focused provider once", { tag: "@pointer" }, async ({ remote }) => {
  await remote.open("/movies");
  await remote.focusIn("sidebar");
  await remote.press("Enter");
  await remote.textVisible("Selecione a origem do catálogo");
  await remote.press("ArrowDown");
  await expect.poll(async () => (await scene(remote.page)).focusText).toContain("Test catalog");
  const center = (await scene(remote.page)).buttonCenter;
  expect(center).not.toBeNull();
  await remote.page.mouse.click(center!.x, center!.y);
  await expect
    .poll(async () => (await scene(remote.page)).text)
    .not.toContain("Selecione a origem do catálogo");
  await expect(remote.page).toHaveURL(/#\/movies\?provider=1$/);
  await remote.focusIn("sidebar");
});
