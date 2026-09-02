import { useState } from 'react';
import { LogInspectionForm } from '../components/LogInspectionForm';
import type { LogResultBanner } from '../view-models/useLogInspectionViewModel';

export function LogInspectionPage() {
  const [, setLastResult] = useState<LogResultBanner | null>(null);

  return (
    <div>
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold text-text">Log an inspection</h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Saved on this device first, so it is never lost if you lose signal.
        </p>
      </div>
      <LogInspectionForm onLogged={setLastResult} />
    </div>
  );
}
