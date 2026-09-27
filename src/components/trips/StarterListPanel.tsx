/**
 * Empty-trip state: add a trip type's starter essentials in one tap, or
 * dismiss to an empty list.
 */

import { For, Show, createMemo, createSignal, type Accessor } from 'solid-js';
import type { Bag, BuiltInItem, TripItem } from '../../lib/types';
import type { TripItemsStore } from '../../lib/trip-items-store';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import {
  builtInItems,
  getStarterItems,
  getStarterQuantity,
  type StarterModifier,
} from '../../lib/built-in-items';
import { EmptyState } from '../ui/EmptyState';
import { showToast } from '../ui/Toast';

const TOILETRY_CATEGORY = 'Toiletries';
const TOILET_KIT = 'Toilet Kit';
const isToiletry = (item: BuiltInItem) => item.category === TOILETRY_CATEGORY && !item.is_container;

const STARTER_TRIP_TYPES = builtInItems.trip_types.filter((t) => t.id !== 'international');

interface StarterListPanelProps {
  store: TripItemsStore;
  bags: Accessor<Bag[] | undefined>;
  /** Create any of these categories that don't exist yet (with built-in icons). */
  ensureCategories: (names: string[]) => Promise<void>;
}

function Chip(props: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-pressed={props.pressed}
      class="rounded-full border px-3 py-1 text-sm transition-colors"
      classList={{
        'border-blue-500 bg-blue-50 text-blue-700': props.pressed,
        'border-gray-200 bg-white text-gray-600 hover:border-blue-400': !props.pressed,
      }}
    >
      {props.label}
    </button>
  );
}

export function StarterListPanel(props: StarterListPanelProps) {
  const [dismissed, setDismissed] = createSignal(false);
  const [adding, setAdding] = createSignal<string | null>(null);
  // Additive modifiers, chosen before tapping a trip type.
  const [international, setInternational] = createSignal(false);
  const [feminine, setFeminine] = createSignal(false);
  const [masculine, setMasculine] = createSignal(false);
  const modifiers = (): StarterModifier[] => [
    ...(international() ? (['international'] as const) : []),
    ...(feminine() ? (['feminine'] as const) : []),
    ...(masculine() ? (['masculine'] as const) : []),
  ];

  // Starter items go into the chosen bag: the first by sort order unless the
  // selector (shown with 2+ bags) says otherwise; null = not in a bag.
  const [chosenBagId, setChosenBagId] = createSignal<string | null | undefined>(undefined);
  const sortedBags = createMemo(() =>
    [...(props.bags() ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  );
  const targetBagId = () => {
    const chosen = chosenBagId();
    if (chosen === null || sortedBags().some((bag) => bag.id === chosen)) return chosen;
    return sortedBags()[0]?.id ?? null;
  };

  // Deduped by name against the trip, so repeat taps never duplicate items.
  const addStarterList = async (tripTypeId: string) => {
    if (adding()) return;
    const tripItems = props.store.items() ?? [];
    const existingNames = new Set(tripItems.map((i) => i.name.toLowerCase()));
    const starter = getStarterItems(tripTypeId, modifiers()).filter(
      (item) => !existingNames.has(item.name.toLowerCase())
    );
    if (starter.length === 0) {
      showToast('info', 'Those items are already on your list');
      return;
    }

    setAdding(tripTypeId);
    const bagId = targetBagId();
    await props.ensureCategories([...new Set(starter.map((item) => item.category))]);

    // Toiletries arrive grouped in a Toilet Kit, reusing one already on the trip.
    let kit: TripItem | undefined;
    let createdKit: TripItem | undefined;
    if (starter.some(isToiletry)) {
      kit = tripItems.find((i) => i.is_container && i.name.toLowerCase() === 'toilet kit');
      if (!kit) {
        const created = await props.store.addItems([
          { name: TOILET_KIT, category_name: TOILETRY_CATEGORY, is_container: true, bag_id: bagId },
        ]);
        kit = createdKit = created?.[0];
      }
    }

    const inKit = (item: BuiltInItem) => !!kit && isToiletry(item);
    const added = await props.store.addItems(
      starter.map((item) => ({
        name: item.name,
        category_name: item.category,
        quantity: getStarterQuantity(item, tripTypeId),
        notes: item.description,
        is_container: item.is_container ?? false,
        bag_id: inKit(item) ? null : bagId,
        container_item_id: inKit(item) ? kit!.id : null,
      }))
    );

    if (added) {
      showToast('success', `Added ${added.length + (createdKit ? 1 : 0)} items`);
    } else if (createdKit) {
      // Don't leave a new container behind, empty, when its items failed.
      await props.store.deleteItems([createdKit.id], {
        label: `Removed ${TOILET_KIT}`,
        quiet: true,
      });
    }
    setAdding(null);
  };

  return (
    <Show
      when={!dismissed()}
      fallback={
        <EmptyState
          icon="📦"
          title="No items yet"
          description="Tap Add above to build your packing list."
        />
      }
    >
      <div class="mx-auto max-w-2xl px-4 py-10 text-center">
        <div class="mb-3 text-5xl">🧳</div>
        <h3 class="mb-1 text-xl font-semibold text-gray-900">Start your packing list</h3>
        <p class="mb-5 text-gray-600">Add a ready-made set of essentials in one tap.</p>

        {/* Optional add-ons in their own labeled card, so they read as
            settings for your pick — not as part of the main choice. */}
        <div class="mx-auto mb-6 max-w-md rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
          <p class="mb-3 text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Options (applied to your pick)
          </p>
          <div class="flex flex-col gap-3">
            <div class="flex items-center gap-3">
              <span class="w-24 shrink-0 text-sm text-gray-500">Trip style:</span>
              <Chip
                label="🌍 International"
                pressed={international()}
                onToggle={() => setInternational((v) => !v)}
              />
            </div>
            <div class="flex items-center gap-3">
              <span class="w-24 shrink-0 text-sm text-gray-500">Add clothing:</span>
              <div class="flex flex-wrap gap-2">
                <Chip
                  label="Feminine"
                  pressed={feminine()}
                  onToggle={() => setFeminine((v) => !v)}
                />
                <Chip
                  label="Masculine"
                  pressed={masculine()}
                  onToggle={() => setMasculine((v) => !v)}
                />
              </div>
            </div>
            {/* Which bag the essentials go into — a selector when there's a
                choice, otherwise the single bag's name as confirmation. */}
            <Show when={sortedBags().length >= 1}>
              <div class="flex items-center gap-3">
                <span class="w-24 shrink-0 text-sm text-gray-500">Add to bag:</span>
                <Show
                  when={sortedBags().length >= 2}
                  fallback={
                    <span class="text-sm font-medium text-gray-900">{sortedBags()[0]?.name}</span>
                  }
                >
                  <select
                    id="starter-bag-select"
                    value={targetBagId() ?? ''}
                    onChange={(e) => setChosenBagId(e.currentTarget.value || null)}
                    class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  >
                    <For each={sortedBags()}>
                      {(bag) => <option value={bag.id}>{bag.name}</option>}
                    </For>
                    <option value="">{NO_BAG_LABEL}</option>
                  </select>
                </Show>
              </div>
            </Show>
          </div>
        </div>

        <p class="mb-3 text-sm font-medium text-gray-700">Pick a trip type:</p>
        <div class="flex flex-wrap justify-center gap-2 sm:gap-3">
          <For each={STARTER_TRIP_TYPES}>
            {(tripType) => (
              <button
                type="button"
                onClick={() => addStarterList(tripType.id)}
                disabled={adding() !== null}
                aria-busy={adding() === tripType.id}
                class="flex min-w-[7rem] flex-col items-center rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span class="font-medium text-gray-900">{tripType.name}</span>
                <span class="mt-0.5 text-xs text-gray-500">{tripType.description}</span>
              </button>
            )}
          </For>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          class="mt-6 text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
        >
          I’ll add my own
        </button>
      </div>
    </Show>
  );
}
