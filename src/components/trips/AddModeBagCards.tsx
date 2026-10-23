/**
 * AddModeBagCards Component
 *
 * Add mode's bags (and their containers): tap one to add items to it, or on
 * desktop drop items onto it. Each card shows what's in it by category.
 */

import { Show, For, createEffect, createMemo, createSignal, on, type Accessor } from 'solid-js';
import { createDroppable } from '@thisbeyond/solid-dnd';
import type { TripItem, Bag } from '../../lib/types';
import type { AddModeBagDropData, SelectedTarget } from './AddModeView';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { packingStats } from '../../lib/packing-stats';
import { byName, categoryOf, groupSorted, placeItems } from '../../lib/item-placement';
import { SwitchBagIcon } from '../ui/Icons';
import { BagChip } from '../ui/BagFields';
import { flash, pop, reveal } from '../../lib/motion';

interface AddModeBagCardsProps {
  items: Accessor<TripItem[] | undefined>;
  bags: Accessor<Bag[] | undefined>;
  onReplaceBag: (bag: Bag) => void;
  /** Where tapped items go; its card is highlighted. */
  selectedTarget: Accessor<SelectedTarget>;
  onSelectTarget: (target: SelectedTarget) => void;
}

interface BagCardProps {
  bag: Bag | null; // null for "not in a bag"
  /** The container this card represents, if it's a container card. */
  container?: TripItem;
  /** Items shown in this card (a bag's loose items, or a container's contents). */
  items: TripItem[];
  containers: TripItem[];
  contentsOf: (containerId: string) => TripItem[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  // Accordion state, passed down to nested container cards
  expandedCardId: Accessor<string | null>;
  onToggleExpandCard: (id: string) => void;
  onReplaceBag: (bag: Bag) => void;
  selectedTarget: Accessor<SelectedTarget>;
  onSelectTarget: (target: SelectedTarget) => void;
  /** Items new to the list since its last change. */
  arrived: Accessor<ReadonlySet<string>>;
}

const bagCardId = (bagId: string | null) => `add-mode-bag-${bagId ?? 'none'}`;
const containerCardId = (containerId: string) => `add-mode-container-${containerId}`;

function DroppableBagCard(props: BagCardProps) {
  const bagId = () => props.bag?.id ?? null;
  const target = (): SelectedTarget => ({
    bagId: bagId(),
    containerId: props.container?.id ?? null,
  });

  const droppable = createDroppable(
    props.container ? containerCardId(props.container.id) : bagCardId(bagId()),
    {
      type: props.container ? 'add-mode-container' : 'add-mode-bag',
      bagId: bagId(),
      containerId: props.container?.id,
    } satisfies AddModeBagDropData
  );

  const name = () => props.container?.name ?? props.bag?.name ?? NO_BAG_LABEL;
  const stats = createMemo(() => packingStats(props.items));

  // Items (not quantities) per category, alphabetical so the order stays stable
  const groupedByCategory = createMemo(() =>
    groupSorted(props.items, categoryOf).map(
      ([category, items]) => [category, [...items].sort(byName)] as const
    )
  );

  const isSelected = () => {
    const selected = props.selectedTarget();
    return selected.bagId === target().bagId && selected.containerId === target().containerId;
  };

  const select = () => props.onSelectTarget(target());

  // Point out items that arrive here: their names if the card is open,
  // otherwise their categories in the summary. (Phones hide the cards while
  // adding, so there's nothing to show there.) Deferred, so a card that mounts
  // later doesn't replay an earlier arrival.
  let card!: HTMLDivElement;
  createEffect(
    on(
      props.arrived,
      (arrived) => {
        const items = props.items.filter((item) => arrived.has(item.id));
        if (items.length === 0) return;
        requestAnimationFrame(() => {
          const shown = (selector: string) => {
            const el = card.querySelector(selector);
            return el?.getClientRects().length ? el : null;
          };
          const targets = new Set(
            items.map(
              (item) =>
                shown(`:scope > [data-contents] [data-item-id="${item.id}"]`) ??
                shown(`:scope > [data-summary] [data-category="${CSS.escape(categoryOf(item))}"]`)
            )
          );
          targets.delete(null);
          // Scroll only when everything new landed here; cards scrolling at once would fight.
          const [first, ...rest] = targets;
          if (items.length === arrived.size) reveal(first, 'nearest');
          else flash(first);
          rest.forEach(flash);
          targets.forEach(pop);
        });
      },
      { defer: true }
    )
  );

  return (
    <div
      ref={(el) => {
        card = el;
        droppable.ref(el);
      }}
      role="button"
      tabindex={0}
      aria-label={`Add items to ${name()}`}
      aria-pressed={isSelected()}
      class="cursor-pointer rounded-lg border-2 px-2 py-1.5 transition-all md:p-3"
      classList={{
        'border-blue-400 bg-blue-50 shadow-md': droppable.isActiveDroppable,
        'border-green-500 bg-green-50 ring-2 ring-green-200':
          !droppable.isActiveDroppable && isSelected(),
        'border-gray-200 bg-white hover:border-gray-300':
          !droppable.isActiveDroppable && !isSelected(),
        'ml-2 md:ml-6': !!props.container,
      }}
      onClick={(e) => {
        e.stopPropagation();
        select();
      }}
      onKeyDown={(e) => {
        // Only keys aimed at the card itself, not at controls inside it.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
    >
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="btn-compact flex h-8 w-5 flex-shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
          onClick={(e) => {
            e.stopPropagation();
            props.onToggleExpand();
          }}
          aria-label={props.isExpanded ? 'Hide contents' : 'Show contents'}
          aria-expanded={props.isExpanded}
        >
          <span class="text-xs transition-transform" classList={{ 'rotate-90': props.isExpanded }}>
            ▶
          </span>
        </button>
        <Show
          when={!props.container && props.bag}
          fallback={
            <>
              <span class="w-4 flex-shrink-0 text-center text-sm">
                {props.container ? '📦' : '👕'}
              </span>
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {name()}
              </span>
            </>
          }
        >
          {(bag) => (
            <>
              <BagChip bag={bag()} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onReplaceBag(bag());
                }}
                class="btn-compact flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                title="Replace this bag"
                aria-label={`Replace ${bag().name}`}
              >
                <SwitchBagIcon class="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </Show>
        <span class="flex-shrink-0 text-xs text-gray-500 md:text-sm">
          {stats().packed}/{stats().total}
        </span>
      </div>

      <Show
        when={groupedByCategory().length > 0}
        fallback={<div class="mt-1 pl-7 text-xs text-gray-400 italic">Empty</div>}
      >
        <div
          data-summary
          class="mt-1 hidden flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600 md:flex"
        >
          <For each={groupedByCategory()}>
            {([category, items]) => (
              <span data-category={category} class="rounded">
                {category}: <span class="font-medium">{items.length}</span>
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Expanded Contents */}
      <Show when={props.isExpanded && groupedByCategory().length > 0}>
        <div data-contents class="mt-2 border-t border-gray-100 pt-2">
          <div
            class="grid grid-cols-1 gap-x-4 gap-y-1"
            classList={{ 'md:grid-cols-2': groupedByCategory().length > 1 }}
          >
            <For each={groupedByCategory()}>
              {([category, items]) => (
                <div class="text-xs">
                  <div class="font-medium text-gray-600">{category}</div>
                  <div class="text-gray-500">
                    <For each={items}>
                      {(item, index) => (
                        <>
                          {index() > 0 && ', '}
                          <span data-item-id={item.id} class="inline-block rounded">
                            {item.name}
                            {item.quantity > 1 && ` (x${item.quantity})`}
                          </span>
                        </>
                      )}
                    </For>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Containers within this bag */}
      <Show when={props.containers.length > 0}>
        <div class="mt-1 space-y-1 md:mt-3 md:space-y-2">
          <For each={props.containers}>
            {(container) => (
              <DroppableBagCard
                bag={props.bag}
                container={container}
                items={props.contentsOf(container.id)}
                containers={[]}
                contentsOf={props.contentsOf}
                isExpanded={props.expandedCardId() === containerCardId(container.id)}
                onToggleExpand={() => props.onToggleExpandCard(containerCardId(container.id))}
                expandedCardId={props.expandedCardId}
                onToggleExpandCard={props.onToggleExpandCard}
                onReplaceBag={props.onReplaceBag}
                selectedTarget={props.selectedTarget}
                onSelectTarget={props.onSelectTarget}
                arrived={props.arrived}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

export function AddModeBagCards(props: AddModeBagCardsProps) {
  // Accordion: at most one bag or container card is expanded
  const [expandedCardId, setExpandedCardId] = createSignal<string | null>(null);
  const toggleExpand = (cardId: string) =>
    setExpandedCardId((prev) => (prev === cardId ? null : cardId));

  const placement = createMemo(() => placeItems(props.items() ?? [], props.bags() ?? []));
  const contentsOf = (containerId: string) => placement().byContainer.get(containerId) ?? [];

  // Items added since the last change, from here or elsewhere (Undo, another device)
  const [arrived, setArrived] = createSignal<ReadonlySet<string>>(new Set());
  let knownIds: Set<string> | undefined;
  createEffect(() => {
    const items = props.items();
    if (!items) return;
    const ids = new Set(items.map((item) => item.id));
    if (knownIds) setArrived(new Set([...ids].filter((id) => !knownIds!.has(id))));
    knownIds = ids;
  });

  // Bags alphabetically, then "not in a bag"
  const cards = createMemo((): (Bag | null)[] => [...[...(props.bags() ?? [])].sort(byName), null]);

  return (
    <div class="space-y-1.5 md:space-y-3">
      <h3 class="mb-2 hidden text-sm font-semibold text-gray-500 md:block">
        Choose where new items go, or drag items onto a bag
      </h3>

      <For each={cards()}>
        {(bag) => {
          const bagItems = () => placement().byBag.get(bag?.id ?? null) ?? [];
          return (
            <DroppableBagCard
              bag={bag}
              items={bagItems()}
              containers={bagItems()
                .filter((item) => item.is_container)
                .sort(byName)}
              contentsOf={contentsOf}
              isExpanded={expandedCardId() === bagCardId(bag?.id ?? null)}
              onToggleExpand={() => toggleExpand(bagCardId(bag?.id ?? null))}
              expandedCardId={expandedCardId}
              onToggleExpandCard={toggleExpand}
              onReplaceBag={props.onReplaceBag}
              selectedTarget={props.selectedTarget}
              onSelectTarget={props.onSelectTarget}
              arrived={arrived}
            />
          );
        }}
      </For>
    </div>
  );
}
