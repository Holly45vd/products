// src/hooks/authz.js
export const ADMIN_UIDS = new Set([
  // Firebase Auth UID 화이트리스트 (있으면 추가)
  // "abcdEfghIjklMNOPQRSTuvwxYZ123456",
]);

export const ADMIN_EMAILS = new Set([
  // 이메일 화이트리스트
  "k36801377@gmail.com",
]);

export function isAdmin(user) {
  if (!user) return false;
  return ADMIN_UIDS.has(user.uid) || ADMIN_EMAILS.has(user.email);
}
