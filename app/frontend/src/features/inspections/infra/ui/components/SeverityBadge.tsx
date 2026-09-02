import { Badge } from '@/shared/ui/feedback';
import {
  SEVERITY_BADGE_CLASSES,
  SEVERITY_LABELS,
  type Severity,
} from '../../../application/domain/Severity';

export function SeverityBadge({ severity }: { readonly severity: Severity }) {
  // The label is always present, so colour is never the only carrier of meaning.
  return (
    <Badge className={SEVERITY_BADGE_CLASSES[severity]}>
      {SEVERITY_LABELS[severity]}
    </Badge>
  );
}
