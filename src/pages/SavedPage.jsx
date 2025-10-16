// src/pages/SavedPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";

export default function SavedPage() {
  const { user, savedIds, loadingUser, loadingSaved, signOut, signIn, signUp, toggleSave } = useSavedProducts();
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  // savedIds -> products 상세 로드
  useEffect(() => {
    const fetchSaved = async () => {
      if (!user) {
        setItems([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const ids = Array.from(savedIds);
        if (ids.length === 0) {
          setItems([]);
          return;
        }
        const chunks = [];
        for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

        const results = [];
        for (const chunk of chunks) {
          const qRef = query(
            collection(db, "products"),
            where(documentId(), "in", chunk)
          );
          const snap = await getDocs(qRef);
          snap.forEach((d) => results.push({ id: d.id, ...d.data() }));
        }

        // 보기 좋게 updatedAt 기준 정렬(있으면)
        results.sort((a, b) => {
          const av = a.updatedAt?.toMillis?.() ?? 0;
          const bv = b.updatedAt?.toMillis?.() ?? 0;
          return bv - av;
        });

        setItems(results);
      } finally {
        setLoading(false);
      }
    };
    fetchSaved();
  }, [user, savedIds]);

  const filtered = useMemo(() => {
    const k = qText.trim().toLowerCase();
    if (!k) return items;
    return items.filter((p) => {
      const hay = [p.name, p.productCode, p.categoryL1, p.categoryL2, ...(p.tags || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(k);
    });
  }, [items, qText]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Navbar
        user={user}
        onlySaved={true}
        onToggleOnlySaved={() => {}}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOut}
      />

      {!user ? (
        <div style={{ marginTop: 24 }}>
          <h3>로그인이 필요합니다</h3>
          <p>상단 우측에서 로그인/회원가입을 먼저 진행하세요.</p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <input
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="저장한 상품 내 검색"
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
            />
          </div>

          {(loadingUser || loadingSaved || loading) ? (
            <div>불러오는 중…</div>
          ) : filtered.length === 0 ? (
            <div>저장한 상품이 없거나 검색 결과가 없습니다.</div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
                gap: 12,
              }}
            >
              {filtered.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  user={user}
                  isSaved={savedIds.has(p.id)}
                  onToggleSave={async (id) => {
                    try {
                      await toggleSave(id);
                    } catch (e) {
                      alert(e.message);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
