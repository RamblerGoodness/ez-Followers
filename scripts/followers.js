const MODULE_ID = "ez-followers-wfrp4e";

Hooks.on("renderActorSheet", (app, html) => {
  if (game.system.id !== "wfrp4e") return;

  const actor = app?.actor;
  if (!actor || actor.type !== "character") return;

  if (html.find('[data-tab="followers"]').length) return;

  const nav = html.find('[data-group="primary"]').filter((_, el) => {
    return el.classList.contains("sheet-tabs") || el.classList.contains("first");
  });

  if (!nav.length) {
    console.warn(`${MODULE_ID} | Could not find primary nav`);
    return;
  }

  nav.append('<a class="item" data-tab="followers" data-group="primary">Followers</a>');

  const body = html.find(".sheet-body").first();
  if (!body.length) {
    console.warn(`${MODULE_ID} | Could not find sheet body`);
    return;
  }

  body.append(`
    <section class="tab followers" data-tab="followers" data-group="primary">
      <div style="padding: .5rem;">
        <h2>Followers</h2>
        <p>Working on this</p>
      </div>
    </section>
  `);

  if (app._tabs) {
    for (const tab of app._tabs) {
      tab.bind(html[0]);
    }
  }
});
