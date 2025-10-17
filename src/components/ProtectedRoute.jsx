// src/components/ProtectedRoute.jsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";

export default function ProtectedRoute({ user, allow = () => false, children }) {
  const loc = useLocation();

  // 미로그인: 홈으로 보냄(필요시 로그인 모달 띄우는 패턴도 가능)
  if (!user) return <Navigate to="/" replace state={{ from: loc }} />;

  // 권한 없음: 403 메시지
  if (!allow(user)) {
    return (
      <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>403 · 접근 권한이 없습니다</h2>
        <p style={{ color: "#6b7280" }}>
          이 페이지는 관리자 전용입니다. 필요 시 운영자에게 권한 요청하세요.
        </p>
      </div>
    );
  }
  return children;
}
