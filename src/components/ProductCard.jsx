import React from "react";

export default function ProductCard({ product, isSaved, onToggleSave, onTagClick }) {
  const { id, name, price, imageUrl, tags = [], link } = product;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <a
        href={link || "#"}
        target="_blank"
        rel="noopener noreferrer"
        style={{
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
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "#9ca3af" }}>No Image</span>
        )}
      </a>

      <div style={{ fontWeight: 600 }}>{name}</div>
      <div style={{ color: "#111827" }}>
        {typeof price === "number" ? price.toLocaleString() + "원" : "-"}
      </div>

      {tags?.length > 0 && (
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

      <button
        onClick={() => onToggleSave(id)}
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
