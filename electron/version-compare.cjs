function versionParts(version) {
  const normalized = String(version ?? '').trim().replace(/^v/iu, '')
  const match = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/u)
  if (!match) return null
  return [Number(match[1] ?? 0), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function isNewerPackVersion(candidate, current) {
  const candidateParts = versionParts(candidate)
  const currentParts = versionParts(current)
  if (!candidateParts || !currentParts) return false
  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] > currentParts[index]) return true
    if (candidateParts[index] < currentParts[index]) return false
  }
  return false
}

module.exports = { versionParts, isNewerPackVersion }
