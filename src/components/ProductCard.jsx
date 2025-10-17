// src/components/ProductCard.jsx
import React from "react";

export default function ProductCard({
  product,
  user,                 // 로그인 여부 확인용
  isSaved = false,
  onToggleSave,
  onTagClick,
  // 선택: 상위(CatalogPage)에서 판별해 내려보낼 수 있음. 없으면 내부에서 tags로 자동 판별
  restockPending,
}) {
  const {
    id,
    name,
    price,
    imageUrl,
    tags = [],
    link,
    categoryL1,
    categoryL2,
  } = product || {};

  // --- 유틸: 재입고 예정 판별 ---
  const hasRestockKeyword = (v) => {
    if (!v) return false;
    const s = Array.isArray(v) ? v.join(" ") : String(v);
    return /재입고\s*예정|재입고예정/i.test(s);
  };
  const _restockPending = typeof restockPending === "boolean"
    ? restockPending
    : hasRestockKeyword(tags);

  // 로그인 필요 시 경고 후 차단
  const tryToggle = () => {
    if (!user) {
      alert("로그인이 필요합니다.");
      return;
    }
    onToggleSave && onToggleSave(id);
  };

  const fmtKRW = (n) =>
    typeof n === "number" ? n.toLocaleString("ko-KR") + "원" : "-";

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        background: "#fff",
      }}
    >
      {/* 이미지 링크 영역 */}
      <a
        href={link || "#"}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          background: "#f9fafb",
          borderRadius: 8,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textDecoration: "none",
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: _restockPending ? "grayscale(80%)" : "none",
            }}
          />
        ) : (
          <span style={{ color: "#9ca3af" }}>No Image</span>
        )}

        {/* 재입고 예정 오버레이 */}
        {_restockPending && (
          <div
            title="재입고 예정"
            aria-label="재입고 예정"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(55,65,81,0.45)", // 회색 반투명
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 0.5,
            }}
          >
            재입고 예정
          </div>
        )}
      </a>

      {/* 제목 */}
      <div style={{ fontWeight: 600, color: _restockPending ? "#374151" : "#111827" }}>
        {name}
      </div>

      {/* 카테고리 배지 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {categoryL1 && (
          <span
            style={{
              fontSize: 12,
              background: "#eef2ff",
              border: "1px solid #e5e7eb",
              padding: "2px 8px",
              borderRadius: 9999,
            }}
          >
            L1: {categoryL1}
          </span>
        )}
        {categoryL2 && (
          <span
            style={{
              fontSize: 12,
              background: "#ecfeff",
              border: "1px solid #e5e7eb",
              padding: "2px 8px",
              borderRadius: 9999,
            }}
          >
            L2: {categoryL2}
          </span>
        )}

        {/* 본문 배지(텍스트) */}
        {_restockPending && (
          <span
            style={{
              fontSize: 12,
              background: "#f3f4f6",
              border: "1px solid #e5e7eb",
              padding: "2px 8px",
              borderRadius: 9999,
              color: "#374151",
            }}
          >
            재입고 예정
          </span>
        )}
      </div>

      {/* 가격 */}
      <div style={{ color: "#111827" }}>{fmtKRW(price)}</div>

      {/* 태그 목록 */}
      {tags.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => onTagClick && onTagClick(t)}
              style={{
                fontSize: 12,
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
                padding: "2px 8px",
                borderRadius: 9999,
                cursor: "pointer",
              }}
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      {/* 저장 버튼 */}
      <button
        onClick={tryToggle}
        style={{
          marginTop: 6,
          borderRadius: 8,
          padding: "8px 10px",
          border: "1px solid #e5e7eb",
          background: isSaved ? "#111827" : "white",
          color: isSaved ? "white" : "#111827",
          cursor: "pointer",
        }}
      >
        {isSaved ? "저장 해제" : "저장하기"}
      </button>
    </div>
  );
}
