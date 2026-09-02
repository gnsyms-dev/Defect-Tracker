import { BrowserRouter, useRoutes } from 'react-router';
import { useAuth } from '@/features/auth/infra/di/useAuth';
import { buildRoutes } from './routes';

/**
 * Routes are DERIVED from the session's role, so the table changes at runtime.
 *
 * That rules out `createBrowserRouter`, which is designed to be created once outside
 * render: building it in a useMemo keyed on the role means a new router instance
 * whenever the role resolves, and under StrictMode the double-invoked factory leaves
 * RouterProvider holding a router whose initialization ran on a discarded instance --
 * which renders the layout with a permanently empty Outlet, silently and with no
 * warning.
 *
 * `useRoutes` re-evaluates the table on every render with no router instance and no
 * initialization step, so a role change is just a re-render. Nothing is lost by it:
 * this app uses no data-router features (no loaders, actions, or fetchers), which are
 * the only reason to prefer createBrowserRouter.
 */
function AppRoutes() {
  const { session } = useAuth();
  return useRoutes(buildRoutes(session));
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
