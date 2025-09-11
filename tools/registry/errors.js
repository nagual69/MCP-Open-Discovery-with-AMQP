// Custom error classes for plugin integrity, signature, policy, and capability issues (Phase 4)
class IntegrityError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'IntegrityError';
    if (details) this.details = details;
  }
}

class SignatureError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'SignatureError';
    if (details) this.details = details;
  }
}

class PolicyError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'PolicyError';
    if (details) this.details = details;
  }
}

class CapabilityMismatchError extends Error {
  constructor(message, diff) {
    super(message);
    this.name = 'CapabilityMismatchError';
    if (diff) this.diff = diff;
  }
}

module.exports = {
  IntegrityError,
  SignatureError,
  PolicyError,
  CapabilityMismatchError
};
