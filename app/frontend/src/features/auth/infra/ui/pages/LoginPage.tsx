import { LoginForm } from '../components/LoginForm';

export function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-text">Quality Inspections</h1>
        <p className="mt-1 text-sm text-text-muted">
          Sign in to log and track fabric defects.
        </p>
      </div>

      <LoginForm />

      {/* Accounts are seeded; there is deliberately no public registration, because a
          self-assigned role would grant defect-resolution authority. */}
      <p className="text-xs text-text-muted">
        Accounts are provisioned by your plant administrator.
      </p>
    </div>
  );
}
