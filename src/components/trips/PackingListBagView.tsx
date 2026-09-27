/**
 * PackingListBagView Component
 *
 * Packing list grouped by bag, then by category, with a section per container.
 * Items can be dragged between bags and containers.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from 'solid-js';
import type { Bag, TripItem } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { packingStats } from '../../lib/packing-stats';
import { byName, categoryOf, groupSorted, placeItems } from '../../lib/item-placement';
import { BagSwatch } from '../ui/BagFields';
import { EditIcon, PlusIcon, SwitchBagIcon } from '../ui/Icons';
import {
  AllPackedNote,
  DropZone,
  ItemGrid,
  ItemGroup,
  NO_BAG,
  PackDnd,
  createCardRenderer,
  createCategoryIcons,
  dropInto,
  isUnpacked,
  useDragState,
  type PackingListProps,
} from './PackingListParts';

// The sticky nav bar wraps to several lines on narrow screens, so scrolled-to
// sections land below its measured height, with a little breathing room.
const NAV_BAR_ID = 'bag-nav-bar';
const SCROLL_GAP = 8;

const bagSectionId = (bagId: string | null) =>
  bagId ? `bag-section-${bagId}` : 'bag-section-none';
const containerSectionId = (containerId: string) => `container-section-${containerId}`;

function scrollToElement(elementId: string) {
  const element = document.getElementById(elementId);
  const scrollContainer = document.querySelector('main.overflow-y-auto');
  if (!element || !scrollContainer) return;
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const navBarHeight = document.getElementById(NAV_BAR_ID)?.offsetHeight ?? 0;
  const offset =
    element.getBoundingClientRect().top -
    containerTop +
    scrollContainer.scrollTop -
    navBarHeight -
    SCROLL_GAP;
  scrollContainer.scrollTo({ top: offset, behavior: 'smooth' });
}

// Bags and containers in the order they appear on the page.
type NavItem =
  | { type: 'bag'; id: string | null; name: string; color: string | null }
  | { type: 'container'; id: string; name: string };

const navSectionId = (navItem: NavItem) =>
  navItem.type === 'bag' ? bagSectionId(navItem.id) : containerSectionId(navItem.id);

function WayfindingNavBar(props: {
  navItems: NavItem[];
  currentSection: () => string | null;
  onScrollToSection: (sectionId: string) => void;
  onAddBag: () => void;
}) {
  const drag = useDragState();

  // While dragging, highlight the section under the pointer; otherwise the one scrolled to.
  const highlighted = () => {
    const target = drag.item() && drag.target();
    if (target?.type === 'bag') return bagSectionId(target.bagId ?? null);
    if (target?.type === 'container' && target.containerId) {
      return containerSectionId(target.containerId);
    }
    return props.currentSection();
  };

  // On phones the chips form one swipeable row; keep the current one in view.
  let row: HTMLDivElement | undefined;
  createEffect(() => {
    const chip = row?.querySelector<HTMLElement>(`[data-section="${highlighted()}"]`);
    if (!row || !chip) return;
    const { left, right } = chip.getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    if (left < bounds.left || right > bounds.right) {
      row.scrollTo({ left: chip.offsetLeft - row.offsetLeft - 8, behavior: 'smooth' });
    }
  });

  return (
    <div
      id={NAV_BAR_ID}
      class="sticky top-0 z-10 -mx-4 bg-gray-50/95 px-4 py-1.5 backdrop-blur-sm md:-mx-3 md:px-3 [@media(max-height:500px)]:py-0.5"
    >
      <div class="flex items-center gap-x-1">
        <div
          ref={row}
          class="flex min-h-8 min-w-0 flex-1 [scrollbar-width:none] flex-nowrap gap-x-1 overflow-x-auto whitespace-nowrap md:flex-wrap md:overflow-visible md:whitespace-normal [@media(max-height:500px)]:flex-nowrap [@media(max-height:500px)]:overflow-x-auto [@media(max-height:500px)]:whitespace-nowrap"
        >
          <For each={props.navItems}>
            {(navItem) => (
              <button
                data-section={navSectionId(navItem)}
                onClick={() => props.onScrollToSection(navSectionId(navItem))}
                class={`btn-compact flex shrink-0 items-center gap-1 px-1.5 py-0.5 text-xs ${
                  highlighted() === navSectionId(navItem)
                    ? 'text-gray-900 underline decoration-2 underline-offset-2'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {navItem.type === 'container' ? (
                  <span class="text-[10px]">📦</span>
                ) : navItem.id === null ? (
                  <span class="text-[10px]">👕</span>
                ) : (
                  <BagSwatch color={navItem.color} class="h-2 w-2" />
                )}
                <span class="max-w-[130px] truncate">{navItem.name}</span>
              </button>
            )}
          </For>
        </div>
        <button
          type="button"
          onClick={props.onAddBag}
          class="btn-compact shrink-0 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-600 hover:border-blue-400 hover:text-blue-700"
        >
          + Bag
        </button>
      </div>
    </div>
  );
}

interface PackingListBagViewProps extends PackingListProps {
  onAddToBag: (bagId: string | null) => void;
  onAddToContainer: (containerId: string) => void;
  onReplaceBag: (bag: Bag) => void;
  onAddBag: () => void;
}

export function PackingListBagView(props: PackingListBagViewProps) {
  const placement = createMemo(() => placeItems(props.items() ?? [], props.bags() ?? []));
  const iconFor = createCategoryIcons(props.categories);
  const contentsOf = (containerId: string) => placement().byContainer.get(containerId) ?? [];
  const renderCard = createCardRenderer(props, iconFor, contentsOf, (container) =>
    scrollToElement(containerSectionId(container.id))
  );

  const bagName = (bagId: string | null) =>
    props.bags()?.find((bag) => bag.id === bagId)?.name ?? NO_BAG_LABEL;

  const sortedBags = createMemo(() => [...(props.bags() ?? [])].sort(byName).concat(NO_BAG));
  const bagItems = (bagId: string | null) => placement().byBag.get(bagId) ?? [];
  const containersIn = (bagId: string | null) =>
    bagItems(bagId)
      .filter((item) => item.is_container)
      .sort(byName);

  const navItems = createMemo((): NavItem[] =>
    sortedBags().flatMap((bag): NavItem[] => [
      { type: 'bag', id: bag.id, name: bag.name, color: bag.color },
      ...containersIn(bag.id).map((c): NavItem => ({ type: 'container', id: c.id, name: c.name })),
    ])
  );

  // The section at the top of the list, just under the nav bar. Containers
  // sit inside their bag's section; the innermost one wins, so the bar shows
  // the container you're looking at rather than the bag around it.
  const [currentSection, setCurrentSection] = createSignal<string | null>(null);

  const updateCurrentSection = () => {
    const navBar = document.getElementById(NAV_BAR_ID);
    const scroller = document.querySelector('main.overflow-y-auto');
    if (!navBar || !scroller) return;
    const probeY = navBar.getBoundingClientRect().bottom + SCROLL_GAP;
    const sections = navItems()
      .map((navItem) => document.getElementById(navSectionId(navItem)))
      .filter((section): section is HTMLElement => section !== null);
    const containing = sections.filter((section) => {
      const { top, bottom } = section.getBoundingClientRect();
      return top <= probeY && bottom > probeY;
    });
    // At the bottom of the list, the last sections can never reach the top;
    // show the last one on screen. Between sections, the next one down.
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
    const viewBottom = scroller.getBoundingClientRect().bottom;
    const lastOnScreen = atBottom
      ? sections.filter((section) => section.getBoundingClientRect().top < viewBottom).at(-1)
      : undefined;
    const current =
      lastOnScreen ??
      containing.find((section) => section.id.startsWith('container-section-')) ??
      containing[0] ??
      sections.find((section) => section.getBoundingClientRect().top > probeY);
    if (current) setCurrentSection(current.id);
  };

  onMount(() => {
    const scroller = document.querySelector('main.overflow-y-auto');
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateCurrentSection);
    };
    scroller?.addEventListener('scroll', onScroll, { passive: true });
    onCleanup(() => {
      cancelAnimationFrame(frame);
      scroller?.removeEventListener('scroll', onScroll);
    });
  });

  // Recompute once the sections render or change.
  createEffect(() => {
    navItems();
    requestAnimationFrame(updateCurrentSection);
  });

  return (
    <PackDnd onDrop={(item, target) => dropInto(props, item, target)}>
      <div class="space-y-3">
        <WayfindingNavBar
          navItems={navItems()}
          currentSection={currentSection}
          onScrollToSection={scrollToElement}
          onAddBag={props.onAddBag}
        />

        <For each={sortedBags()}>
          {(bag) => {
            const stats = () => packingStats(bagItems(bag.id));
            const allPacked = () =>
              props.showUnpackedOnly() && stats().remaining === 0 && stats().packed > 0;
            const categoryGroups = createMemo(
              () => new Map(groupSorted(bagItems(bag.id), categoryOf))
            );
            return (
              <DropZone
                id={`bag-${bag.id ?? 'none'}`}
                data={{ type: 'bag', bagId: bag.id }}
                activeClass="bg-blue-100 ring-2 ring-blue-400"
              >
                <div id={bagSectionId(bag.id)} class="p-1 md:p-2">
                  <div class="mb-1 flex items-center gap-2 px-1">
                    <Show
                      when={bag.id !== null}
                      fallback={<span class="text-lg md:text-base">👕</span>}
                    >
                      <BagSwatch color={bag.color} class="h-3 w-3" />
                    </Show>
                    <h2 class="flex-1 text-lg font-semibold text-gray-900 md:text-base">
                      {bag.name}
                    </h2>
                    <span class="text-sm text-gray-500 md:text-xs">
                      {stats().packed} / {stats().total}
                    </span>
                    <Show when={bag.id !== null}>
                      <button
                        onClick={() => props.onReplaceBag(bag)}
                        class="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        title="Replace this bag"
                        aria-label={`Replace ${bag.name}`}
                      >
                        <SwitchBagIcon class="h-4 w-4" />
                      </button>
                    </Show>
                    <button
                      onClick={() => props.onAddToBag(bag.id)}
                      class="flex items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
                      title="Add an item to this bag"
                      aria-label={`Add an item to ${bag.name}`}
                    >
                      <PlusIcon class="h-5 w-5" />
                    </button>
                  </div>
                  <Show when={!allPacked()} fallback={<AllPackedNote count={stats().total} />}>
                    <For each={[...categoryGroups().keys()]}>
                      {(category) => (
                        <ItemGroup
                          items={[...categoryGroups().get(category)!].sort(byName)}
                          showUnpackedOnly={props.showUnpackedOnly()}
                          renderCard={renderCard}
                          class="mb-3 md:mb-2"
                          titleClass="mb-1.5 flex items-center gap-1 px-1 text-sm font-medium text-gray-600 md:mb-1 md:text-xs"
                          title={
                            <>
                              <span class="text-base md:text-sm">{iconFor(category)}</span>
                              {category}
                            </>
                          }
                        />
                      )}
                    </For>
                  </Show>
                  <Show when={containersIn(bag.id).length > 0}>
                    <div class="mt-3 space-y-3 border-l-2 border-blue-100 pl-3 md:mt-2 md:space-y-2 md:pl-3">
                      <For each={containersIn(bag.id)}>
                        {(container) => (
                          <ContainerSection
                            container={container}
                            contents={[...contentsOf(container.id)].sort(byName)}
                            icon={iconFor(container.category_name)}
                            bagName={bagName(bag.id)}
                            showUnpackedOnly={props.showUnpackedOnly()}
                            renderCard={renderCard}
                            onEdit={() => props.onEditItem(container)}
                            onAdd={() => props.onAddToContainer(container.id)}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </DropZone>
            );
          }}
        </For>
      </div>
    </PackDnd>
  );
}

function ContainerSection(props: {
  container: TripItem;
  contents: TripItem[];
  icon: string;
  bagName: string;
  showUnpackedOnly: boolean;
  renderCard: (item: TripItem) => JSX.Element;
  onEdit: () => void;
  onAdd: () => void;
}) {
  const stats = () => packingStats(props.contents);
  const allPacked = () => props.showUnpackedOnly && stats().remaining === 0 && stats().packed > 0;

  return (
    <DropZone
      id={`container-${props.container.id}`}
      data={{ type: 'container', containerId: props.container.id }}
      activeClass="bg-purple-100 ring-2 ring-purple-400"
    >
      <div
        id={containerSectionId(props.container.id)}
        class="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5 shadow-sm md:p-2"
      >
        <div class="mb-1.5 flex items-center gap-2 md:mb-2">
          <span class="text-base md:text-sm">{props.icon}</span>
          <h3 class="flex-1 font-semibold text-gray-800">
            {props.container.name}
            <button
              onClick={() => scrollToElement(`trip-item-${props.container.id}`)}
              class="ml-2 text-xs font-normal text-blue-600 hover:underline"
            >
              view in {props.bagName} ↑
            </button>
          </h3>
          <Show
            when={props.contents.length > 0}
            fallback={<span class="text-xs text-gray-500">(empty)</span>}
          >
            <span
              class={`rounded-full px-2 py-0.5 text-xs font-medium ${
                stats().remaining === 0
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              {stats().packed}/{stats().total}
            </span>
          </Show>
          <button
            onClick={props.onEdit}
            class="p-1.5 text-gray-400 transition-colors hover:text-blue-600"
            title="Edit container"
            aria-label="Edit container"
          >
            <EditIcon class="h-4 w-4" />
          </button>
          <button
            onClick={props.onAdd}
            class="flex items-center justify-center rounded-full text-blue-600 hover:bg-blue-50"
            title="Add an item to this container"
          >
            <PlusIcon class="h-5 w-5" />
          </button>
        </div>
        <Show
          when={props.contents.length > 0}
          fallback={<p class="text-xs text-gray-500 md:text-sm">Empty. Tap + to add items here.</p>}
        >
          <Show when={allPacked()}>
            <AllPackedNote count={stats().total} />
          </Show>
          <ItemGrid
            items={props.showUnpackedOnly ? props.contents.filter(isUnpacked) : props.contents}
            hiddenPacked={props.showUnpackedOnly ? stats().packed : 0}
            renderCard={props.renderCard}
          />
        </Show>
      </div>
    </DropZone>
  );
}
