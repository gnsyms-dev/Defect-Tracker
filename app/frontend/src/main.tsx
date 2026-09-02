import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from './app/AppRoot';
import { assertDefined } from './shared/lib/assert';
import './index.css';

// assertDefined rather than the template's `document.getElementById('root')!`:
// the project's TypeScript standards ban non-null assertions, and this fails with a
// message that says what actually went wrong.
const container = assertDefined(
  document.getElementById('root'),
  'Root element #root was not found in index.html',
);

createRoot(container).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
);
