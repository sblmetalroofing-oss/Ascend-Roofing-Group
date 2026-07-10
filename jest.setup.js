import { _resetForTests } from './lib/rate-limit.js';

// The shared rate limiter keeps per-IP state in module scope; reset it so
// each test starts with a clean window.
beforeEach(() => {
    _resetForTests();
});
