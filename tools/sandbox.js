// Lightweight sandbox availability detector
// This is a stub that can be extended to probe real sandbox capability
// For now, it respects an env override, and can be swapped by tests.

function isAvailable() {
  // In a container, you might check capabilities or presence of a seccomp profile
  // Here we allow override via env for CI: SANDBOX_AVAILABLE=true
  return /^(1|true)$/i.test(process.env.SANDBOX_AVAILABLE || '');
}

module.exports = { isAvailable };
