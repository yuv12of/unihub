import { test } from "node:test";
import assert from "node:assert/strict";
import { MODE_PRESETS, cleanModules, defaultTabs, isStudyPush, moduleOfPath, modulesChosen, modulesOf, pathAllowed, tabsFor } from "@/lib/modules";

test("accounts without a choice keep study and hobbies, goals stay off", () => {
  for (const prefs of [null, undefined, {}, { modules: null }, { modules: {} }]) {
    assert.deepEqual(modulesOf(prefs), { study: true, goals: false, hobbies: true });
    assert.equal(modulesChosen(prefs), false);
  }
});

test("only booleans count, unknown keys are dropped", () => {
  assert.deepEqual(modulesOf({ modules: { study: false, goals: "yes", x: true } }), { study: false, goals: false, hobbies: true });
  assert.deepEqual(cleanModules({ study: false, goals: 1, admin: true }), { study: false });
  assert.deepEqual(cleanModules(null), {});
  assert.equal(modulesChosen({ modules: { study: false } }), true);
});

test("paths map to modules; /login is not /log", () => {
  assert.equal(moduleOfPath("/courses/20109"), "study");
  assert.equal(moduleOfPath("/log"), "study");
  assert.equal(moduleOfPath("/login"), null);
  assert.equal(moduleOfPath("/studying"), null);
  assert.equal(moduleOfPath("/hobbies/abc"), "hobbies");
  assert.equal(moduleOfPath("/"), null);
  assert.equal(moduleOfPath("/semester"), null);
});

test("a study-off user can't open study pages but keeps everything else", () => {
  const m = MODE_PRESETS.life;
  for (const p of ["/courses", "/study/drills", "/books/1", "/degree", "/mail", "/log", "/meetup/20109/2026-11-15"]) assert.equal(pathAllowed(p, m), false, p);
  for (const p of ["/", "/semester", "/routines", "/friends", "/hobbies", "/profile", "/settings"]) assert.equal(pathAllowed(p, m), true, p);
});

test("default tabs never point at a hidden or missing page", () => {
  assert.deepEqual(defaultTabs(MODE_PRESETS.study), ["/", "/semester", "/courses", "/study"]);
  const life = defaultTabs(MODE_PRESETS.life);
  assert.equal(life.length, 4);
  assert.ok(life.every((h) => pathAllowed(h, MODE_PRESETS.life)));
  assert.ok(!life.includes("/goals")); // until the goals pages ship
  assert.ok(!defaultTabs({ study: false, goals: false, hobbies: false }).includes("/hobbies"));
});

test("own tabs survive; ones that vanished with a module are replaced", () => {
  const life = MODE_PRESETS.life;
  assert.deepEqual(tabsFor(null, MODE_PRESETS.study), ["/", "/semester", "/courses", "/study"]);
  assert.deepEqual(tabsFor(["/", "/friends"], MODE_PRESETS.study), ["/", "/friends"]); // chose two on purpose
  const t = tabsFor(["/", "/semester", "/courses", "/study"], life);
  assert.deepEqual(t.slice(0, 2), ["/", "/semester"]);
  assert.equal(t.length, 4);
  assert.ok(t.every((h) => pathAllowed(h, life)));
});

test("study pushes are told apart from the rest", () => {
  for (const k of ["s|2026-11-13|09:00|x", "d|20109|11|2026-11-20", "mf|abc"]) assert.equal(isStudyPush(k), true, k);
  for (const k of ["r|id|2026-11-13", "e|abc", "eve|2026-11-13", "if|1"]) assert.equal(isStudyPush(k), false, k);
});
