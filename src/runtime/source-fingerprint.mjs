export function isApprovedSource(version, sha256, fingerprints) {
  return /^[0-9]+[.][0-9]+[.][0-9]+$/.test(version) &&
    /^[a-f0-9]{64}$/.test(sha256) &&
    Array.isArray(fingerprints[version]) &&
    fingerprints[version].includes(sha256);
}
