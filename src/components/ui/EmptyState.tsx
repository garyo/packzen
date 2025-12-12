import type { JSX } from 'solid-js';

interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center py-12 px-4">
      <div class="text-6xl mb-4">{props.icon}</div>
      <h3 class="text-xl font-semibold text-gray-900 mb-2">{props.title}</h3>
      <p class="text-gray-600 text-center max-w-md mb-6">{props.description}</p>
      {props.action}
    </div>
  );
}
