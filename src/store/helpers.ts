import type { ActivityEvent, DB, ID, Notification, Role } from '@/domain/types'
import type { DemoState, Session } from './types'

let counter = 0
/** Ids locais da demonstração. */
export function uid(prefix: string): ID {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
}

export function actorName(db: DB, session: Session): string {
  const id = session.personas[session.role]
  if (session.role === 'gestor') return db.managers[id]?.name ?? 'Gestor'
  return db.workers[id]?.name ?? 'Utilizador'
}

export function stamp(session: Session, time: string): string {
  return `${session.today}T${time}:00`
}

const MAX_ACTIVITY = 400

export function log(
  s: DemoState,
  time: string,
  kind: string,
  text: string,
  refs: ActivityEvent['refs'] = {},
  actor?: { name: string; role: ActivityEvent['role'] },
) {
  const ev: ActivityEvent = {
    id: uid('ev'),
    at: stamp(s.session, time),
    actor: actor?.name ?? actorName(s.db, s.session),
    role: actor?.role ?? s.session.role,
    kind,
    text,
    refs,
  }
  s.db.activity.unshift(ev)
  if (s.db.activity.length > MAX_ACTIVITY) s.db.activity.length = MAX_ACTIVITY
}

export function notify(
  s: DemoState,
  time: string,
  role: Role,
  personaId: ID | null,
  title: string,
  body: string,
  link: string | null,
) {
  const n: Notification = { id: uid('nt'), at: stamp(s.session, time), role, personaId, title, body, link, read: false }
  s.db.notifications.unshift(n)
  if (s.db.notifications.length > 200) s.db.notifications.length = 200
}

export { plural } from '@/lib/plural'
