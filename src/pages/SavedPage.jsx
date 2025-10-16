import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where, documentId } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import ProductCard from "../components/ProductCard";
import { Link } from "react-router-dom";

export default function SavedPage() {
  const { savedIds, isSaved, toggleSave, clearAll } = useSavedProducts();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Firestore는 where(documentId(), 'in', [...])가 최대 10개씩만 가능 → 청크로 나눠서 조회
  useEffect(() => {
    const fetchSaved = async () => {
      try {
        setLoading(true);
        if (savedIds.length === 0) {
          setItems([]);
          return;
        }
        const chunks = [];
        for (let i = 0; i < savedIds.length; i += 10) {
          chunks.push(savedIds.slice(i, i + 10));
        }
        const results = [];
        for (const c of chunks) {
          const q = query(
            collection(db, "products"),
            where(documentId(), "in", c)
          );
          const snap = await getDocs(q);
          results.push(...snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
        // 저장순 유지(옵션): savedIds의 순서를 기준으로 정렬
        results.sort(
          (a, b) => savedIds.indexOf(a.id) - savedIds.indexOf(b.id)
        );
        setItems(results);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchSaved();
  }, [savedIds]);

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
          저장한 상품
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/" style={{ textDecoration: "none" }}>
            <button
              style={{
                borderRadius: 8,
                padding: "8px 10px",
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
              }}
            >
              카탈로그로
            </button>
          </Link>
          {savedIds.length > 0 && (
            <button
              onClick={clearAll}
              style={{
                borderRadius: 8,
                padding: "8px 10px",
                border: "1px solid #ef4444",
                background: "#fee2e2",
                color: "#b91c1c",
                cursor: "pointer",
              }}
            >
              전체 해제
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div>불러오는 중…</div>
      ) : items.length === 0 ? (
        <div>저장한 상품이 없습니다.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isSaved={isSaved(p.id)}
              onToggleSave={toggleSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}
