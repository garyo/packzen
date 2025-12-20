import { Modal } from '../ui/Modal';
import { BagTemplateManagerContent } from '../all-items/BagTemplateManagerContent';
import type { BagTemplate } from '../../lib/types';

interface BagTemplateManagerProps {
  templates: BagTemplate[];
  onClose: () => void;
  onSaved: () => void;
}

export function BagTemplateManager(props: BagTemplateManagerProps) {
  return (
    <Modal title="My Bags" onClose={props.onClose}>
      <BagTemplateManagerContent templates={props.templates} onSaved={props.onSaved} />
    </Modal>
  );
}
