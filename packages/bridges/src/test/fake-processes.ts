// Registry shared by the fake CLI writer and the test-only Windows spawn adapter.

/** Exact fake executable paths created by this test worker; never used by production code. */
export const fakeExecutables = new Set<string>();
