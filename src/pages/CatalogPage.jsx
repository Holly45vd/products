import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import ProductCard from "../components/ProductCard";
import { Link } from "react-router-dom";

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { savedIds, isSaved, toggleSave } = useSavedProducts();
  const [selectedTag, setSelectedTag] = useState("");

  // ✅ Firestore에서 상품 불러오기
  useEffect(() => {
    const run = async () => {
      try {
        const q = query(collection(db, "products"), orderBy("updatedAt", "desc"));
        const snap = await getDocs(q);

        const rows = snap.docs
          .map((d) => {
            const data = d.data();
            if (!data) return null; // 데이터 없는 문서 방어
            return { id: d.id, ...data };
          })
          .filter((p) => p && p.name && p.price); // 최소 필수 데이터 검증

        setItems(rows);
      } catch (e) {
        console.error("🔥 Firestore read error:", e);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  // ✅ 전체 태그 목록 수집
  const allTags = useMemo(() => {
    const set = new Set();
    items.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    set.add("재입고예정"); // 수동 태그 추가
    return Array.from(set).filter(Boolean);
  }, [items]);

  // ✅ 태그 필터링
  const filteredItems = useMemo(() => {
    if (!selectedTag) return items;
    return items.filter((p) => (p.tags || []).includes(selectedTag));
  }, [items, selectedTag]);

  // ✅ 로딩 / 결과 없음 처리 / 정상 출력
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
          상품 카탈로그
        </h1>
     
 <div style={{ display: "flex", gap: 8 }}>
          <Link to="/saved" style={{ textDecoration: "none" }}>
            <button
              style={{
                borderRadius: 8,
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
              }}
            >
              저장한 상품 ({savedIds.length})
            </button>
          </Link>
          <Link to="/edit" style={{ textDecoration: "none" }}>
            <button
              style={{
                borderRadius: 8,
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
              }}
            >
              태그 편집
            </button>
          </Link>
        </div>



      </header>

      {/* ✅ 태그 필터 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <button
          onClick={() => setSelectedTag("")}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: !selectedTag ? "#111827" : "white",
            color: !selectedTag ? "white" : "#111827",
            cursor: "pointer",
          }}
        >
          전체
        </button>

        {allTags.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(tag)}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: selectedTag === tag ? "#111827" : "white",
              color: selectedTag === tag ? "white" : "#111827",
              cursor: "pointer",
            }}
          >
            #{tag}
          </button>
        ))}
      </div>

      {loading ? (
        <div>불러오는 중…</div>
      ) : filteredItems.length === 0 ? (
        <div>해당 조건에 맞는 상품이 없습니다.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {filteredItems
            .filter((p) => p && p.id && p.name) // ✅ undefined 방어
            .map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                isSaved={isSaved(p.id)}
                onToggleSave={toggleSave}
                onTagClick={(t) => setSelectedTag(t)}
              />
            ))}
        </div>
      )}
    </div>
  );
}
