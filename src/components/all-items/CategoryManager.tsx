import { Modal } from '../ui/Modal';
import { CategoryManagerContent } from './CategoryManagerContent';
import type { Category } from '../../lib/types';

interface CategoryManagerProps {
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}

export function CategoryManager(props: CategoryManagerProps) {
  return (
    <Modal title="Manage Categories" onClose={props.onClose}>
      <CategoryManagerContent categories={props.categories} onSaved={props.onSaved} />
    </Modal>
  );
}
