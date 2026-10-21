import { randomToken, sha256 } from "./auth"
import type { Repo } from "./repo"

const KEY = "setup.link"

/**
 * One-time link printed in the server log while the owner cannot sign in with Kakao yet
 * (no owner, or an owner from before Kakao Login): whoever opens it and signs in with Kakao
 * becomes, or is linked to, the owner. Only the hash is stored, and every start that prints
 * a link replaces the previous one.
 */
export function ownerSetupNeeded(repo: Repo): boolean {
  const owner = repo.owner()
  return !owner || owner.kakaoId === null
}

export function createSetupToken(repo: Repo): string {
  const token = randomToken(24)
  repo.setSetting(KEY, sha256(token))
  return token
}

export function setupTokenValid(repo: Repo, token: string): boolean {
  if (!token || !ownerSetupNeeded(repo)) return false
  return repo.setting<string | null>(KEY, null) === sha256(token)
}

export function clearSetupToken(repo: Repo) {
  repo.setSetting(KEY, null)
}
