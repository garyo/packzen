import { createSignal, For, Show } from 'solid-js';
import type { BagTemplate } from '../../lib/types';
import { Button } from '../ui/Button';
import { CheckIcon } from '../ui/Icons';
import { showToast } from '../ui/Toast';
import { BagChip, BagFields, DEFAULT_BAG_FIELDS, type BagFieldValues } from './BagFields';

export interface CustomBagData extends BagFieldValues {
  saveToMyBags: boolean;
}

interface BagSelectionFormProps {
  templates: BagTemplate[];
  selectedTemplateIds: Set<string>;
  customBags: CustomBagData[];
  onTemplateToggle: (id: string) => void;
  onAddCustomBag: (bag: CustomBagData) => void;
  onRemoveCustomBag: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}

// One-tap starter presets shown when the user has no saved bag templates yet
// (X4: the empty bag-selection step was a 4-decision dead end for new users).
// Each one also seeds My Bags, so the next trip offers it as a saved bag.
const BAG_PRESETS: CustomBagData[] = [
  { type: 'carry_on', name: 'Carry-on', color: 'blue', saveToMyBags: true },
  { type: 'checked', name: 'Checked Bag', color: 'green', saveToMyBags: true },
  { type: 'personal', name: 'Personal Item', color: 'purple', saveToMyBags: true },
];

const selectedCardClass = (selected: boolean) =>
  `flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
    selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
  }`;

export function BagSelectionForm(props: BagSelectionFormProps) {
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newBag, setNewBag] = createSignal<BagFieldValues>(DEFAULT_BAG_FIELDS);
  const [saveToMyBags, setSaveToMyBags] = createSignal(true);

  const hasTemplates = () => props.templates.length > 0;
  const isSavedTemplateName = (name: string) =>
    props.templates.some((t) => t.name.toLowerCase() === name.trim().toLowerCase());

  // Commit whatever is typed in the add-bag form to the trip. Returns the bag
  // name if one was added, or null when the name is blank (nothing to add).
  const commitCustomBag = (): string | null => {
    const name = newBag().name.trim();
    if (!name) return null;

    props.onAddCustomBag({ ...newBag(), name, saveToMyBags: saveToMyBags() });
    setNewBag(DEFAULT_BAG_FIELDS);
    setSaveToMyBags(true);
    setShowAddForm(false);
    return name;
  };

  const handleAddCustomBag = (e: Event) => {
    e.preventDefault();
    commitCustomBag();
  };

  // Don't silently drop a bag the user filled in but didn't click "Add" on —
  // that lost bags (and their "Save to My Bags" choice) on the way to creating
  // the trip. Auto-commit the pending entry, then continue.
  const handleSubmit = () => {
    const added = commitCustomBag();
    if (added) {
      showToast('info', `Added “${added}” to this trip`);
    }
    props.onSubmit();
  };

  const totalBagsSelected = () => props.selectedTemplateIds.size + props.customBags.length;

  const presetIndex = (preset: CustomBagData) =>
    props.customBags.findIndex((b) => b.name === preset.name && b.type === preset.type);

  const togglePreset = (preset: CustomBagData) => {
    const index = presetIndex(preset);
    if (index === -1) {
      props.onAddCustomBag(preset);
    } else {
      props.onRemoveCustomBag(index);
    }
  };

  const isPreset = (bag: CustomBagData) =>
    !hasTemplates() && BAG_PRESETS.some((p) => p.name === bag.name && p.type === bag.type);

  return (
    <div class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Select Bags for Your Trip</h3>
        <p class="mt-1 text-sm text-gray-600">
          {hasTemplates()
            ? 'Choose from My Bags or add new ones.'
            : 'Add the bags you’re bringing.'}{' '}
          You can skip this step and add bags later.
        </p>
      </div>

      {/* Quick Start Presets (shown only when the user has no saved bag templates) */}
      <Show when={!hasTemplates()}>
        <div>
          <h4 class="mb-3 text-sm font-medium text-gray-700">Quick Start</h4>
          <div class="grid grid-cols-3 gap-2">
            <For each={BAG_PRESETS}>
              {(preset) => {
                const selected = () => presetIndex(preset) !== -1;
                return (
                  <button
                    type="button"
                    onClick={() => togglePreset(preset)}
                    aria-pressed={selected()}
                    class={`${selectedCardClass(selected())} relative flex-col justify-center gap-2 px-2 text-center`}
                  >
                    <BagChip bag={preset} />
                    <Show when={selected()}>
                      <CheckIcon class="absolute top-1 right-1 h-4 w-4 text-blue-600" />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
          <p class="mt-2 text-xs text-gray-500">
            Tap to add or remove. They’ll also be saved to My Bags for next time.
          </p>
        </div>
      </Show>

      {/* Templates Section */}
      <Show when={hasTemplates()}>
        <div>
          <h4 class="mb-3 text-sm font-medium text-gray-700">My Bags (tap to select)</h4>
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={props.templates}>
              {(template) => {
                const isSelected = () => props.selectedTemplateIds.has(template.id);
                return (
                  <button
                    type="button"
                    onClick={() => props.onTemplateToggle(template.id)}
                    aria-pressed={isSelected()}
                    class={selectedCardClass(isSelected())}
                  >
                    <BagChip bag={template} />
                    <Show when={isSelected()}>
                      <CheckIcon class="h-5 w-5 text-blue-600" />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>

      {/* New Bag Section */}
      <div>
        <div class="mb-3 flex items-center justify-between">
          <h4 class="text-sm font-medium text-gray-700">New Bag</h4>
          <Show when={!showAddForm()}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowAddForm(true)}
            >
              + Add New Bag
            </Button>
          </Show>
        </div>

        <Show when={showAddForm()}>
          <form
            onSubmit={handleAddCustomBag}
            class="mb-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <BagFields value={newBag()} onChange={setNewBag} />

            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="save-to-my-bags"
                checked={saveToMyBags()}
                onChange={(e) => setSaveToMyBags(e.currentTarget.checked)}
                class="btn-compact h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label for="save-to-my-bags" class="text-sm text-gray-700">
                Also save to My Bags for future trips
              </label>
            </div>

            <div class="flex gap-2">
              <Button type="submit" size="sm">
                Add
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewBag(DEFAULT_BAG_FIELDS);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Show>

        {/* Custom bags added so far (presets show as selected cards above instead) */}
        <div class="space-y-2">
          <For each={props.customBags}>
            {(bag, index) => (
              <Show when={!isPreset(bag)}>
                <div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3">
                  <BagChip
                    bag={bag}
                    note={
                      bag.saveToMyBags && !isSavedTemplateName(bag.name) ? (
                        <span class="text-blue-600">saves to My Bags</span>
                      ) : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => props.onRemoveCustomBag(index())}
                    class="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </Show>
            )}
          </For>
        </div>
      </div>

      <div class="flex justify-between pt-4">
        <Button type="button" variant="secondary" onClick={props.onBack}>
          Back
        </Button>
        <Button type="button" onClick={handleSubmit}>
          {totalBagsSelected() > 0
            ? `Create Trip with ${totalBagsSelected()} ${totalBagsSelected() === 1 ? 'Bag' : 'Bags'}`
            : 'Create Trip'}
        </Button>
      </div>
    </div>
  );
}
