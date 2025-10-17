// src/pages/SavedPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";

// 안전한 Timestamp → number(ms) 변환
function tsToMs(ts) {
if (!ts) return 0;
if (typeof ts?.toMillis === "function") return ts.toMillis();
// serverTimestamp 직후 미해결일 수 있음
const v = Number(ts);
return Number.isFinite(v) ? v : 0;
}

function chunk10(arr) {
const out = [];
for (let i = 0; i < arr.length; i += 10) out.push(arr.slice(i, i + 10));
return out;
}

export default function SavedPage() {
const {
user,
savedIds, // Set<string>
loadingUser,
loadingSaved,
signOut,
signIn,
signUp,
toggleSave,
} = useSavedProducts();

const [items, setItems] = useState([]); // [{ id, ...data }]
const [qText, setQText] = useState("");
const [loading, setLoading] = useState(true);
const [errorMsg, setErrorMsg] = useState("");

// savedIds(Set) → 안정적인 배열 메모
const savedIdList = useMemo(() => Array.from(savedIds || new Set()), [savedIds]);

// 디바운스 검색어
const [debouncedQ, setDebouncedQ] = useState("");
useEffect(() => {
const t = setTimeout(() => setDebouncedQ(qText.trim().toLowerCase()), 300);
return () => clearTimeout(t);
}, [qText]);

// 저장 목록 상세 로드
const runIdRef = useRef(0);
useEffect(() => {
let canceled = false;
const myRun = ++runIdRef.current;
const fetchSaved = async () => {
  setErrorMsg("");
  if (!user) {
    setItems([]);
    setLoading(false);
    return;
  }
  setLoading(true);
  try {
    if (!savedIdList.length) {
      setItems([]);
      return;
    }

    const chunks = chunk10(savedIdList);
    // 병렬화
    const snaps = await Promise.all(
      chunks.map((ids) =>
        getDocs(
          query(collection(db, "products"), where(documentId(), "in", ids))
        )
      )
    );

    const results = [];
    snaps.forEach((snap) => {
      snap.forEach((d) => results.push({ id: d.id, ...d.data() }));
    });

      const foundIds = new Set(results.map(r => r.id));
     const missingCount = savedIdList.filter(id => !foundIds.has(id)).length;


    // 정렬: updatedAt > createdAt > id(문자열 기준)
    results.sort((a, b) => {
      const av =
        tsToMs(a.updatedAt) || tsToMs(a.createdAt) || 0;
      const bv =
        tsToMs(b.updatedAt) || tsToMs(b.createdAt) || 0;
      if (bv !== av) return bv - av;
      // fallback: 문자열 비교(안정적)
      return String(b.id).localeCompare(String(a.id));
    });

    if (!canceled && myRun === runIdRef.current) {
      setItems(results);
             // 누락 안내는 에러가 아님 → 별도 메시지
       if (missingCount > 0) {
          setErrorMsg(`알림: 저장된 ${savedIdList.length}개 중 ${missingCount}개는 현재 조회할 수 없습니다(삭제/권한/비공개 가능).`);
       }
    }
  } catch (e) {
    if (!canceled && myRun === runIdRef.current) {
      console.error(e);

        const msg = String(e?.message || "");
       const hint =
         /per-query|disjunct/i.test(msg) ? " (힌트: Firestore 'in' 조건은 10개씩 끊어 처리해야 합니다.)"
        : /permission|denied|insufficient/i.test(msg) ? " (힌트: 인증/규칙 권한을 확인하세요.)"
         : "";        setErrorMsg(`오류: ${msg || "목록을 불러오는 중 문제가 발생했습니다."}${hint}`);
        setItems([]);
    }
  } finally {
    if (!canceled && myRun === runIdRef.current) {
      setLoading(false);
    }
  }
};

fetchSaved();
return () => {
  canceled = true;
};
}, [user, savedIdList]);

// 필터: 미리 소문자 캐시
const itemsForFilter = useMemo(
() =>
items.map((p) => ({
raw: p,
hay: [
p.name,
p.productCode,
p.categoryL1,
p.categoryL2,
...(p.tags || []),
]
.filter(Boolean)
.join(" ")
.toLowerCase(),
})),
[items]
);

const filtered = useMemo(() => {
if (!debouncedQ) return items;
return itemsForFilter
.filter((x) => x.hay.includes(debouncedQ))
.map((x) => x.raw);
}, [items, itemsForFilter, debouncedQ]);

// 낙관적 토글: 즉시 반영 후 실패 시 롤백
const handleToggleSave = async (id) => {
const wasSaved = savedIds?.has(id);
try {
await toggleSave(id);
} catch (e) {
// 롤백 안내 (실제 savedIds는 훅 내부 상태이므로 여기선 안내만)
alert(e?.message || "저장 상태 변경 중 오류가 발생했습니다.");
// 필요 시 훅을 수정해 낙관적 상태를 지원하도록 개선 가능
}
};

const savedTotal = savedIdList.length;

const PAGE = 60; // 한 번에 60개 문서
const [page, setPage] = useState(1);
const pagedIds = useMemo(
  () => savedIdList.slice(0, PAGE * page),
  [savedIdList, page]
);

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <input
          aria-label="저장한 상품 검색"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="저장한 상품 내 검색"
          style={{
            flex: 1,
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        />
        {qText && (
          <button
            onClick={() => setQText("")}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 10px",
              background: "#fafafa",
              cursor: "pointer",
            }}
            aria-label="검색어 지우기"
          >
            지우기
          </button>
        )}
      </div>

      {errorMsg && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 8,
          }}
        >
          {errorMsg}
        </div>
      )}

      {(loadingUser || loadingSaved || loading) ? (
        <div>불러오는 중…</div>
      ) : (
        <>
          <div style={{ marginBottom: 8, color: "#6b7280" }}>
            총 저장: <strong>{savedTotal}</strong>개
            {debouncedQ && (
              <>
                {" · "}검색 결과: <strong>{filtered.length}</strong>개
              </>
            )}
          </div>

          {filtered.length === 0 ? (
            <div>
              {savedTotal === 0
                ? "저장한 상품이 없습니다."
                : "검색 결과가 없습니다. 다른 키워드를 시도해 보세요."}
            </div>
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
                  isSaved={savedIds?.has(p.id)}
                  onToggleSave={handleToggleSave}
                />
              ))}
              {PAGE * page < savedTotal && <button onClick={() => setPage(p => p + 1)}>더보기</button>}
            </div>
          )}
        </>
      )}
    </>
  )}
</div>
);
}