import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { SUT_DIR } from './env';

const dbPath = path.resolve(SUT_DIR, 'backend', 'database.sqlite');

function open() {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export type UserRow = { id: number; email: string; login_attempts: number; locked_until: string | null };

export function getUser(email: string): UserRow {
  const db = open();
  try {
    return db.prepare('SELECT id, email, login_attempts, locked_until FROM users WHERE email = ?').get(email) as UserRow;
  } finally {
    db.close();
  }
}

export function isLocked(u: UserRow): boolean {
  return !!u.locked_until && new Date(u.locked_until).getTime() > Date.now();
}

export function lockRemainingSeconds(u: UserRow): number {
  return u.locked_until ? (new Date(u.locked_until).getTime() - Date.now()) / 1000 : 0;
}

/** Đặt trạng thái ban đầu của tài khoản (bộ đếm sai, thời gian còn khóa). */
export function setUserState(email: string, state: { attempts?: number; lockedForSeconds?: number }) {
  const lockedUntil = state.lockedForSeconds ? new Date(Date.now() + state.lockedForSeconds * 1000).toISOString() : null;
  const db = open();
  try {
    db.prepare('UPDATE users SET login_attempts = ?, locked_until = ? WHERE email = ?').run(state.attempts ?? 0, lockedUntil, email);
  } finally {
    db.close();
  }
}

export function resetUser(email: string) {
  setUserState(email, { attempts: 0 });
}
