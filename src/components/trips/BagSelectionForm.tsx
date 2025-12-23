import { createSignal, For, Show } from 'solid-js';
import type { BagTemplate } from '../../lib/types';
import { BAG_TYPES } from '../../lib/types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export interface CustomBagData {
  name: string;
  type: 'carry_on' | 'checked' | 'personal' | 'custom';
  color: string;
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

const BAG_COLORS = [
  { value: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { value: 'red', label: 'Red', class: 'bg-red-500' },
  { value: 'green', label: 'Green', class: 'bg-green-500' },
  { value: 'yellow', label: 'Yellow', class: 'bg-yellow-500' },
  { value: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-500' },
  { value: 'black', label: 'Black', class: 'bg-black' },
  { value: 'white', label: 'White', class: 'bg-white' },
];

export function BagSelectionForm(props: BagSelectionFormProps) {
  const [showAddForm, setShowAddForm] = createSignal(false);
  const [newBagName, setNewBagName] = createSignal('');
  const [newBagType, setNewBagType] = createSignal<'carry_on' | 'checked' | 'personal' | 'custom'>(
    'carry_on'
  );
  const [newBagColor, setNewBagColor] = createSignal('blue');
  const [saveToMyBags, setSaveToMyBags] = createSignal(true);

  const handleAddCustomBag = (e: Event) => {
    e.preventDefault();

    if (!newBagName().trim()) {
      return;
    }

    props.onAddCustomBag({
      name: newBagName().trim(),
      type: newBagType(),
      color: newBagColor(),
      saveToMyBags: saveToMyBags(),
    });

    // Reset form
    setNewBagName('');
    setNewBagType('carry_on');
    setNewBagColor('blue');
    setSaveToMyBags(true);
    setShowAddForm(false);
  };

  const totalBagsSelected = () => {
    return props.selectedTemplateIds.size + props.customBags.length;
  };

  return (
    <div class="space-y-6">
      {/* Header */}
      <div>
        <h3 class="text-lg font-semibold text-gray-900">Select Bags for Your Trip</h3>
        <p class="mt-1 text-sm text-gray-600">
          Choose from your saved bags or add new ones. You can skip this step and add bags later.
        </p>
      </div>

      {/* Templates Section */}
      <Show when={props.templates.length > 0}>
        <div>
          <h4 class="mb-3 text-sm font-medium text-gray-700">My Bags</h4>
          <div class="grid gap-3 sm:grid-cols-2">
            <For each={props.templates}>
              {(template) => {
                const isSelected = () => props.selectedTemplateIds.has(template.id);
                return (
                  <button
                    type="button"
                    onClick={() => props.onTemplateToggle(template.id)}
                    class={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-colors ${
                      isSelected()
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div
                      class={`h-4 w-4 rounded-full border border-gray-300 ${
                        BAG_COLORS.find((c) => c.value === template.color)?.class || 'bg-gray-500'
                      }`}
                    />
                    <div class="flex-1">
                      <p class="font-medium text-gray-900">{template.name}</p>
                      <p class="text-xs text-gray-500">
                        {BAG_TYPES.find((t) => t.type === template.type)?.label || template.type}
                      </p>
                    </div>
                    {isSelected() && (
                      <svg
                        class="h-5 w-5 text-blue-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
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

        {/* Add Custom Bag Form */}
        <Show when={showAddForm()}>
          <form
            onSubmit={handleAddCustomBag}
            class="mb-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3"
          >
            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Bag Name</label>
              <Input
                type="text"
                value={newBagName()}
                onInput={(e) => setNewBagName(e.currentTarget.value)}
                placeholder="e.g., Blue Backpack"
              />
            </div>

            <div class="flex items-end gap-3">
              <div class="flex-1">
                <label class="mb-1 block text-sm font-medium text-gray-700">Bag Type</label>
                <select
                  value={newBagType()}
                  onChange={(e) => setNewBagType(e.target.value as any)}
                  class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  <For each={BAG_TYPES}>
                    {(type) => <option value={type.type}>{type.label}</option>}
                  </For>
                </select>
              </div>

              <div class="flex items-center gap-1.5 pb-2">
                <input
                  type="checkbox"
                  id="save-to-my-bags"
                  checked={saveToMyBags()}
                  onChange={(e) => setSaveToMyBags(e.currentTarget.checked)}
                  class="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                  style="min-height: 25px; min-width: 25px"
                />
                <label
                  for="save-to-my-bags"
                  class="text-sm font-medium whitespace-nowrap text-gray-700"
                  title="Un-check to use this bag only on this trip"
                >
                  Save to My Bags
                </label>
              </div>
            </div>

            <div>
              <label class="mb-1 block text-sm font-medium text-gray-700">Color</label>
              <div class="flex gap-1.5">
                <For each={BAG_COLORS}>
                  {(color) => (
                    <button
                      type="button"
                      onClick={() => setNewBagColor(color.value)}
                      class={`h-4 w-4 rounded-full border border-gray-300 ${color.class} ${
                        newBagColor() === color.value
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : 'hover:scale-110'
                      } transition-transform`}
                      style="min-height: 40px; min-width: 40px"
                      title={color.label}
                    />
                  )}
                </For>
              </div>
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
                  setNewBagName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Show>

        {/* Custom Bags List */}
        <Show when={props.customBags.length > 0}>
          <div class="space-y-2">
            <For each={props.customBags}>
              {(bag, index) => (
                <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
                  <div class="flex items-center gap-3">
                    <div
                      class={`h-4 w-4 rounded-full border border-gray-300 ${
                        BAG_COLORS.find((c) => c.value === bag.color)?.class || 'bg-gray-500'
                      }`}
                    />
                    <div>
                      <p class="font-medium text-gray-900">{bag.name}</p>
                      <p class="text-xs text-gray-500">
                        {BAG_TYPES.find((t) => t.type === bag.type)?.label || bag.type}
                        {bag.saveToMyBags && (
                          <span class="ml-1 text-blue-600" title="Will be saved to My Bags">
                            • Saved
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onRemoveCustomBag(index())}
                    class="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <Show when={props.customBags.length === 0 && !showAddForm()}>
          <div class="py-4 text-center text-sm text-gray-500">
            No new bags added. Click "Add New Bag" to create one.
          </div>
        </Show>
      </div>

      {/* Navigation Buttons */}
      <div class="flex justify-between pt-4">
        <Button type="button" variant="secondary" onClick={props.onBack}>
          Back
        </Button>
        <div class="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={props.onSubmit}
            disabled={totalBagsSelected() === 0}
          >
            Skip Bags
          </Button>
          <Button type="button" onClick={props.onSubmit}>
            {totalBagsSelected() > 0 ? 'Create Trip with Bags' : 'Create Trip'}
          </Button>
        </div>
      </div>
    </div>
  );
}
