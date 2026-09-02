import '@testing-library/jest-dom/vitest';
// jsdom has no IndexedDB implementation, so the outbox and cache stores are tested
// against a real (in-memory) one rather than a hand-written mock. Testing the actual
// store is the point: transaction and index behaviour is where the bugs are.
import 'fake-indexeddb/auto';
