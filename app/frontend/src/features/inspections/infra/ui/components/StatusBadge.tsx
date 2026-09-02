import { Badge } from '@/shared/ui/feedback';
import {
  STATUS_BADGE_CLASSES,
  STATUS_LABELS,
  type InspectionStatus,
} from '../../../application/domain/InspectionStatus';

export function StatusBadge({ status }: { readonly status: InspectionStatus }) {
  return (
    <Badge className={STATUS_BADGE_CLASSES[status]}>{STATUS_LABELS[status]}</Badge>
  );
}
