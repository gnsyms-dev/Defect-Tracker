import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { AuthProvider } from '@/features/auth/infra/di/AuthProvider';
import { SyncProvider } from '@/shared/offline/infra/ui/SyncProvider';
import { ErrorState } from '@/shared/ui/feedback';
import { AppDIProvider } from './di/AppDIContext';
import { useAppDI } from './di/useAppDI';
import { AppRouter } from './AppRouter';
import { UpdatePrompt } from './components/UpdatePrompt';

/**
 * A class component because that is the only way to implement an error boundary --
 * the one place in this codebase where a class is not a choice.
 */
class ErrorBoundary extends Component<PropsWithChildren, { hasError: boolean }> {
  constructor(props: PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged rather than swallowed: an empty catch would hide exactly the bugs this
    // boundary exists to surface.
    console.error('Unhandled UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorState
          title="Something went wrong"
          description="Reload the app to continue. Anything you saved on this device is still safe."
        />
      );
    }
    return this.props.children;
  }
}

/** Bridges the DI graph into AuthProvider, which needs pieces of it. */
function AuthLayer({ children }: PropsWithChildren) {
  const dependencies = useAppDI();

  return (
    <AuthProvider
      authRepository={dependencies.authRepository}
      sessionStore={dependencies.sessionStore}
      tokenHolder={dependencies.tokenHolder}
      unauthorizedNotifier={dependencies.unauthorizedNotifier}
      onAuthenticated={(userId) => {
        // Infra needs to know who the viewer is (for cache scoping and for flushing
        // only that user's queue) without importing a React context.
        dependencies.setCurrentUserId(userId);
        void dependencies.syncEngine.requestFlush('authenticated');
      }}
    >
      {children}
    </AuthProvider>
  );
}

export function AppRoot() {
  return (
    <ErrorBoundary>
      <AppDIProvider>
        <AuthLayer>
          <SyncProvider>
            <AppRouter />
            <UpdatePrompt />
          </SyncProvider>
        </AuthLayer>
      </AppDIProvider>
    </ErrorBoundary>
  );
}
