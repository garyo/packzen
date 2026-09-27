import { createSignal, type Accessor } from 'solid-js';
import { TabNav, TabPanel, type Tab } from '../ui/Tabs';
import { ItemsList } from './ItemsList';
import { CategoryManagerContent } from './CategoryManagerContent';
import { BagTemplateManagerContent } from './BagTemplateManagerContent';
import type { Category, MasterItemWithCategory, BagTemplate } from '../../lib/types';

interface AllItemsPageTabsProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  bagTemplates: Accessor<BagTemplate[] | undefined>;
  onDeleteItem: (item: MasterItemWithCategory) => void;
  onItemUpdated: (item: MasterItemWithCategory) => void;
  onItemAdded: (item: MasterItemWithCategory) => void;
  onCategoriesSaved: () => void;
  onBagTemplatesSaved: () => void;
}

const tabs: Tab[] = [
  { id: 'items', label: 'Items', icon: '📦' },
  { id: 'categories', label: 'Categories', icon: '📁' },
  { id: 'bags', label: 'My Bags', icon: '👜' },
];

function tabFromUrl(): string {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tabs.some((t) => t.id === tab) ? tab! : 'items';
}

export function AllItemsPageTabs(props: AllItemsPageTabsProps) {
  const [activeTab, setActiveTab] = createSignal(tabFromUrl());

  // The tab is kept in the URL (so reloads and links land on it) without
  // adding history entries; Back leaves the page rather than stepping tabs.
  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.replaceState({}, '', url);
    setActiveTab(tabId);
  };

  return (
    <div>
      <TabNav tabs={tabs} activeTab={activeTab()} onChange={handleTabChange} />

      <TabPanel id="items" isActive={activeTab() === 'items'}>
        <ItemsList
          items={props.items}
          categories={props.categories}
          onDeleteItem={props.onDeleteItem}
          onItemUpdated={props.onItemUpdated}
          onItemAdded={props.onItemAdded}
        />
      </TabPanel>

      <TabPanel id="categories" isActive={activeTab() === 'categories'}>
        <CategoryManagerContent
          categories={props.categories() || []}
          onSaved={props.onCategoriesSaved}
        />
      </TabPanel>

      <TabPanel id="bags" isActive={activeTab() === 'bags'}>
        <BagTemplateManagerContent
          templates={props.bagTemplates() || []}
          onSaved={props.onBagTemplatesSaved}
        />
      </TabPanel>
    </div>
  );
}
