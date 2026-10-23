import type { JSX } from 'solid-js';
import { CheckIcon } from './Icons';

/**
 * A button label that rolls up to "✓ <done>" while `rolled` is set, then back.
 * Both labels share one slot, so the button keeps its width. The change isn't
 * announced; pair it with `announce()` from Toast.
 */
export function RollLabel(props: { rolled: boolean; done: string; children: JSX.Element }) {
  return (
    <span class="roll" classList={{ 'is-rolled': props.rolled }}>
      <span aria-hidden={props.rolled}>{props.children}</span>
      <span aria-hidden={!props.rolled}>
        <CheckIcon class="h-4 w-4" />
        {props.done}
      </span>
    </span>
  );
}
