import { For, Show, type JSX } from 'solid-js';

export interface Tab {
  id: string;
  label: string;
  icon?: string;
}

interface TabNavProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

export function TabNav(props: TabNavProps) {
  return (
    <div class="border-b border-gray-200 bg-white">
      {/* Mobile: horizontal scroll, Desktop: centered */}
      <div class="scrollbar-hide overflow-x-auto md:overflow-visible">
        <div class="flex min-w-max md:min-w-0 md:justify-center">
          <For each={props.tabs}>
            {(tab) => (
              <button
                onClick={() => props.onChange(tab.id)}
                class={`flex items-center gap-2 border-b-2 px-6 py-4 text-sm font-medium whitespace-nowrap transition-colors md:px-4 md:py-3 ${
                  props.activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:border-gray-300 hover:text-gray-900'
                } `}
                role="tab"
                aria-selected={props.activeTab === tab.id}
                aria-controls={`tabpanel-${tab.id}`}
              >
                <Show when={tab.icon}>
                  <span>{tab.icon}</span>
                </Show>
                <span>{tab.label}</span>
              </button>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}

interface TabPanelProps {
  id: string;
  children: JSX.Element;
  isActive: boolean;
}

export function TabPanel(props: TabPanelProps) {
  return (
    <Show when={props.isActive}>
      <div
        id={`tabpanel-${props.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${props.id}`}
        class="py-6 md:py-4"
      >
        {props.children}
      </div>
    </Show>
  );
}
