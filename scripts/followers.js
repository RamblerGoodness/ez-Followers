const MODULE_ID = "ez-followers-wrfp4e";
const TAB_ID = "followers";
const TAB_GROUP = "primary";
const DEFAULT_ACTIVE_TAB = "main";
const FOLLOWERS_FLAG = "followers";
const UP_IN_ARMS_ITEM_PACK = "wfrp4e-up-in-arms.items";
const HIRELING_ITEM_NAME = "Hireling";
const HENCHMAN = "henchman";
const HIRELING = "hireling";
const HIRELING_FIELDS = new Set([
  "profile",
  "type",
  "template",
  "physicalQuirk",
  "workEthic",
  "personalityQuirk",
  "terms",
  "contract",
  "endeavours",
  "requirements",
  "reliability",
  "status",
  "notes"
]);
const xpPropagationSuppressedActors = new Set();

Hooks.once("ready", () => {
  registerFollowerTabFeatures();
});

function registerFollowerTabFeatures() {
  registerFollowerDropListeners();
  registerFollowerActionListeners();
  registerExperiencePropagation();
}

function warn(...args) {
  console.warn(`${MODULE_ID} |`, ...args);
}

function error(...args) {
  console.error(`${MODULE_ID} |`, ...args);
}

Hooks.on("renderApplicationV2", (app) => {
  try {
    const actor = app?.actor ?? app?.document ?? null;
    if (!actor) return;
    if (actor.documentName !== "Actor") return;
    if (actor.type !== "character") return;
    const Sheet = getWfrp4eCharacterSheetClass();
    if (!Sheet) return;
    if (!(app instanceof Sheet)) return;

    if (!Sheet._ezFollowersPatched) {
      patchSheetClass(Sheet);
      Sheet._ezFollowersPatched = true;

      if (!app._ezFollowersRerendered) {
        app._ezFollowersRerendered = true;
        app.render(true);
      }
    }

    activateSheetFollowerDrop(app);
    activateFollowerTab(app);
  } catch (err) {
    error("renderApplicationV2 patch failed", err);
  }
});

function patchSheetClass(Sheet) {
  patchTabs(Sheet);
  patchParts(Sheet);
  patchTabGroups(Sheet);
  patchPrepareTabs(Sheet);
  patchPrepareContext(Sheet);
  patchPreparePartContext(Sheet);
}

function getWfrp4eCharacterSheetClass() {
  return game.wfrp4e?.apps?.ActorSheetWFRP4eCharacter ?? null;
}

function patchTabs(Sheet) {
  const tabs = foundry.utils.deepClone(Sheet.TABS ?? {});
  let changed = false;

  if (!tabs[TAB_ID]) {
    tabs[TAB_ID] = {
      id: TAB_ID,
      group: TAB_GROUP,
      label: "Followers"
    };
    changed = true;
  }

  for (const [key, value] of Object.entries(tabs)) {
    if (!Array.isArray(value?.tabs)) continue;

    const exists = value.tabs.some(tab => tab?.id === TAB_ID);
    if (exists) continue;

    value.tabs = [
      ...value.tabs,
      {
        id: TAB_ID,
        label: "Followers",
        icon: "fa-solid fa-users"
      }
    ];
    changed = true;
  }

  if (changed) {
    Sheet.TABS = tabs;
  }
}

function patchParts(Sheet) {
  const parts = foundry.utils.deepClone(Sheet.PARTS ?? {});

  if (parts[TAB_ID]) {
    return;
  }

  parts[TAB_ID] = {
    template: `modules/${MODULE_ID}/templates/followers-tab.hbs`
  };

  Sheet.PARTS = parts;
}

function patchTabGroups(Sheet) {
  const current = Sheet.prototype.tabGroups ?? {};

  if (current[TAB_GROUP] != null) {
    return;
  }

  Sheet.prototype.tabGroups = {
    ...current,
    [TAB_GROUP]: DEFAULT_ACTIVE_TAB
  };
}

function patchPrepareTabs(Sheet) {
  if (Sheet.prototype._ezFollowersPrepareTabsPatched) return;

  const original = typeof Sheet.prototype._prepareTabs === "function"
    ? Sheet.prototype._prepareTabs
    : function () { return foundry.utils.deepClone(this.constructor.TABS ?? {}); };

  Sheet.prototype._prepareTabs = function(options) {
    const tabs = original.call(this, options);
    if (!hasFollowers(this.document)) {
      delete tabs[TAB_ID];
    }
    return tabs;
  };

  Sheet.prototype._ezFollowersPrepareTabsPatched = true;
}

function hasFollowers(actor) {
  return getStoredFollowers(actor).length > 0;
}

function patchPrepareContext(Sheet) {
  if (Sheet.prototype._ezFollowersPrepareContextPatched) return;

  const original = typeof Sheet.prototype._prepareContext === "function"
    ? Sheet.prototype._prepareContext
    : async function () { return {}; };

  Sheet.prototype._prepareContext = async function(options) {
    const context = await original.call(this, options);
    context.followers ??= await getFollowerRows(this.document);
    return context;
  };

  Sheet.prototype._ezFollowersPrepareContextPatched = true;
}

function patchPreparePartContext(Sheet) {
  if (Sheet.prototype._ezFollowersPreparePartContextPatched) return;

  const original = typeof Sheet.prototype._preparePartContext === "function"
    ? Sheet.prototype._preparePartContext
    : async function (_partId, context) { return context ?? {}; };

  Sheet.prototype._preparePartContext = async function(partId, context, options) {
    context = await original.call(this, partId, context, options);

    if (partId === TAB_ID) {
      const followers = await getFollowerRows(this.document);
      context.tab = {
        id: TAB_ID,
        group: TAB_GROUP,
        active: this.tabGroups?.[TAB_GROUP] === TAB_ID
      };
      context.followers = followers;
      context.leaderUuid = this.document.uuid;
      context.fellowshipBonus = getFellowshipBonus(this.document);
      context.followerTables = getFollowerTableContext(followers);
    }

    return context;
  };

  Sheet.prototype._ezFollowersPreparePartContextPatched = true;
}

function activateFollowerTab(app) {
  const root = getApplicationElement(app);
  const tab = root?.querySelector?.(`[data-tab="${TAB_ID}"]`);
  if (!tab || tab.dataset.ezFollowersActive === "true") return;

  tab.dataset.ezFollowersActive = "true";
  tab.querySelectorAll("[data-ez-drop-category]").forEach(zone => {
    zone.addEventListener("dragover", onFollowerDragOver, { capture: true });
    zone.addEventListener("drop", event => onFollowerDrop(event, app), { capture: true });
  });

  tab.querySelectorAll("[data-ez-remove-follower]").forEach(button => {
    button.addEventListener("click", event => onRemoveFollower(event, app));
  });

  tab.querySelectorAll("[data-ez-open-follower]").forEach(button => {
    button.addEventListener("click", onOpenFollowerSheet);
  });

  tab.querySelectorAll("[data-ez-hireling-field]").forEach(input => {
    input.addEventListener("change", event => onHirelingFieldChange(event, app));
  });
}

function activateSheetFollowerDrop(app) {
  const root = getApplicationElement(app);
  if (!root || root.dataset.ezFollowersSheetDropActive === "true") return;

  root.dataset.ezFollowersSheetDropActive = "true";
  root.addEventListener("dragover", event => onSheetFollowerDragOver(event, app), { capture: true });
  root.addEventListener("drop", event => onSheetFollowerDrop(event, app), { capture: true });
}

function getApplicationElement(app) {
  const element = app?.element;
  if (element instanceof HTMLElement) return element;
  if (element?.[0] instanceof HTMLElement) return element[0];
  if (app?.window?.content instanceof HTMLElement) return app.window.content;
  return null;
}

function registerFollowerActionListeners() {
  if (globalThis._ezFollowersActionListenersRegistered) return;
  globalThis._ezFollowersActionListenersRegistered = true;

  document.addEventListener("click", event => {
    if (!event.target?.closest?.("[data-ez-remove-follower]")) return;
    onRemoveFollower(event, null);
  }, { capture: true });

  document.addEventListener("click", event => {
    if (!event.target?.closest?.("[data-ez-open-follower]")) return;
    onOpenFollowerSheet(event);
  }, { capture: true });

  document.addEventListener("change", event => {
    if (!event.target?.closest?.("[data-ez-hireling-field]")) return;
    onHirelingFieldChange(event, null);
  }, { capture: true });
}

function registerFollowerDropListeners() {
  if (globalThis._ezFollowersDropListenersRegistered) return;
  globalThis._ezFollowersDropListenersRegistered = true;

  document.addEventListener("dragover", event => {
    if (!event.target?.closest?.("[data-ez-drop-category]")) return;
    onFollowerDragOver(event);
  }, { capture: true });

  document.addEventListener("drop", event => {
    if (!event.target?.closest?.("[data-ez-drop-category]")) return;
    onFollowerDrop(event, null);
  }, { capture: true });
}

function onFollowerDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "link";
}

function onSheetFollowerDragOver(event, app) {
  if (event.target?.closest?.("[data-ez-drop-category]")) return;
  if (!isPossibleFollowerDrop(event)) return;

  const leader = app?.actor ?? app?.document;
  if (!leader || leader.documentName !== "Actor" || leader.type !== "character") return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "link";
}

async function onSheetFollowerDrop(event, app) {
  if (event.target?.closest?.("[data-ez-drop-category]")) return;

  const leader = app?.actor ?? app?.document;
  if (!leader || leader.documentName !== "Actor" || leader.type !== "character") return;

  const droppedActor = await actorFromDropEvent(event);
  const category = getFollowerCategoryForActor(droppedActor);
  if (!category) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  try {
    await addFollower(leader, droppedActor, category);
    renderLeaderSheet(app, leader);
  } catch (err) {
    error("Sheet follower drop failed", err);
    ui.notifications.error(err.message ?? "Could not add follower.");
  }
}

function isPossibleFollowerDrop(event) {
  const data = getDropData(event);
  return data?.type === "Actor"
    || data?.documentName === "Actor"
    || Boolean(data?.uuid?.includes(".Actor."));
}

async function onFollowerDrop(event, app) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const dropTarget = event.currentTarget?.closest?.("[data-ez-drop-category]")
    ?? event.target?.closest?.("[data-ez-drop-category]");
  const actor = await getLeaderActor(event, app);
  const category = dropTarget?.dataset?.ezDropCategory;
  if (!actor || ![HENCHMAN, HIRELING].includes(category)) return;

  try {
    const droppedActor = await actorFromDropEvent(event);
    if (!droppedActor) {
      return ui.notifications.warn("Drop a world actor here.");
    }

    await addFollower(actor, droppedActor, category);
    renderLeaderSheet(app, actor);
  } catch (err) {
    error("Follower drop failed", err);
    ui.notifications.error(err.message ?? "Could not add follower.");
  }
}

async function getLeaderActor(event, app) {
  const actor = app?.actor ?? app?.document;
  if (actor) return actor;

  const root = event.target?.closest?.("[data-ez-leader-uuid]");
  const uuid = root?.dataset?.ezLeaderUuid;
  if (!uuid) return null;

  const document = await fromUuid(uuid);
  return document?.documentName === "Actor" ? document : null;
}

function renderLeaderSheet(app, actor) {
  if (typeof app?.render === "function") {
    app.render(true);
    return;
  }

  if (typeof actor?.sheet?.render === "function") {
    actor.sheet.render(true);
  }
}

async function onRemoveFollower(event, app) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const actor = await getLeaderActor(event, app);
  const button = event.currentTarget?.closest?.("[data-ez-remove-follower]")
    ?? event.target?.closest?.("[data-ez-remove-follower]");
  const id = button?.dataset?.ezRemoveFollower;
  if (!actor || !id) return;

  const followers = getStoredFollowers(actor).filter(follower => follower?.id !== id);
  await setStoredFollowers(actor, followers);
  renderLeaderSheet(app, actor);
}

async function onOpenFollowerSheet(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const button = event.currentTarget?.closest?.("[data-ez-open-follower]")
    ?? event.target?.closest?.("[data-ez-open-follower]");
  const actor = button?.dataset?.ezOpenFollower ? await fromUuid(button.dataset.ezOpenFollower) : null;
  if (!actor || actor.documentName !== "Actor") return;

  if (!canOpenActor(actor)) {
    return ui.notifications.warn(`You do not own ${actor.name}.`);
  }

  const sheet = actor.sheet;
  if (typeof sheet?.render === "function") {
    sheet.render(true);
  }
}

async function onHirelingFieldChange(event, app) {
  event.stopPropagation();

  const actor = await getLeaderActor(event, app);
  const input = event.currentTarget?.closest?.("[data-ez-hireling-field]")
    ?? event.target?.closest?.("[data-ez-hireling-field]");
  const id = input?.dataset?.ezHirelingId;
  const field = input?.dataset?.ezHirelingField;
  if (!actor || !id || !HIRELING_FIELDS.has(field)) return;

  const followers = getStoredFollowers(actor).map(follower => {
    if (follower?.id !== id || follower?.category !== HIRELING) return follower;
    return {
      ...follower,
      [field]: input.value.trim()
    };
  });

  await setStoredFollowers(actor, followers);
}

async function actorFromDropEvent(event) {
  const data = getDropData(event);
  if (!data) return null;

  if (data.uuid) {
    const document = await fromUuid(data.uuid);
    if (document?.documentName === "Actor") return document;
  }

  if (data.id && game?.actors?.has?.(data.id)) {
    return game.actors.get(data.id);
  }

  if (data?.type !== "Actor" && data?.documentName !== "Actor") return null;

  return actorFromDropData(data);
}

async function actorFromDropData(data) {
  const actorClass = CONFIG?.Actor?.documentClass ?? globalThis.Actor;
  if (typeof actorClass?.fromDropData === "function") {
    return actorClass.fromDropData(data);
  }

  if (typeof globalThis.Actor?.implementation?.fromDropData === "function") {
    return globalThis.Actor.implementation.fromDropData(data);
  }

  if (typeof globalThis.Actor?.fromDropData === "function") {
    return globalThis.Actor.fromDropData(data);
  }

  return null;
}

function getDropData(event) {
  const textEditor = globalThis.foundry?.applications?.ux?.TextEditor?.implementation
    ?? globalThis.TextEditor;

  if (typeof textEditor?.getDragEventData === "function") {
    const data = textEditor.getDragEventData(event);
    if (data) return data;
  }

  const raw = event.dataTransfer?.getData("application/json")
    || event.dataTransfer?.getData("text/plain");
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function addFollower(leader, followerActor, category) {
  if (followerActor.pack) {
    throw new Error("Compendium actors must be imported before they can be followers.");
  }

  if (followerActor.isToken) {
    throw new Error("Token actors must be linked world actors before they can be followers.");
  }

  if (followerActor.uuid === leader.uuid) {
    throw new Error("An actor cannot follow itself.");
  }

  const expectedType = category === HENCHMAN ? "character" : "npc";
  const label = category === HENCHMAN ? "Henchmen" : "Hirelings";
  if (followerActor.type !== expectedType) {
    throw new Error(`${label} must be ${expectedType} actors.`);
  }

  const followers = getStoredFollowers(leader);
  if (followers.some(follower => follower?.uuid === followerActor.uuid && follower?.category === category)) {
    throw new Error(`${followerActor.name} is already in ${label}.`);
  }

  if (category === HENCHMAN) {
    const henchmanCount = followers.filter(follower => follower?.category === HENCHMAN).length;
    const fellowshipBonus = getFellowshipBonus(leader);
    if (henchmanCount >= fellowshipBonus) {
      throw new Error(`Maximum henchmen reached. Fellowship Bonus allows ${fellowshipBonus}.`);
    }
  }

  if (category === HIRELING) {
    await ensureHirelingItem(followerActor);
  }

  followers.push(createFollowerRow(followerActor, category));
  await setStoredFollowers(leader, followers);

  if (category === HIRELING) {
    ui.notifications.info(`Added ${followerActor.name} as a hireling.`);
  }
}

function getFollowerCategoryForActor(actor) {
  if (actor?.documentName !== "Actor") return null;
  if (actor.type === "character") return HENCHMAN;
  if (actor.type === "npc") return HIRELING;
  return null;
}

async function ensureHirelingItem(actor) {
  if (actorHasHirelingItem(actor)) return;

  const hirelingItem = await findHirelingItem();
  if (!hirelingItem) {
    ui.notifications.warn("Hireling item not found. Added actor to Hirelings without applying Up in Arms automation.");
    return;
  }

  const itemData = hirelingItem.toObject();
  delete itemData._id;
  await actor.createEmbeddedDocuments("Item", [itemData]);
  ui.notifications.info(`Added ${HIRELING_ITEM_NAME} item to ${actor.name}.`);
}

function actorHasHirelingItem(actor) {
  return actor.items?.some?.(item => item.name === HIRELING_ITEM_NAME)
    || Object.values(actor.itemTypes ?? {}).flat().some(item => item.name === HIRELING_ITEM_NAME);
}

async function findHirelingItem() {
  const worldItem = game.items?.find?.(item => item.name === HIRELING_ITEM_NAME);
  if (worldItem) return worldItem;

  const pack = game.packs?.get?.(UP_IN_ARMS_ITEM_PACK);
  if (!pack) return null;

  const index = await pack.getIndex();
  const entry = index.find(item => item.name === HIRELING_ITEM_NAME);
  return entry ? pack.getDocument(entry._id) : null;
}

function createFollowerRow(actor, category) {
  return {
    id: foundry.utils.randomID(),
    uuid: actor.uuid,
    category,
    name: actor.name,
    img: actor.img,
    actorType: actor.type,
    ...(category === HIRELING ? {
      profile: "Porter",
      type: "Other",
      template: "",
      physicalQuirk: "",
      workEthic: "",
      personalityQuirk: "",
      terms: "",
      contract: "Ongoing",
      endeavours: "",
      requirements: "",
      reliability: "Unknown",
      status: "Hired",
      notes: ""
    } : {})
  };
}

function getStoredFollowers(actor) {
  const followers = actor?.getFlag(MODULE_ID, FOLLOWERS_FLAG);
  return Array.isArray(followers) ? foundry.utils.deepClone(followers) : [];
}

async function setStoredFollowers(actor, followers) {
  await actor.setFlag(MODULE_ID, FOLLOWERS_FLAG, followers);
}

async function getFollowerRows(actor) {
  const followers = getStoredFollowers(actor);
  return Promise.all(followers.map(resolveFollowerRow));
}

async function resolveFollowerRow(follower) {
  const actor = follower?.uuid ? await fromUuid(follower.uuid) : null;
  const row = {
    ...follower,
    name: actor?.name ?? follower?.name ?? "Missing Actor",
    img: actor?.img ?? follower?.img ?? "icons/svg/mystery-man.svg",
    actorType: actor?.type ?? follower?.actorType ?? "",
    canOpen: canOpenActor(actor),
    missing: !actor
  };

  if (row.category === HIRELING) {
    row.profile ??= "Porter";
    row.type ??= "Other";
    row.template ??= "";
    row.physicalQuirk ??= "";
    row.workEthic ??= "";
    row.personalityQuirk ??= "";
    row.terms ??= row.payRate ?? "";
    row.contract ??= "Ongoing";
    row.endeavours ??= "";
    row.requirements ??= "";
    row.reliability ??= "Unknown";
    row.status ??= "Hired";
    row.notes ??= "";
  }

  return row;
}

function getFollowerTableContext(followers) {
  return {
    hirelings: followers.filter(follower => follower?.category === HIRELING),
    henchmen: followers.filter(follower => follower?.category === HENCHMAN)
  };
}

function getFellowshipBonus(actor) {
  return Number(
    actor?.characteristics?.fel?.bonus
    ?? actor?.system?.characteristics?.fel?.bonus
    ?? 0
  ) || 0;
}

function canOpenActor(actor) {
  if (!actor || actor.documentName !== "Actor" || !game.user) return false;

  if (typeof actor.testUserPermission === "function") {
    return actor.testUserPermission(game.user, "OWNER");
  }

  return actor.isOwner === true;
}

function registerExperiencePropagation() {
  Hooks.on("updateActor", async (actor, _changed, options) => {
    const suppressionKey = getXpSuppressionKey(actor, options?.fromMessage);
    if (xpPropagationSuppressedActors.has(suppressionKey)) {
      xpPropagationSuppressedActors.delete(suppressionKey);
      return;
    }
    if (actor?.type !== "character") return;
    if (!options?.fromMessage) return;

    const message = game.messages?.get?.(options.fromMessage);
    if (!isExperienceMessage(message)) return;

    const amount = Number(message.system?.amount) || 0;
    if (amount <= 0) return;

    await awardHenchmanExperience(actor, amount, message.system?.reason ?? "", options.fromMessage);
  });
}

function isExperienceMessage(message) {
  return message?.type === "xp";
}

function getXpSuppressionKey(actor, messageId) {
  return `${actor?.uuid ?? ""}::${messageId ?? ""}`;
}

async function awardHenchmanExperience(leader, leaderXpDelta, reason, messageId) {
  const amount = Math.floor(leaderXpDelta / 2);
  if (amount <= 0) return;

  const followers = getStoredFollowers(leader).filter(follower => follower?.category === HENCHMAN);
  if (!followers.length) return;

  for (const follower of followers) {
    const henchman = follower?.uuid ? await fromUuid(follower.uuid) : null;
    if (!henchman) {
      warn(`Skipping missing henchman actor for ${leader.name}`, follower);
      continue;
    }
    if (henchman.type !== "character") {
      warn(`Skipping non-character henchman ${henchman.name}`);
      continue;
    }

    await awardExperienceToHenchman(henchman, amount, reason, messageId);
  }
}

async function awardExperienceToHenchman(actor, amount, reason, messageId) {
  if (typeof actor.system?.awardExp !== "function") {
    warn(`Skipping XP award for ${actor.name}; WFRP4e awardExp API not found.`);
    return;
  }

  const suppressionKey = getXpSuppressionKey(actor, messageId);
  xpPropagationSuppressedActors.add(suppressionKey);
  const timeoutId = setTimeout(() => xpPropagationSuppressedActors.delete(suppressionKey), 5000);

  try {
    await actor.system.awardExp(amount, reason, messageId, true);
    ui.notifications.info(`${actor.name} gained ${amount} XP as a henchman.`);
  } catch (err) {
    xpPropagationSuppressedActors.delete(suppressionKey);
    clearTimeout(timeoutId);
    throw err;
  }
}
