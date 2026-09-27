/**
 * Starter lists: a trip type's ready-made essentials in one tap. The empty
 * trip shows them full-size; Add mode's Suggestions keeps them available.
 */

import { For, Show, createMemo, createSignal, type Accessor } from 'solid-js';
import type { Bag } from '../../lib/types';
import { NO_BAG_LABEL } from '../../lib/vocabulary';
import { STARTER_TRIP_TYPES, suggestStarter, type StarterModifier } from '../../lib/built-in-items';
import { byName } from '../../lib/item-placement';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';

function Chip(props: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-pressed={props.pressed}
      class="rounded-full border px-3 py-1.5 text-sm transition-colors"
      classList={{
        'border-blue-500 bg-blue-50 text-blue-700': props.pressed,
        'border-gray-200 bg-white text-gray-600 hover:border-blue-400': !props.pressed,
      }}
    >
      {props.label}
    </button>
  );
}

/** One button per starter trip type; the suggested one is highlighted and listed first. */
export function TripTypeGrid(props: {
  onPick: (tripTypeId: string) => void;
  /** The trip type being applied; every button is disabled meanwhile. */
  busy: string | null;
  suggested?: string;
  compact?: boolean;
}) {
  const tripTypes = () => {
    const suggested = STARTER_TRIP_TYPES.find((t) => t.id === props.suggested);
    return suggested
      ? [suggested, ...STARTER_TRIP_TYPES.filter((t) => t !== suggested)]
      : STARTER_TRIP_TYPES;
  };

  return (
    <div
      class="grid gap-2"
      classList={{ 'grid-cols-2 sm:grid-cols-3': !props.compact, 'grid-cols-2': props.compact }}
    >
      <For each={tripTypes()}>
        {(tripType) => (
          <button
            type="button"
            onClick={() => props.onPick(tripType.id)}
            disabled={props.busy !== null}
            aria-busy={props.busy === tripType.id}
            class="flex flex-col items-center justify-center rounded-xl border bg-white px-3 shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            classList={{
              'py-3': !props.compact,
              'py-2': props.compact,
              'border-blue-500 ring-2 ring-blue-200': tripType.id === props.suggested,
              'border-gray-200': tripType.id !== props.suggested,
            }}
          >
            <span class="font-medium text-gray-900">{tripType.name}</span>
            <span class="text-xs text-gray-500">
              {tripType.id === props.suggested ? 'Suggested' : tripType.description}
            </span>
          </button>
        )}
      </For>
    </div>
  );
}

/** Trip-type buttons, then the options applied to the one you tap. */
export function StarterPicker(props: {
  onPick: (tripTypeId: string, modifiers: StarterModifier[]) => Promise<unknown>;
  suggested?: string;
  international?: boolean;
  compact?: boolean;
}) {
  const [busy, setBusy] = createSignal<string | null>(null);
  const [international, setInternational] = createSignal(props.international ?? false);
  const [feminine, setFeminine] = createSignal(false);
  const [masculine, setMasculine] = createSignal(false);
  const modifiers = (): StarterModifier[] => [
    ...(international() ? (['international'] as const) : []),
    ...(feminine() ? (['feminine'] as const) : []),
    ...(masculine() ? (['masculine'] as const) : []),
  ];

  const pick = async (tripTypeId: string) => {
    if (busy()) return;
    setBusy(tripTypeId);
    await props.onPick(tripTypeId, modifiers());
    setBusy(null);
  };

  return (
    <div class="flex flex-col gap-4">
      <TripTypeGrid
        onPick={pick}
        busy={busy()}
        suggested={props.suggested}
        compact={props.compact}
      />

      <div class="flex flex-wrap items-center justify-center gap-2">
        <span class="text-sm text-gray-500">Also add:</span>
        <Chip
          label="🌍 International"
          pressed={international()}
          onToggle={() => setInternational((v) => !v)}
        />
        <Chip
          label="Feminine clothing"
          pressed={feminine()}
          onToggle={() => setFeminine((v) => !v)}
        />
        <Chip
          label="Masculine clothing"
          pressed={masculine()}
          onToggle={() => setMasculine((v) => !v)}
        />
      </div>
    </div>
  );
}

interface StarterListPanelProps {
  tripName: string;
  bags: Accessor<Bag[] | undefined>;
  /** Add a starter list to a bag (null = not in a bag); resolves to how many were added. */
  onAddStarter: (
    tripTypeId: string,
    modifiers: StarterModifier[],
    bagId: string | null
  ) => Promise<number>;
  /** Switch to Add mode. */
  onAddItems: () => void;
}

/** The empty trip: pick a starter list, or dismiss to an empty list. */
export function StarterListPanel(props: StarterListPanelProps) {
  const [dismissed, setDismissed] = createSignal(false);
  const suggestion = createMemo(() => suggestStarter(props.tripName));

  // The first bag, as the list shows them, unless the selector (shown with
  // 2+ bags) says otherwise; null = not in a bag.
  const [chosenBagId, setChosenBagId] = createSignal<string | null | undefined>(undefined);
  const sortedBags = createMemo(() => [...(props.bags() ?? [])].sort(byName));
  const targetBagId = () => {
    const chosen = chosenBagId();
    if (chosen === null || sortedBags().some((bag) => bag.id === chosen)) return chosen ?? null;
    return sortedBags()[0]?.id ?? null;
  };

  const addStarter = async (tripTypeId: string, modifiers: StarterModifier[]) => {
    const added = await props.onAddStarter(tripTypeId, modifiers, targetBagId());
    // The new list replaces this panel; start it at the top.
    if (added > 0) document.querySelector('main')?.scrollTo({ top: 0 });
  };

  return (
    <Show
      when={!dismissed()}
      fallback={
        <EmptyState
          icon="📦"
          title="No items yet"
          description="Pick items from your saved items or Suggestions."
          action={<Button onClick={props.onAddItems}>Add items</Button>}
        />
      }
    >
      <div class="mx-auto max-w-xl px-2 py-6 text-center">
        <h3 class="mb-1 text-xl font-semibold text-gray-900">What kind of trip?</h3>
        <p class="mb-5 text-gray-600">Tap one to start with a ready-made list of essentials.</p>

        {/* Keyed on the name, so a renamed trip gets its own suggestion. */}
        <Show when={suggestion()} keyed>
          {(suggested) => (
            <StarterPicker
              onPick={addStarter}
              suggested={suggested.tripTypeId}
              international={suggested.international}
            />
          )}
        </Show>

        <Show when={sortedBags().length >= 2}>
          <label class="mt-4 flex items-center justify-center gap-2 text-sm text-gray-600">
            Put them in
            <select
              value={targetBagId() ?? ''}
              onChange={(e) => setChosenBagId(e.currentTarget.value || null)}
              class="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <For each={sortedBags()}>{(bag) => <option value={bag.id}>{bag.name}</option>}</For>
              <option value="">{NO_BAG_LABEL}</option>
            </select>
          </label>
        </Show>
        <Show when={sortedBags().length === 1}>
          <p class="mt-4 text-sm text-gray-500">They'll go in {sortedBags()[0].name}.</p>
        </Show>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          class="mt-6 min-h-11 text-sm text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline"
        >
          I’ll add my own
        </button>
      </div>
    </Show>
  );
}
