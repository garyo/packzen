import { createSignal, onMount, type Accessor } from 'solid-js';
import { TabNav, TabPanel, type Tab } from '../ui/Tabs';
import { ItemsList } from './ItemsList';
import { CategoryManagerContent } from './CategoryManagerContent';
import { BagTemplateManagerContent } from './BagTemplateManagerContent';
import type { Category, MasterItemWithCategory, BagTemplate } from '../../lib/types';

interface AllItemsPageTabsProps {
  items: Accessor<MasterItemWithCategory[] | undefined>;
  categories: Accessor<Category[] | undefined>;
  bagTemplates: Accessor<BagTemplate[] | undefined>;
  onDeleteItem: (id: string) => void;
  onItemUpdated: (item: MasterItemWithCategory) => void;
  onItemAdded: () => void;
  onCategoriesSaved: () => void;
  onBagTemplatesSaved: () => void;
}

export function AllItemsPageTabs(props: AllItemsPageTabsProps) {
  const [activeTab, setActiveTab] = createSignal('items');

  // Read tab from URL params on mount
  onMount(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    if (tab === 'categories' || tab === 'bags' || tab === 'items') {
      setActiveTab(tab);
    }
  });

  // Handle tab change - update URL
  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.pushState({}, '', url);
    setActiveTab(tabId);
  };

  const tabs: Tab[] = [
    { id: 'items', label: 'Items', icon: '📦' },
    { id: 'categories', label: 'Categories', icon: '📁' },
    { id: 'bags', label: 'Bags', icon: '👜' },
  ];

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
