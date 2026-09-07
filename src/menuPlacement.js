// Row menus hang below their ⋮ trigger. Near the bottom of the viewport — or
// of a container that clips its own overflow, like the meals list and the
// groceries table — that would put them out of reach, so they flip above the
// trigger instead. Whichever edge is closer wins.

// Roughly the height of a two-item menu.
export const MENU_HEIGHT = 96;

export function shouldFlipMenu(trigger, container, menuHeight = MENU_HEIGHT) {
  const rect = trigger.getBoundingClientRect();
  const bounds = container?.getBoundingClientRect();

  // A container that extends past the viewport is bounded by the viewport.
  const floor = Math.min(window.innerHeight, bounds?.bottom ?? Infinity);
  const ceiling = Math.max(0, bounds?.top ?? 0);

  const below = floor - rect.bottom;
  const above = rect.top - ceiling;

  // Only flip when there is genuinely more room the other way.
  return below < menuHeight && above > below;
}
