'use strict';

/** Error with a stable machine-readable `code` the client can translate. */
class GadhaError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GadhaError';
    this.code = code;
  }
}

module.exports = { GadhaError };
