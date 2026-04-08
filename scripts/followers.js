const MODULE_ID = "ez-followers";
const SHEET_CLASS_NAME = "ActorSheetWFRP4eCharacter";
const TAB_ID = "followers";
const TAB_GROUP = "primary";
const DEFAULT_ACTIVE_TAB = "main";

function log(...args) {
  console.log(`${MODULE_ID} |`, ...args);
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
    if (app?.constructor?.name !== SHEET_CLASS_NAME) return;

    const Sheet = app.constructor;
    if (!Sheet) return;

    // Patch this sheet class only once.
    if (!Sheet._ezFollowersPatched) {
      patchSheetClass(Sheet);
      Sheet._ezFollowersPatched = true;
      log("Patched sheet class", Sheet.name ?? SHEET_CLASS_NAME);

      // Re-render once so the newly patched class config is applied immediately.
      // Mark this instance so we do not loop.
      if (!app._ezFollowersRerendered) {
        app._ezFollowersRerendered = true;
        app.render(true);
      }
    }
  } catch (err) {
    error("renderApplicationV2 patch failed", err);
  }
});

function patchSheetClass(Sheet) {
  patchTabs(Sheet);
  patchParts(Sheet);
  patchTabGroups(Sheet);
  patchPrepareContext(Sheet);
  patchPreparePartContext(Sheet);
}

function patchTabs(Sheet) {
  const tabs = foundry.utils.deepClone(Sheet.TABS ?? {});
  let changed = false;

  // Flat tab map shape
  if (!tabs[TAB_ID]) {
    tabs[TAB_ID] = {
      id: TAB_ID,
      group: TAB_GROUP,
      label: "Followers"
    };
    changed = true;
  }

  // Nested AppV2 tab-group shape
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
    log(`Added ${TAB_ID} to nested tab group`, key);
  }

  if (changed) {
    Sheet.TABS = tabs;
    log("TABS patched");
  } else {
    log("TABS already contained followers");
  }
}

function patchParts(Sheet) {
  const parts = foundry.utils.deepClone(Sheet.PARTS ?? {});

  if (parts[TAB_ID]) {
    log("PARTS already contained followers");
    return;
  }

  parts[TAB_ID] = {
    template: `modules/${MODULE_ID}/templates/followers-tab.hbs`
  };

  Sheet.PARTS = parts;
  log("PARTS patched");
}

function patchTabGroups(Sheet) {
  const current = Sheet.prototype.tabGroups ?? {};

  // Only set a default if missing.
  if (current[TAB_GROUP] != null) {
    log("tabGroups already defines primary");
    return;
  }

  Sheet.prototype.tabGroups = {
    ...current,
    [TAB_GROUP]: DEFAULT_ACTIVE_TAB
  };

  log("tabGroups patched");
}

function patchPrepareContext(Sheet) {
  if (Sheet.prototype._ezFollowersPrepareContextPatched) return;

  const original = typeof Sheet.prototype._prepareContext === "function"
    ? Sheet.prototype._prepareContext
    : async function () { return {}; };

  Sheet.prototype._prepareContext = async function(options) {
    const context = await original.call(this, options);
    context.followers ??= this.document?.getFlag(MODULE_ID, "followers") ?? [];
    return context;
  };

  Sheet.prototype._ezFollowersPrepareContextPatched = true;
  log("_prepareContext patched");
}

function patchPreparePartContext(Sheet) {
  if (Sheet.prototype._ezFollowersPreparePartContextPatched) return;

  const original = typeof Sheet.prototype._preparePartContext === "function"
    ? Sheet.prototype._preparePartContext
    : async function (_partId, context) { return context ?? {}; };

  Sheet.prototype._preparePartContext = async function(partId, context, options) {
    context = await original.call(this, partId, context, options);

    if (partId === TAB_ID) {
      context.tab = {
        id: TAB_ID,
        group: TAB_GROUP,
        active: this.tabGroups?.[TAB_GROUP] === TAB_ID
      };

      context.followers = this.document?.getFlag(MODULE_ID, "followers") ?? [];
    }

    return context;
  };

  Sheet.prototype._ezFollowersPreparePartContextPatched = true;
  log("_preparePartContext patched");
}