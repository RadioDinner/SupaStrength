// Global test setup. jest-dom matchers are only needed by jsdom component
// tests, but importing here keeps a single setup entry point; it is a no-op for
// pure `node`-environment engine tests.
import '@testing-library/jest-dom/vitest'
