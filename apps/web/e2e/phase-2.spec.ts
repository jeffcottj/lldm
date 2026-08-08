import type { CombinedPublicTvView } from "@lldm/contracts";
import {
  CombinedProjectionDeliverySchema,
  validateValue,
} from "@lldm/contracts";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Page,
} from "@playwright/test";
import { expect, test } from "@playwright/test";

const hostOrigin = "http://127.0.0.1:3210";
const harnessControlOrigin = "http://127.0.0.1:3211";

interface CreatedRoom {
  readonly room_session_id: string;
  readonly relay_room_id: string;
  readonly join_url: string;
  readonly host_bootstrap_proof: string;
  readonly seed_fingerprint: string;
}

const heroNames = [
  "Mara Venn",
  "Sable Reed",
  "Ilyra Quill",
  "Oren Ash",
  "Kest Rel",
] as const;

const heroActorIds = [
  "actor_mara_venn_001",
  "actor_sable_reed_001",
  "actor_ilyra_quill_001",
  "actor_oren_ash_001",
  "actor_kest_rel_001",
] as const;

const privateClues = [
  "The strain lines point away from the main gate",
  "A dry chalk trace marks a maintenance crawl",
  "The custodian's seal promises safe passage",
  "The ritual circuit is not broken",
  "The locking pawl lifts for one breath",
] as const;

function uiLabel(value: string): string {
  return value
    .replace(/^(content|starter_loadout|actor|seat)_/, "")
    .replace(/_\d+$/, "")
    .replaceAll("_", " ");
}

function zoneSteps(
  zones: readonly {
    readonly zone_id: string;
    readonly connections: readonly string[];
  }[],
  from: string,
  targets: ReadonlySet<string>,
): number {
  if (targets.has(from)) return 0;
  const byId = new Map(zones.map((zone) => [zone.zone_id, zone]));
  let frontier = [from];
  const seen = new Set(frontier);
  for (let distance = 1; frontier.length > 0; distance += 1) {
    const next: string[] = [];
    for (const zoneId of frontier)
      for (const connected of byId.get(zoneId)?.connections ?? []) {
        if (targets.has(connected)) return distance;
        if (!seen.has(connected)) {
          seen.add(connected);
          next.push(connected);
        }
      }
    frontier = next;
  }
  return Number.MAX_SAFE_INTEGER;
}

async function createRoomFromTv(
  tv: Page,
  mode: "normal" | "rehearsal",
  fixtureSeedHex?: string,
): Promise<CreatedRoom> {
  await tv.goto(`${hostOrigin}/tv`);
  if (fixtureSeedHex !== undefined)
    await tv.route(`${hostOrigin}/api/tv/runs`, async (route) => {
      expect(route.request().postDataJSON()).toEqual({ mode });
      await route.continue({
        postData: JSON.stringify({ mode, fixture_seed_hex: fixtureSeedHex }),
        headers: {
          ...route.request().headers(),
          "content-type": "application/json",
        },
      });
    });
  const responsePromise = tv.waitForResponse(
    (response) =>
      response.url() === `${hostOrigin}/api/tv/runs` &&
      response.request().method() === "POST",
  );
  await tv
    .getByRole("button", {
      name:
        mode === "normal" ? "New room · 3–5 players" : "Two-player rehearsal",
    })
    .click();
  const response = await responsePromise;
  expect(response.request().postDataJSON()).toEqual(
    fixtureSeedHex === undefined
      ? { mode }
      : { mode, fixture_seed_hex: fixtureSeedHex },
  );
  expect(response.status()).toBe(201);
  const created = (await response.json()) as CreatedRoom;
  expect(created.seed_fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
  await expect(
    tv.getByRole("heading", { name: "Join on your phone" }),
  ).toBeVisible();
  if (fixtureSeedHex !== undefined)
    await tv.unroute(`${hostOrigin}/api/tv/runs`);
  return created;
}

async function joinPending(
  page: Page,
  room: CreatedRoom,
  displayName: string,
  proof?: string,
): Promise<void> {
  await page.goto(room.join_url);
  await page.getByLabel("Your table name").fill(displayName);
  if (proof !== undefined)
    await page.getByLabel("First player-host proof").fill(proof);
  await page
    .getByRole("button", { name: "Join and wait for approval" })
    .click();
  await expect(
    page.getByText("Waiting for the player-host to approve this device."),
  ).toBeVisible();
}

async function bootstrapHost(page: Page, room: CreatedRoom): Promise<void> {
  await joinPending(page, room, "Host Player", room.host_bootstrap_proof);
  await page
    .getByRole("button", { name: "Redeem first player-host proof" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a hero" }),
  ).toBeVisible();
}

async function claimHero(page: Page, heroName: string): Promise<void> {
  await page.getByRole("button", { name: `Claim ${heroName}` }).click();
  await expect(page.locator(".result.accepted")).toContainText(
    "The room command was recorded.",
    { timeout: 10_000 },
  );
  const exactHeroName = new RegExp(
    `^${heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    "i",
  );
  const selectedHero = page.getByRole("heading", {
    name: exactHeroName,
    level: 2,
  });
  const rehearsalSeat = page
    .getByRole("navigation", { name: "Your rehearsal heroes" })
    .getByRole("button", { name: exactHeroName });
  await expect(selectedHero.or(rehearsalSeat)).toBeVisible({
    timeout: 10_000,
  });
}

async function storedParticipantId(page: Page, roomId: string) {
  return await expect
    .poll(async () =>
      page.evaluate(async (requestedRoomId) => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const open = indexedDB.open("lldm-reconnect-v1", 1);
          open.onsuccess = () => resolve(open.result);
          open.onerror = () => reject(open.error);
        });
        return await new Promise<string | null>((resolve, reject) => {
          const read = database
            .transaction("rooms")
            .objectStore("rooms")
            .get(requestedRoomId);
          read.onsuccess = () =>
            resolve(
              (read.result as { participant_id?: string } | undefined)
                ?.participant_id ?? null,
            );
          read.onerror = () => reject(read.error);
        });
      }, roomId),
    )
    .not.toBeNull();
}

async function storedViewRevision(page: Page, roomId: string) {
  return await page.evaluate(async (requestedRoomId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("lldm-reconnect-v1", 1);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return await new Promise<number | null>((resolve, reject) => {
      const read = database
        .transaction("rooms")
        .objectStore("rooms")
        .get(requestedRoomId);
      read.onsuccess = () =>
        resolve(
          (read.result as { view_revision?: number } | undefined)
            ?.view_revision ?? null,
        );
      read.onerror = () => reject(read.error);
    });
  }, roomId);
}

async function currentPublicView(
  request: APIRequestContext,
  roomSessionId: string,
) {
  const response = await request.get(
    `${hostOrigin}/api/tv/rooms/${encodeURIComponent(roomSessionId)}/view?cursor=0`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { deliveries?: readonly unknown[] };
  let current: unknown = null;
  for (const raw of body.deliveries ?? []) {
    const delivery = validateValue(CombinedProjectionDeliverySchema, raw);
    expect(delivery.success).toBe(true);
    if (!delivery.success) continue;
    current =
      delivery.value.delivery_kind === "snapshot"
        ? delivery.value.view
        : delivery.value.operations[0].value;
  }
  if (
    current === null ||
    typeof current !== "object" ||
    !("view_kind" in current) ||
    current.view_kind !== "public_tv"
  )
    throw new Error("Current public TV projection is unavailable.");
  return current as CombinedPublicTvView;
}

async function openPlayerContexts(
  browser: Browser,
  count: number,
  fixtureNamespace: number,
) {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let index = 0; index < count; index += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    await context.addInitScript(
      ({ namespace, playerIndex }) => {
        const counterKey = `lldm-fixture-uuid-${namespace}-${playerIndex}`;
        let fallbackCounter = 0;
        Object.defineProperty(Crypto.prototype, "randomUUID", {
          configurable: true,
          value: () => {
            let counter = fallbackCounter;
            try {
              counter = Number(localStorage.getItem(counterKey) ?? "0");
              localStorage.setItem(counterKey, String(counter + 1));
            } catch {
              fallbackCounter += 1;
            }
            const tail = (
              BigInt(namespace) * 1_000_000_000n +
              BigInt(playerIndex) * 1_000_000n +
              BigInt(counter)
            )
              .toString()
              .padStart(12, "0");
            return `00000000-0000-4000-8000-${tail}`;
          },
        });
      },
      { namespace: fixtureNamespace, playerIndex: index },
    );
    contexts.push(context);
    pages.push(await context.newPage());
  }
  return { contexts, pages };
}

async function driveObjectiveVictory(input: {
  readonly pages: readonly Page[];
  readonly actorIds: readonly string[];
  readonly request: APIRequestContext;
  readonly roomSessionId: string;
  readonly relayRoomId: string;
}) {
  let flavorRecorded = false;
  for (let step = 0; step < 240; step += 1) {
    const before = await currentPublicView(input.request, input.roomSessionId);
    if (before.current_beat_id !== "guided_beat_combat_001") return;
    const pendingRoll = before.mechanical.payload.pending_rolls[0];
    if (pendingRoll !== undefined) {
      let roller: Page | undefined;
      for (const page of input.pages)
        if (
          await page
            .getByRole("heading", { name: "Enter the physical die" })
            .isVisible()
        ) {
          roller = page;
          break;
        }
      if (roller === undefined)
        throw new Error("A pending combat roll has no eligible phone.");
      await roller.getByRole("button", { name: "20", exact: true }).click();
      await roller.getByRole("button", { name: "Submit final die" }).click();
      await expect
        .poll(async () => {
          const pending = (
            await currentPublicView(input.request, input.roomSessionId)
          ).mechanical.payload.pending_rolls[0];
          return pending?.pending_check_id ?? null;
        })
        .not.toBe(pendingRoll.pending_check_id);
      continue;
    }
    const combat = before.mechanical.payload.combat;
    if (combat === null) return;
    const reaction = combat.reaction_window;
    if (reaction !== null) {
      const responderIndex = input.actorIds.indexOf(
        reaction.eligible_actor_ids[0] ?? "",
      );
      const responder = input.pages[responderIndex];
      if (responder === undefined)
        throw new Error("Reaction responder has no browser context.");
      await expect(
        responder.getByRole("heading", { name: "Reaction window" }),
      ).toBeVisible({ timeout: 10_000 });
      const responseKey = `${reaction.reaction_window_id}:${reaction.eligible_actor_ids[0]}`;
      await responder.getByRole("button", { name: "Pass" }).click();
      await expect
        .poll(
          async () => {
            const current = (
              await currentPublicView(input.request, input.roomSessionId)
            ).mechanical.payload.combat?.reaction_window;
            return current === null || current === undefined
              ? null
              : `${current.reaction_window_id}:${current.eligible_actor_ids[0]}`;
          },
          { timeout: 10_000 },
        )
        .not.toBe(responseKey);
      continue;
    }
    if (combat.active_actor_id === null) {
      try {
        await expect
          .poll(
            async () =>
              await Promise.all(
                input.pages.map((page) =>
                  page
                    .getByRole("button", { name: "Take the Lead" })
                    .isVisible(),
                ),
              ).then((visible) => visible.filter(Boolean).length),
            { timeout: 10_000 },
          )
          .toBeGreaterThan(0);
      } catch {
        const stalled = (
          await currentPublicView(input.request, input.roomSessionId)
        ).mechanical.payload.combat;
        throw new Error(
          `No activation was delivered from ${JSON.stringify({
            round: stalled?.round,
            active_side: stalled?.active_side,
            reaction: stalled?.reaction_window,
            participants: stalled?.participants.map(
              ({ actor_id, side, activation_spent, guard }) => ({
                actor_id,
                side,
                activation_spent,
                guard: guard?.current,
              }),
            ),
          })}`,
        );
      }
      let leader: Page | undefined;
      for (const page of [input.pages[0], ...input.pages].filter(
        (candidate): candidate is Page => candidate !== undefined,
      ))
        if (
          await page.getByRole("button", { name: "Take the Lead" }).isVisible()
        ) {
          leader = page;
          break;
        }
      if (leader === undefined)
        throw new Error("No legal hero activation reached a phone.");
      await leader.getByRole("button", { name: "Take the Lead" }).click();
      await expect
        .poll(
          async () =>
            (await currentPublicView(input.request, input.roomSessionId))
              .mechanical.payload.combat?.active_actor_id ?? null,
          { timeout: 10_000 },
        )
        .not.toBeNull();
      continue;
    }
    const actorIndex = input.actorIds.indexOf(combat.active_actor_id);
    const actor = combat.participants.find(
      ({ actor_id }) => actor_id === combat.active_actor_id,
    );
    if (actorIndex < 0 || actor?.side !== "hero") {
      await expect
        .poll(
          async () =>
            (await currentPublicView(input.request, input.roomSessionId))
              .mechanical_revision,
        )
        .not.toBe(before.mechanical_revision);
      continue;
    }
    const page = input.pages[actorIndex];
    if (page === undefined) throw new Error("Active hero phone is missing.");
    await expect
      .poll(() => storedViewRevision(page, input.relayRoomId), {
        timeout: 10_000,
      })
      .toBeGreaterThanOrEqual(before.view_revision);
    const slot = actor.action_available
      ? (await page
          .getByRole("button", { name: /^attack action/ })
          .first()
          .isVisible())
        ? "attack"
        : (await page
              .getByRole("button", { name: /^advance objective action/ })
              .isVisible())
          ? "objective"
          : "action"
      : actor.maneuver_available
        ? (await page
            .getByRole("button", { name: /^move maneuver/ })
            .first()
            .isVisible())
          ? "move"
          : "maneuver"
        : null;
    if (slot === null) continue;
    const livingEnemies = combat.participants
      .filter(
        (participant) =>
          participant.side === "enemy" && participant.guard.current > 0,
      )
      .toSorted((left, right) => left.guard.current - right.guard.current);
    const preferredEnemy = livingEnemies[0];
    const attackTarget =
      preferredEnemy === undefined
        ? null
        : page
            .getByRole("button", {
              name: new RegExp(
                `^attack action.*${uiLabel(preferredEnemy.actor_id)}`,
              ),
            })
            .first();
    const enemyZones = new Set(livingEnemies.map(({ zone_id }) => zone_id));
    const preferredMoveZone = combat.battlefield.zones
      .find(({ zone_id }) => zone_id === actor.zone_id)
      ?.connections.toSorted(
        (left, right) =>
          zoneSteps(combat.battlefield.zones, left, enemyZones) -
          zoneSteps(combat.battlefield.zones, right, enemyZones),
      )[0];
    const moveTarget =
      preferredMoveZone === undefined
        ? null
        : page
            .getByRole("button", {
              name: new RegExp(`^move maneuver.*${uiLabel(preferredMoveZone)}`),
            })
            .first();
    const action =
      slot === "attack"
        ? attackTarget !== null && (await attackTarget.isVisible())
          ? attackTarget
          : page.getByRole("button", { name: /^attack action/ }).first()
        : slot === "objective"
          ? page.getByRole("button", { name: /^advance objective action/ })
          : slot === "move"
            ? moveTarget !== null && (await moveTarget.isVisible())
              ? moveTarget
              : page.getByRole("button", { name: /^move maneuver/ }).first()
            : page.getByRole("button", { name: new RegExp(`^pass ${slot}`) });
    await expect(action).toBeVisible({ timeout: 10_000 });
    await action.click();
    await expect(
      page.getByRole("button", { name: "Confirm action" }),
    ).toBeVisible();
    const recordsFlavor =
      (slot === "attack" || slot === "objective") && !flavorRecorded;
    if (recordsFlavor) {
      await page
        .getByLabel("How do you do it?")
        .fill("Mara locks the spillway tooth against the rising current.");
      flavorRecorded = true;
    }
    await page.getByRole("button", { name: "Confirm action" }).click();
    await expect
      .poll(async () => {
        const current = await currentPublicView(
          input.request,
          input.roomSessionId,
        );
        if (current.current_beat_id !== "guided_beat_combat_001") return false;
        const currentActor =
          current.mechanical.payload.combat?.participants.find(
            ({ actor_id }) => actor_id === actor.actor_id,
          );
        return slot === "maneuver" || slot === "move"
          ? currentActor?.maneuver_available
          : currentActor?.action_available;
      })
      .toBe(false);
    if (recordsFlavor)
      await expect
        .poll(async () =>
          JSON.stringify(
            (await currentPublicView(input.request, input.roomSessionId))
              .recent_public_events,
          ),
        )
        .toContain("Mara locks the spillway tooth");
  }
  const stalled = (await currentPublicView(input.request, input.roomSessionId))
    .mechanical.payload.combat;
  throw new Error(
    `Objective victory exceeded the bounded browser step limit: ${JSON.stringify(
      stalled?.participants.map((participant) => ({
        actor_id: participant.actor_id,
        side: participant.side,
        guard: participant.guard?.current,
        zone_id: participant.zone_id,
      })),
    )}`,
  );
}

test("TV startup is explicit and browser-first joining needs no install", async ({
  browser,
}) => {
  const tvContext = await browser.newContext();
  const tv = await tvContext.newPage();
  await tv.route("**/api/tv/startup", async (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "ready", resumable_rooms: [] }),
    }),
  );
  await tv.goto("/tv");
  await expect(
    tv.getByRole("heading", { name: "Begin or resume at the TV" }),
  ).toBeVisible();
  await expect(
    tv.getByRole("button", { name: "New room · 3–5 players" }),
  ).toBeVisible();
  await expect(
    tv.getByRole("button", { name: "Two-player rehearsal" }),
  ).toBeVisible();

  const playerContext = await browser.newContext();
  const player = await playerContext.newPage();
  await player.goto(
    "/room/room_browser_first_phase2_001#invite=invite-browser-first-phase2",
  );
  await expect(
    player.getByRole("heading", { name: "Join the table" }),
  ).toBeVisible();
  await expect(
    player.getByRole("button", { name: "Join and wait for approval" }),
  ).toBeVisible();
  await expect(
    player.getByText("Phones use the HTTPS relay only"),
  ).toBeVisible();
  await tvContext.close();
  await playerContext.close();
});

for (const partySize of [3, 4, 5] as const) {
  test(`${partySize} isolated player contexts keep reconnect storage and network scope separate`, async ({
    browser,
  }) => {
    const contexts = await Promise.all(
      Array.from({ length: partySize }, () => browser.newContext()),
    );
    try {
      const observations = await Promise.all(
        contexts.map(async (context, index) => {
          const requests: string[] = [];
          const page = await context.newPage();
          page.on("request", (request) => requests.push(request.url()));
          await page.goto(
            `/room/room_party_${partySize}_phase2#invite=invite-party-${partySize}`,
          );
          await page.getByLabel("Your table name").fill(`Player ${index + 1}`);
          await expect(page.getByLabel("Your table name")).toHaveValue(
            `Player ${index + 1}`,
          );
          await page.evaluate(
            async ({ roomId, participant }) => {
              const database = await new Promise<IDBDatabase>(
                (resolve, reject) => {
                  const request = indexedDB.open("lldm-reconnect-v1", 1);
                  request.onupgradeneeded = () =>
                    request.result.createObjectStore("rooms", {
                      keyPath: "room_id",
                    });
                  request.onsuccess = () => resolve(request.result);
                  request.onerror = () => reject(request.error);
                },
              );
              await new Promise<void>((resolve, reject) => {
                const transaction = database.transaction("rooms", "readwrite");
                transaction.objectStore("rooms").put({
                  room_id: roomId,
                  participant_id: participant,
                  connection_id: `connection_${participant}`,
                  reconnect_token: `token-${participant}-phase2`,
                  expires_at: "2099-08-07T00:00:00.000Z",
                  view_revision: 0,
                });
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
              });
            },
            {
              roomId: `room_party_${partySize}_phase2`,
              participant: `participant_party_${partySize}_${index + 1}`,
            },
          );
          const storedParticipant = await page.evaluate(async (roomId) => {
            const database = await new Promise<IDBDatabase>(
              (resolve, reject) => {
                const request = indexedDB.open("lldm-reconnect-v1", 1);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              },
            );
            return await new Promise<string>((resolve, reject) => {
              const request = database
                .transaction("rooms")
                .objectStore("rooms")
                .get(roomId);
              request.onsuccess = () =>
                resolve(
                  (request.result as { participant_id: string }).participant_id,
                );
              request.onerror = () => reject(request.error);
            });
          }, `room_party_${partySize}_phase2`);
          return { requests, storedParticipant };
        }),
      );
      expect(
        new Set(observations.map(({ storedParticipant }) => storedParticipant))
          .size,
      ).toBe(partySize);
      for (const { requests } of observations) {
        expect(
          requests.some((url) =>
            /:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url),
          ),
        ).toBe(false);
        expect(requests.some((url) => new URL(url).port === "3210")).toBe(
          false,
        );
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
}

for (const partySize of [3, 4, 5] as const) {
  test(`live ${partySize}-participant UI room reaches its authored terminal conclusion`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    const tvContext = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const tv = await tvContext.newPage();
    const { contexts, pages } = await openPlayerContexts(
      browser,
      partySize,
      partySize,
    );
    const playerRequests = pages.map(() => [] as string[]);
    pages.forEach((page, index) => {
      page.on("request", (seen) => playerRequests[index]?.push(seen.url()));
    });
    try {
      const room = await createRoomFromTv(
        tv,
        "normal",
        partySize === 3 ? "00".repeat(32) : undefined,
      );
      const host = pages[0];
      if (host === undefined) throw new Error("Player-host page is missing.");
      const heroIndexes =
        partySize === 3
          ? ([0, 3, 4] as const)
          : Array.from({ length: partySize }, (_, index) => index);
      await bootstrapHost(host, room);
      await claimHero(host, heroNames[heroIndexes[0]]);
      await expect(
        host.getByRole("heading", { name: "Choose a hero" }),
      ).toHaveCount(0);
      await host.getByText("Player-host controls").click();

      for (let index = 1; index < partySize; index += 1) {
        const player = pages[index];
        const heroIndex = heroIndexes[index];
        const heroName =
          heroIndex === undefined ? undefined : heroNames[heroIndex];
        if (player === undefined || heroName === undefined)
          throw new Error("Expected player context or starter is missing.");
        const displayName = `Player ${index + 1}`;
        await joinPending(player, room, displayName);
        const pending = host.locator(".host-row", { hasText: displayName });
        await expect(pending).toBeVisible();
        await pending.getByRole("button", { name: "Approve" }).click();
        try {
          await expect(
            player.getByRole("heading", { name: "Choose a hero" }),
          ).toBeVisible({ timeout: 10_000 });
        } catch {
          throw new Error(
            `Player ${index + 1} did not receive approval. Player view: ${await player.locator("body").innerText()} Host view: ${await host.locator("body").innerText()}`,
          );
        }
        await claimHero(player, heroName);
      }

      if (partySize === 3) {
        const secondPlayer = pages[1];
        if (secondPlayer === undefined)
          throw new Error("Host-transfer player context is missing.");
        const hostDrawer = host.locator("details.host-drawer");
        if (
          !(await hostDrawer.evaluate((element) =>
            element.hasAttribute("open"),
          ))
        )
          await host.getByText("Player-host controls").click();
        await host
          .getByRole("button", { name: "Transfer host to Player 2" })
          .click();
        await expect(
          secondPlayer.getByText("Player-host controls"),
        ).toBeVisible();
        await expect(host.getByText("Player-host controls")).toHaveCount(0);
        await expect(
          tv.locator(".room-roster", { hasText: "★ Player 2" }),
        ).toBeVisible();

        await tv
          .getByRole("button", { name: "Show one-use host recovery code" })
          .click();
        const recoveryProof = await tv
          .locator(".local-recovery strong")
          .textContent();
        expect(recoveryProof).not.toBeNull();
        await host.getByText("Recover player-host from TV code").click();
        await host
          .getByLabel("One-use recovery proof")
          .fill(recoveryProof ?? "");
        await host
          .getByRole("button", { name: "Confirm host recovery" })
          .click();
        await expect(host.getByText("Player-host controls")).toBeVisible();
        await expect(
          secondPlayer.getByText("Player-host controls"),
        ).toHaveCount(0);
        await secondPlayer
          .getByText("Recover player-host from TV code")
          .click();
        await secondPlayer
          .getByLabel("One-use recovery proof")
          .fill(recoveryProof ?? "");
        await secondPlayer
          .getByRole("button", { name: "Confirm host recovery" })
          .click();
        await expect(secondPlayer.locator(".result.rejected")).toBeVisible();
      }

      await expect(tv.locator(".room-roster span")).toHaveCount(partySize);
      if (!(await host.getByRole("button", { name: "Start run" }).isVisible()))
        await host.getByText("Player-host controls").click();
      await host.getByRole("button", { name: "Start run" }).click();
      await expect(
        host.getByText("The claimed party is materialized", { exact: false }),
      ).toBeVisible();
      await host
        .getByRole("button", { name: /^Enter through the controls/ })
        .click();

      await expect(
        host.getByText(privateClues[0], { exact: false }),
      ).toBeVisible();
      const secondPlayer = pages[1];
      if (secondPlayer === undefined)
        throw new Error("Second player context is missing.");
      await expect(
        secondPlayer.getByText(privateClues[heroIndexes[1]], { exact: false }),
      ).toBeVisible();
      await expect(tv.getByText(privateClues[0], { exact: false })).toHaveCount(
        0,
      );
      await expect(
        tv.getByText(privateClues[heroIndexes[1]], { exact: false }),
      ).toHaveCount(0);
      await expect(
        host.getByText(privateClues[heroIndexes[1]], { exact: false }),
      ).toHaveCount(0);
      await expect(
        secondPlayer.getByText(privateClues[0], { exact: false }),
      ).toHaveCount(0);

      const participantIds: string[] = [];
      for (const page of pages) {
        await storedParticipantId(page, room.relay_room_id);
        const stored = await page.evaluate(async (roomId) => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const open = indexedDB.open("lldm-reconnect-v1", 1);
            open.onsuccess = () => resolve(open.result);
            open.onerror = () => reject(open.error);
          });
          return await new Promise<Record<string, unknown>>(
            (resolve, reject) => {
              const read = database
                .transaction("rooms")
                .objectStore("rooms")
                .get(roomId);
              read.onsuccess = () =>
                resolve(read.result as Record<string, unknown>);
              read.onerror = () => reject(read.error);
            },
          );
        }, room.relay_room_id);
        participantIds.push(String(stored.participant_id));
        expect(JSON.stringify(stored)).not.toContain("maintenance crawl");
        expect(JSON.stringify(stored)).not.toContain("strain lines");
      }
      expect(new Set(participantIds).size).toBe(partySize);

      if (partySize === 3) {
        await host
          .getByRole("button", { name: "Spend Spark and roll" })
          .click();
        await expect(
          tv.getByRole("heading", { name: "Pivotal physical d20" }),
        ).toBeVisible();
        const pendingBeforeReload = await currentPublicView(
          request,
          room.room_session_id,
        );
        const pendingDisclosure = JSON.stringify(
          pendingBeforeReload.mechanical.payload.pending_rolls[0],
        );
        expect(pendingDisclosure).not.toBeUndefined();
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Enter the physical die" }),
        ).toBeVisible({ timeout: 10_000 });
        const pendingAfterReload = await currentPublicView(
          request,
          room.room_session_id,
        );
        expect(
          JSON.stringify(
            pendingAfterReload.mechanical.payload.pending_rolls[0],
          ),
        ).toBe(pendingDisclosure);
        await host.getByRole("button", { name: "20", exact: true }).click();
        await host.getByRole("button", { name: "Submit final die" }).click();
        await expect(
          host.getByRole("heading", { name: "Enter the physical die" }),
        ).toHaveCount(0);
      } else {
        await host.getByRole("button", { name: "Keep it simulated" }).click();
      }
      const challengeOption = host.getByRole("button", {
        name: /^Find the maintenance route/,
      });
      await expect(challengeOption).toBeVisible({ timeout: 10_000 });
      await challengeOption.click();
      const ritualOption = host.getByRole("button", {
        name: /^Reverse the current/,
      });
      try {
        await expect(ritualOption).toBeVisible({ timeout: 10_000 });
      } catch {
        const diagnosticView = await currentPublicView(
          request,
          room.room_session_id,
        );
        throw new Error(
          `Ritual option did not arrive from ${diagnosticView.current_beat_id}. Host view: ${await host.locator("body").innerText()}`,
        );
      }
      await ritualOption.click();
      await expect(
        tv.getByRole("heading", {
          name: "The Bellmaw Custodian wakes",
          exact: false,
        }),
      ).toBeVisible({ timeout: 10_000 });
      const combatView = await currentPublicView(request, room.room_session_id);
      expect(combatView.current_beat_id).toBe("guided_beat_combat_001");
      expect(combatView.mechanical.payload.combat?.combat_id).toBe(
        `combat_floodgate_party_${partySize}_001`,
      );
      expect(combatView.mechanical.payload.combat?.participants).toHaveLength(
        partySize + 2,
      );
      expect(combatView.map_layout).not.toBeNull();
      if (partySize === 3) {
        await tv.getByText("Recent public events").click();
        await expect(
          tv.getByText(
            "The party reaches the inner works, but the failed approach leaves the lower causeway flooding behind them.",
          ),
        ).toBeVisible();
      }

      if (partySize === 3) {
        await host.getByRole("button", { name: "Take the Lead" }).click();
        await expect
          .poll(
            async () =>
              (await currentPublicView(request, room.room_session_id))
                .mechanical.payload.combat?.active_actor_id ?? null,
          )
          .not.toBeNull();
        const activeActorId = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.active_actor_id;
        expect(activeActorId).not.toBeNull();
        await host
          .getByRole("button", { name: "pass action", exact: false })
          .click();
        await host.getByRole("button", { name: "Confirm action" }).click();
        await expect
          .poll(async () => {
            const combat = (
              await currentPublicView(request, room.room_session_id)
            ).mechanical.payload.combat;
            return combat?.participants.find(
              ({ actor_id }) => actor_id === activeActorId,
            )?.action_available;
          })
          .toBe(false);
        await secondPlayer
          .getByRole("button", { name: "Request a correction" })
          .click();
        const hostDrawer = host.locator("details.host-drawer");
        if (
          !(await hostDrawer.evaluate((element) =>
            element.hasAttribute("open"),
          ))
        )
          await host.getByText("Player-host controls").click();
        await host
          .getByRole("button", { name: "Confirm eligible undo" })
          .click();
        await expect
          .poll(async () => {
            const current = await currentPublicView(
              request,
              room.room_session_id,
            );
            const combat = current.mechanical.payload.combat;
            const active = combat?.participants.find(
              ({ actor_id }) => actor_id === activeActorId,
            );
            return {
              active_actor_id: combat?.active_actor_id,
              action_available: active?.action_available,
              view_revision: current.view_revision,
            };
          })
          .toMatchObject({
            active_actor_id: activeActorId,
            action_available: true,
          });
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Your legal choices" }),
        ).toBeVisible({ timeout: 10_000 });
      }

      if (partySize === 4) {
        const mechanicsBeforeCrashRecovery = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical_revision;
        const injectBeforeGame = await request.post(
          `${harnessControlOrigin}/host/inject-workflow-crash?boundary=after_room_start`,
        );
        expect(injectBeforeGame.status()).toBe(200);
        await host.getByRole("button", { name: "Take the Lead" }).click();
        await expect
          .poll(async () => {
            const response = await request.get(
              `${harnessControlOrigin}/host/pending-workflows`,
            );
            return (await response.json()) as { pending_workflows: number };
          })
          .toEqual({ pending_workflows: 1 });
        expect(
          (await request.post(`${harnessControlOrigin}/host/restart`)).status(),
        ).toBe(200);
        const recoveredBeforeGame = await request.post(
          `${hostOrigin}/api/tv/rooms/${encodeURIComponent(room.room_session_id)}/resume`,
        );
        expect(recoveredBeforeGame.status()).toBe(200);
        await expect(recoveredBeforeGame.json()).resolves.toMatchObject({
          recovered_workflows: 1,
        });
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Your legal choices" }),
        ).toBeVisible({ timeout: 15_000 });
        const activeBeforeReload = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.active_actor_id;
        expect(activeBeforeReload).not.toBeNull();
        expect(
          (await currentPublicView(request, room.room_session_id))
            .mechanical_revision,
        ).toBeGreaterThan(mechanicsBeforeCrashRecovery);

        const injectAfterGame = await request.post(
          `${harnessControlOrigin}/host/inject-workflow-crash?boundary=after_game_commit`,
        );
        expect(injectAfterGame.status()).toBe(200);
        await host
          .getByRole("button", { name: "pass action", exact: false })
          .click();
        await host.getByRole("button", { name: "Confirm action" }).click();
        await expect
          .poll(async () => {
            const response = await request.get(
              `${harnessControlOrigin}/host/pending-workflows`,
            );
            return (await response.json()) as { pending_workflows: number };
          })
          .toEqual({ pending_workflows: 1 });
        expect(
          (await request.post(`${harnessControlOrigin}/host/restart`)).status(),
        ).toBe(200);
        const recoveredAfterGame = await request.post(
          `${hostOrigin}/api/tv/rooms/${encodeURIComponent(room.room_session_id)}/resume`,
        );
        expect(recoveredAfterGame.status()).toBe(200);
        await expect(recoveredAfterGame.json()).resolves.toMatchObject({
          recovered_workflows: 1,
        });
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Your legal choices" }),
        ).toBeVisible({ timeout: 15_000 });
        expect(
          (await currentPublicView(request, room.room_session_id)).mechanical
            .payload.combat?.active_actor_id,
        ).toBe(activeBeforeReload);
        expect(
          (
            await currentPublicView(request, room.room_session_id)
          ).mechanical.payload.combat?.participants.find(
            ({ actor_id }) => actor_id === activeBeforeReload,
          )?.action_available,
        ).toBe(false);
        const mechanicalRevisionBeforeRelayRestart = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical_revision;
        const restartedRelay = await request.post(
          `${harnessControlOrigin}/relay/restart`,
        );
        expect(restartedRelay.status()).toBe(200);
        const restartedHostForRelay = await request.post(
          `${harnessControlOrigin}/host/restart`,
        );
        expect(restartedHostForRelay.status()).toBe(200);
        const resumedAfterRelay = await request.post(
          `${hostOrigin}/api/tv/rooms/${encodeURIComponent(room.room_session_id)}/resume`,
        );
        expect(resumedAfterRelay.status()).toBe(200);
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Your legal choices" }),
        ).toBeVisible({ timeout: 15_000 });
        expect(
          (await currentPublicView(request, room.room_session_id))
            .mechanical_revision,
        ).toBe(mechanicalRevisionBeforeRelayRestart);
      }

      if (partySize === 5) {
        const firstClaim = host.getByRole("button", { name: "Take the Lead" });
        const secondClaim = secondPlayer.getByRole("button", {
          name: "Take the Lead",
        });
        await Promise.all([firstClaim.click(), secondClaim.click()]);
        await expect
          .poll(
            async () =>
              await Promise.all(
                [host, secondPlayer].map(async (page) =>
                  page
                    .getByRole("heading", { name: "Your legal choices" })
                    .isVisible(),
                ),
              ).then((visible) => visible.filter(Boolean).length),
            { timeout: 10_000 },
          )
          .toBe(1);
        const activePage = (await host
          .getByRole("heading", { name: "Your legal choices" })
          .isVisible())
          ? host
          : secondPlayer;
        const inactivePage = activePage === host ? secondPlayer : host;
        await expect(inactivePage.locator(".result.rejected")).toBeVisible();

        const draftPass = activePage
          .locator(".action-list button", { hasText: "pass" })
          .first();
        await draftPass.click();
        await expect(
          activePage.getByRole("heading", { name: "Confirm pass" }),
        ).toBeVisible();
        await inactivePage
          .getByRole("button", { name: "Request a correction" })
          .click();
        await expect(
          activePage.getByRole("heading", { name: "Confirm pass" }),
        ).toHaveCount(0);
        const hostDrawerForCorrection = host.locator("details.host-drawer");
        if (
          !(await hostDrawerForCorrection.evaluate((element) =>
            element.hasAttribute("open"),
          ))
        )
          await host.getByText("Player-host controls").click();
        await host.getByRole("button", { name: "Keep current state" }).click();
        const correctionRevision = (
          await currentPublicView(request, room.room_session_id)
        ).view_revision;
        await expect
          .poll(() => storedViewRevision(activePage, room.relay_room_id))
          .toBeGreaterThanOrEqual(correctionRevision);

        const activeActorId = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.active_actor_id;
        expect(activeActorId).not.toBeNull();
        for (const slot of ["action", "maneuver"] as const) {
          const pass = activePage.getByRole("button", {
            name: new RegExp(`^pass ${slot}`),
          });
          await expect(pass).toBeVisible({ timeout: 10_000 });
          await pass.click();
          await activePage
            .getByRole("button", { name: "Confirm action" })
            .click();
          await expect
            .poll(async () => {
              const combat = (
                await currentPublicView(request, room.room_session_id)
              ).mechanical.payload.combat;
              const actor = combat?.participants.find(
                ({ actor_id }) => actor_id === activeActorId,
              );
              return slot === "action"
                ? actor?.action_available
                : actor?.maneuver_available;
            })
            .toBe(false);
        }
        for (let activation = 0; activation < 3; activation += 1) {
          const window = (
            await currentPublicView(request, room.room_session_id)
          ).mechanical.payload.combat?.reaction_window;
          if (window !== null && window !== undefined) break;
          await expect
            .poll(
              async () =>
                await Promise.all(
                  pages.map((page) =>
                    page
                      .getByRole("button", { name: "Take the Lead" })
                      .isVisible(),
                  ),
                ).then((visible) => visible.filter(Boolean).length),
              { timeout: 10_000 },
            )
            .toBeGreaterThan(0);
          let nextActivePage: Page | undefined;
          for (const page of pages)
            if (
              await page
                .getByRole("button", { name: "Take the Lead" })
                .isVisible()
            ) {
              nextActivePage = page;
              break;
            }
          if (nextActivePage === undefined)
            throw new Error("A legal hero activation was not projected.");
          await nextActivePage
            .getByRole("button", { name: "Take the Lead" })
            .click();
          await expect(
            nextActivePage.getByRole("heading", {
              name: "Your legal choices",
            }),
          ).toBeVisible();
          const actorId = (
            await currentPublicView(request, room.room_session_id)
          ).mechanical.payload.combat?.active_actor_id;
          expect(actorId).not.toBeNull();
          for (const slot of ["action", "maneuver"] as const) {
            await nextActivePage
              .getByRole("button", { name: new RegExp(`^pass ${slot}`) })
              .click();
            await nextActivePage
              .getByRole("button", { name: "Confirm action" })
              .click();
            await expect
              .poll(async () => {
                const combat = (
                  await currentPublicView(request, room.room_session_id)
                ).mechanical.payload.combat;
                const actor = combat?.participants.find(
                  ({ actor_id }) => actor_id === actorId,
                );
                return slot === "action"
                  ? actor?.action_available
                  : actor?.maneuver_available;
              })
              .toBe(false);
          }
        }
        await expect
          .poll(
            async () =>
              (await currentPublicView(request, room.room_session_id))
                .mechanical.payload.combat?.reaction_window
                ?.reaction_window_id ?? null,
            { timeout: 10_000 },
          )
          .not.toBeNull();
        let deadlinePage: Page | undefined;
        for (const page of pages)
          if (
            await page
              .getByRole("heading", { name: "Reaction window" })
              .isVisible()
          ) {
            deadlinePage = page;
            break;
          }
        if (deadlinePage === undefined)
          throw new Error("The addressed reaction prompt was not delivered.");
        await expect(deadlinePage.getByText(/^Deadline /)).toBeVisible();
        const timedReaction = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.reaction_window;
        const timedResponder = timedReaction?.eligible_actor_ids[0];
        expect(timedResponder).toBeDefined();
        await expect
          .poll(
            async () => {
              const window = (
                await currentPublicView(request, room.room_session_id)
              ).mechanical.payload.combat?.reaction_window;
              return window === null || window === undefined
                ? null
                : `${window.reaction_window_id}:${window.eligible_actor_ids[0]}`;
            },
            { timeout: 15_000, intervals: [500] },
          )
          .not.toBe(`${timedReaction?.reaction_window_id}:${timedResponder}`);
        const pausedReaction = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.reaction_window;
        const pausedResponderIndex = heroActorIds.indexOf(
          pausedReaction
            ?.eligible_actor_ids[0] as (typeof heroActorIds)[number],
        );
        const pausedContext = contexts[pausedResponderIndex];
        const pausedPage = pages[pausedResponderIndex];
        if (
          pausedReaction === null ||
          pausedReaction === undefined ||
          pausedContext === undefined ||
          pausedPage === undefined
        )
          throw new Error("A reaction responder was unavailable for recovery.");
        const pausedKey = `${pausedReaction.reaction_window_id}:${pausedReaction.eligible_actor_ids[0]}`;
        await pausedPage.close();
        await expect(
          tv.getByText(
            "An active player is reconnecting; their spotlight remains reserved.",
          ),
        ).toBeVisible({ timeout: 10_000 });
        await tv.waitForTimeout(11_000);
        const stillPaused = (
          await currentPublicView(request, room.room_session_id)
        ).mechanical.payload.combat?.reaction_window;
        expect(
          `${stillPaused?.reaction_window_id}:${stillPaused?.eligible_actor_ids[0]}`,
        ).toBe(pausedKey);
        const reconnectedPage = await pausedContext.newPage();
        pages[pausedResponderIndex] = reconnectedPage;
        await reconnectedPage.goto(room.join_url);
        await expect(
          reconnectedPage.getByRole("heading", { name: "Reaction window" }),
        ).toBeVisible({ timeout: 10_000 });
        await expect(
          tv.getByText(
            "An active player is reconnecting; their spotlight remains reserved.",
          ),
        ).toHaveCount(0, { timeout: 10_000 });
        await reconnectedPage.getByRole("button", { name: "Pass" }).click();
        await expect
          .poll(async () => {
            const window = (
              await currentPublicView(request, room.room_session_id)
            ).mechanical.payload.combat?.reaction_window;
            return window === null || window === undefined
              ? null
              : `${window.reaction_window_id}:${window.eligible_actor_ids[0]}`;
          })
          .not.toBe(pausedKey);
        for (let reaction = 0; reaction < 4; reaction += 1) {
          const windowBefore = (
            await currentPublicView(request, room.room_session_id)
          ).mechanical.payload.combat?.reaction_window;
          if (windowBefore === null || windowBefore === undefined) break;
          const before = `${windowBefore.reaction_window_id}:${windowBefore.eligible_actor_ids[0]}`;
          const responderIndex = heroActorIds.indexOf(
            windowBefore.eligible_actor_ids[0] as (typeof heroActorIds)[number],
          );
          const reactingPage = pages[responderIndex];
          if (reactingPage === undefined) break;
          await expect(
            reactingPage.getByRole("heading", { name: "Reaction window" }),
          ).toBeVisible();
          for (const [index, page] of pages.entries())
            if (index !== responderIndex)
              await expect(
                page.getByRole("heading", { name: "Reaction window" }),
              ).toHaveCount(0);
          await reactingPage.getByRole("button", { name: "Pass" }).click();
          await expect
            .poll(async () => {
              const window = (
                await currentPublicView(request, room.room_session_id)
              ).mechanical.payload.combat?.reaction_window;
              return window === null || window === undefined
                ? null
                : `${window.reaction_window_id}:${window.eligible_actor_ids[0]}`;
            })
            .not.toBe(before);
        }
      }

      if (partySize === 3) {
        await driveObjectiveVictory({
          pages,
          actorIds: heroIndexes.map((index) => heroActorIds[index]),
          request,
          roomSessionId: room.room_session_id,
          relayRoomId: room.relay_room_id,
        });
        await expect(
          tv.getByRole("heading", {
            name: /one hero must set the final locking tooth/,
          }),
        ).toBeVisible({ timeout: 10_000 });
        const mandatory = await currentPublicView(
          request,
          room.room_session_id,
        );
        expect(mandatory.current_beat_id).toBe("guided_beat_physical_001");
        expect(mandatory.mechanical.payload.pending_rolls).toHaveLength(1);
        await host.reload();
        await expect(
          host.getByRole("heading", { name: "Enter the physical die" }),
        ).toBeVisible({ timeout: 10_000 });
        await host.getByRole("button", { name: "5", exact: true }).click();
        await expect(
          host.getByRole("button", { name: "5", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await host.getByRole("button", { name: "20", exact: true }).click();
        await expect(
          host.getByRole("button", { name: "20", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await host.getByRole("button", { name: "Submit final die" }).click();
        await expect(
          tv.getByText("The lock seats cleanly", { exact: false }),
        ).toBeVisible({ timeout: 10_000 });

        await host
          .getByRole("button", { name: "Request a correction" })
          .click();
        await expect(host.locator(".result.rejected")).toBeVisible();
        await expect(
          host.getByRole("button", { name: "Confirm eligible undo" }),
        ).toHaveCount(0);
        const finalView = await currentPublicView(
          request,
          room.room_session_id,
        );
        expect(finalView.room_status).toBe("completed");
        expect(finalView.current_beat_id).toBe(
          "guided_beat_conclusion_success_001",
        );
      } else {
        const hostDrawer = host.locator("details.host-drawer");
        if (
          !(await hostDrawer.evaluate((element) =>
            element.hasAttribute("open"),
          ))
        )
          await host.getByText("Player-host controls").click();
        await host
          .getByRole("button", { name: "Confirm party withdrawal" })
          .click();
        await expect(
          tv.getByRole("heading", {
            name: "The party withdraws with the trapped crew",
            exact: false,
          }),
        ).toBeVisible({ timeout: 10_000 });
        const finalView = await currentPublicView(
          request,
          room.room_session_id,
        );
        expect(finalView.room_status).toBe("completed");
        expect(finalView.current_beat_id).toBe(
          "guided_beat_conclusion_withdrawal_001",
        );
      }

      for (const requests of playerRequests) {
        expect(requests.some((url) => new URL(url).port === "3210")).toBe(
          false,
        );
        expect(
          requests
            .filter((url) => /^(?:http|ws)s?:/.test(url))
            .every((url) => new URL(url).origin === "http://127.0.0.1:8787"),
        ).toBe(true);
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
      await tvContext.close();
    }
  });
}

test("two-player rehearsal exposes multi-seat assignment while normal mode does not", async ({
  browser,
}) => {
  test.setTimeout(45_000);
  const tvContext = await browser.newContext();
  const tv = await tvContext.newPage();
  const { contexts, pages } = await openPlayerContexts(browser, 2, 200);
  try {
    const room = await createRoomFromTv(tv, "rehearsal");
    const host = pages[0];
    const second = pages[1];
    if (host === undefined || second === undefined)
      throw new Error("Rehearsal player pages are missing.");
    await bootstrapHost(host, room);
    await claimHero(host, "Mara Venn");
    await expect(
      host.getByRole("heading", { name: "Choose a hero" }),
    ).toBeVisible();
    await claimHero(host, "Sable Reed");
    await expect(
      host.getByRole("navigation", { name: "Your rehearsal heroes" }),
    ).toBeVisible();
    await host.getByText("Player-host controls").click();
    await joinPending(second, room, "Rehearsal Partner");
    const pending = host.locator(".host-row", { hasText: "Rehearsal Partner" });
    await expect(pending).toBeVisible();
    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(
      second.getByRole("heading", { name: "Choose a hero" }),
    ).toBeVisible();
    await claimHero(second, "Ilyra Quill");
    await expect(tv.locator(".room-roster span")).toHaveCount(2);
    await host.getByRole("button", { name: "Start run" }).click();
    await expect(
      host.locator(".result.accepted", {
        hasText: "The claimed party is materialized",
      }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await tvContext.close();
  }
});

test("simultaneous hero claims commit one seat owner and return the loser to the roster", async ({
  browser,
}) => {
  test.setTimeout(45_000);
  const tvContext = await browser.newContext();
  const tv = await tvContext.newPage();
  const { contexts, pages } = await openPlayerContexts(browser, 2, 201);
  try {
    const room = await createRoomFromTv(tv, "normal");
    const host = pages[0];
    const challenger = pages[1];
    if (host === undefined || challenger === undefined)
      throw new Error("Hero-claim race pages are missing.");
    await bootstrapHost(host, room);
    await host.getByText("Player-host controls").click();
    await joinPending(challenger, room, "Claim Challenger");
    const pending = host.locator(".host-row", { hasText: "Claim Challenger" });
    await expect(pending).toBeVisible();
    await pending.getByRole("button", { name: "Approve" }).click();
    await expect(
      challenger.getByRole("heading", { name: "Choose a hero" }),
    ).toBeVisible();

    await Promise.all([
      host.getByRole("button", { name: "Claim Mara Venn" }).click(),
      challenger.getByRole("button", { name: "Claim Mara Venn" }).click(),
    ]);
    await expect
      .poll(
        async () =>
          await Promise.all(
            [host, challenger].map((page) =>
              page.getByRole("heading", { name: "Mara Venn" }).isVisible(),
            ),
          ).then((visible) => visible.filter(Boolean).length),
        { timeout: 10_000 },
      )
      .toBe(1);
    const loser = (await host
      .getByRole("heading", { name: "Mara Venn" })
      .isVisible())
      ? challenger
      : host;
    await expect(loser.locator(".result.rejected")).toBeVisible();
    await expect(
      loser.getByRole("heading", { name: "Choose a hero" }),
    ).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await tvContext.close();
  }
});

test("host restart requires explicit replay verification before resuming the saved room", async ({
  browser,
  request,
}) => {
  test.setTimeout(45_000);
  const firstTvContext = await browser.newContext();
  const firstTv = await firstTvContext.newPage();
  const room = await createRoomFromTv(firstTv, "normal");
  const before = await currentPublicView(request, room.room_session_id);
  await firstTvContext.close();

  const restartedHost = await request.post(
    `${harnessControlOrigin}/host/restart`,
  );
  expect(restartedHost.status()).toBe(200);

  const resumedTvContext = await browser.newContext();
  const resumedTv = await resumedTvContext.newPage();
  try {
    await resumedTv.goto(`${hostOrigin}/tv`);
    await expect(
      resumedTv.getByRole("heading", { name: "Begin or resume at the TV" }),
    ).toBeVisible();
    await resumedTv
      .getByRole("button", { name: "Resume Last Session" })
      .first()
      .click();
    await expect(
      resumedTv.getByRole("heading", { name: "Join on your phone" }),
    ).toBeVisible({ timeout: 10_000 });
    expect(
      await resumedTv.evaluate(() => sessionStorage.getItem("lldm-tv-room")),
    ).toBe(room.room_session_id);
    const after = await currentPublicView(request, room.room_session_id);
    expect(after.room_revision).toBe(before.room_revision);
    expect(after.mechanical_revision).toBe(before.mechanical_revision);
  } finally {
    await resumedTvContext.close();
  }
});
