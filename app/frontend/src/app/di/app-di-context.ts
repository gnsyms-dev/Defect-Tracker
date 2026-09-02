import { createContext } from 'react';
import type { AppDependencies } from './createAppDependencies';

/**
 * The context object lives in its own module, separate from both the provider component
 * and the consumer hooks.
 *
 * That split is what lets each file export only one KIND of thing, which React Fast
 * Refresh requires to hot-reload a component file without discarding its state.
 */
export const AppDIContext = createContext<AppDependencies | null>(null);
