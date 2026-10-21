export type Role = "owner" | "member"

export interface Me {
  id: string
  displayName: string
  role: Role
  kakao: KakaoProfileDto | null
}

/** The Kakao account an account signs in with (nickname and photo as of the last login). */
export interface KakaoProfileDto {
  nickname: string
  image: string | null
}

export interface AuthOptions {
  /** No owner yet: open the setup link from the server log. */
  setupNeeded: boolean
  /** KAKAO_REST_API_KEY is set. */
  kakao: boolean
}

export type RoomKind = "group" | "direct" | "open" | "memo" | "other"

export interface RoomDto {
  id: string
  name: string
  enabled: boolean
  kind?: RoomKind
  /** Owner only. */
  chatId?: string
  /**
   * Owner only: whether members see this room by default. When off, only the owner and members the
   * owner chose it for (UserDto.roomIds) see it.
   */
  memberVisible?: boolean
  /** Owner only: the bot may send to this room (SEND_ROOMS allows it, or SEND_ROOMS is empty). */
  canSend?: boolean
}

export interface DiscoveredRoom {
  chatId: string
  name: string
  kind: RoomKind
  members: number
  lastActiveAt: number | null
  /** Last text message, for rooms whose name could not be worked out. */
  preview?: string
  registeredId?: string
}

export interface UserDto {
  id: string
  displayName: string
  role: Role
  disabled: boolean
  createdAt: number
  kakao: KakaoProfileDto | null
  /** The rooms this member may see; null for every room not hidden from members. The owner sees every room. */
  roomIds: string[] | null
}

export interface NameAliasDto {
  userId: string
  alias: string | null
  kakaoName: string | null
  lastRoom: string | null
  lastSeenAt: number | null
}

/** Send limits; null turns a limit off. */
export interface Limits {
  /** Messages per room per minute. */
  roomPerMinute: number | null
  /** Messages the whole bot may send per minute. */
  globalPerMinute: number | null
}

export const DEFAULT_LIMITS = { roomPerMinute: 20, globalPerMinute: 60 } as const satisfies Limits

export interface SystemStatus {
  iris: {
    connected: boolean
    lastEventAt: number | null
    botName?: string
  }
  paused: boolean
  sendMode: "live" | "dry"
  /** Names of the rooms the bot may send to, or null when every room is allowed. */
  sendRooms: string[] | null
  counts: { rooms: number; messagesToday: number }
  limits: Limits
}

export interface AuditEntry {
  id: number
  at: number
  user: string
  action: string
  target: string | null
  detail: string | null
}
