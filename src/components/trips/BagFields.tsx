import { For, Show, type JSX } from 'solid-js';
import { BAG_TYPES, type BagType } from '../../lib/types';
import { BAG_COLORS, getBagColorSwatchClass } from '../../lib/color-utils';
import { Input } from '../ui/Input';

export interface BagFieldValues {
  name: string;
  type: BagType;
  color: string;
}

export const DEFAULT_BAG_FIELDS: BagFieldValues = { name: '', type: 'carry_on', color: 'blue' };

const bagTypeLabel = (type: string) => BAG_TYPES.find((t) => t.type === type)?.label || type;

/** Name, type and color inputs for creating or editing a bag. */
export function BagFields(props: {
  value: BagFieldValues;
  onChange: (value: BagFieldValues) => void;
}) {
  const update = (patch: Partial<BagFieldValues>) => props.onChange({ ...props.value, ...patch });

  return (
    <div class="space-y-3">
      <Input
        label="Bag Name"
        type="text"
        value={props.value.name}
        onInput={(e) => update({ name: e.currentTarget.value })}
        placeholder="e.g., Red Suitcase"
      />

      <div>
        <label class="mb-1 block text-sm font-medium text-gray-700">Bag Type</label>
        <select
          value={props.value.type}
          onChange={(e) => update({ type: e.currentTarget.value as BagType })}
          class="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
        >
          <For each={BAG_TYPES}>{(type) => <option value={type.type}>{type.label}</option>}</For>
        </select>
      </div>

      <div>
        <span class="mb-1 block text-sm font-medium text-gray-700">Color</span>
        <div class="flex flex-wrap gap-2">
          <For each={BAG_COLORS}>
            {(color) => (
              <button
                type="button"
                onClick={() => update({ color: color.value })}
                class={`btn-compact h-8 w-8 rounded-full border border-gray-300 ${color.class} ${
                  props.value.color === color.value
                    ? 'ring-2 ring-blue-500 ring-offset-2'
                    : 'hover:scale-110'
                } transition-transform`}
                title={color.label}
                aria-label={color.label}
                aria-pressed={props.value.color === color.value}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

/**
 * A bag's color swatch, name and type, for use inside a card or button. The
 * type line is left out when it would only repeat the name (e.g. "Carry-on").
 */
export function BagChip(props: {
  bag: { name: string; type: string; color: string | null };
  /** Extra text appended to the type line. */
  note?: JSX.Element;
}) {
  const typeLabel = () => {
    const label = bagTypeLabel(props.bag.type);
    return label.toLowerCase() === props.bag.name.trim().toLowerCase() ? null : label;
  };

  return (
    <>
      <div
        class={`h-4 w-4 flex-shrink-0 rounded-full border border-gray-300 ${getBagColorSwatchClass(props.bag.color)}`}
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium text-gray-900">{props.bag.name}</p>
        <Show when={typeLabel() || props.note}>
          <p class="truncate text-xs text-gray-500">
            {typeLabel()}
            <Show when={typeLabel() && props.note}> · </Show>
            {props.note}
          </p>
        </Show>
      </div>
    </>
  );
}
