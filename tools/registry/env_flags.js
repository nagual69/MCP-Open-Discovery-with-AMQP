// Centralized environment flag parsing

function bool(name, def = false) {
  const v = process.env[name];
  if (typeof v === 'undefined') return def;
  return /^(1|true|yes|on)$/i.test(String(v));
}

function getFlags() {
  return {
    ALLOW_RUNTIME_DEPS: bool('PLUGIN_ALLOW_RUNTIME_DEPS', false),
    STRICT_CAPABILITIES: bool('STRICT_CAPABILITIES', bool('PLUGIN_STRICT_CAPABILITIES', false)),
    STRICT_INTEGRITY: bool('STRICT_INTEGRITY', false),
    STRICT_SBOM: bool('STRICT_SBOM', false),
    REQUIRE_SIGNATURES: bool('REQUIRE_SIGNATURES', false) || bool('PLUGIN_REQUIRE_SIGNED', false),
  };
}

module.exports = Object.assign(getFlags(), { getFlags });
