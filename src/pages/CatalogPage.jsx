// src/pages/CatalogPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import Navbar from "../components/Navbar";
import ProductCard from "../components/ProductCard";

/** 카테고리 맵 (필터용) */
const CATEGORY_MAP = {
  "청소/욕실": ["청소용품(세제/브러쉬)", "세탁용품(세탁망/건조대)", "욕실용품(발매트/수건)", "휴지통/분리수거"],
  "수납/정리": ["수납박스/바구니", "리빙박스/정리함", "틈새수납", "옷걸이/선반", "주방수납", "냉장고 정리"],
  "주방용품": ["식기(접시/그릇)", "컵/물병/텀블러", "밀폐용기", "조리도구(칼/가위)", "주방잡화(행주/수세미)"],
  "문구/팬시": ["필기구/노트", "사무용품(파일/서류)", "포장용품", "디자인 문구", "전자기기 액세서리"],
  "뷰티/위생": ["스킨/바디케어", "마스크팩", "화장소품(브러쉬)", "메이크업", "위생용품(마스크/밴드)"],
  "패션/잡화": ["의류/언더웨어", "가방/파우치", "양말/스타킹", "패션소품(액세서리)", "슈즈용품"],
  "인테리어/원예": ["홈데코(쿠션/커튼)", "액자/시계", "원예용품(화분/씨앗)", "조명", "시즌 데코"],
  "공구/디지털": ["공구/안전용품", "차량/자전거 용품", "디지털 액세서리(케이블/충전기)", "전지/건전지"],
  "스포츠/레저/취미": ["캠핑/여행용품", "스포츠/헬스용품", "DIY/취미용품", "뜨개/공예", "반려동물용품"],
  "식품": ["과자/초콜릿", "음료/주스", "라면/즉석식품", "건강식품", "견과류"],
  "유아/완구": ["아동/유아용품", "완구/장난감", "교육/학습용품"],
  "시즌/시리즈": ["봄/여름 기획", "전통 시리즈", "캐릭터 컬래버"],
  "베스트/신상품": ["인기 순위 상품", "신상품"],
};

function tokenizeTags(input = "") {
  return String(input)
    .split(/[,|#/ ]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** 재입고 예정 판별 유틸 */
const hasRestockKeyword = (v) => {
  if (!v) return false;
  const s = Array.isArray(v) ? v.join(" ") : String(v);
  return /재입고\s*예정|재입고예정/i.test(s);
};
const isRestockPending = (p) => {
  return !!(
    p?.restockPending ||
    p?.restockSoon ||
    hasRestockKeyword(p?.tags) ||
    hasRestockKeyword(p?.badges) ||
    hasRestockKeyword(p?.labels) ||
    hasRestockKeyword(p?.status) ||
    hasRestockKeyword(p?.nameBadge) ||
    hasRestockKeyword(p?.badgeText)
  );
};

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlySaved, setOnlySaved] = useState(false);

  const [fCatL1, setFCatL1] = useState("");
  const [fCatL2, setFCatL2] = useState("");
  const [fTag, setFTag] = useState("");

  const {
    user, savedIds,
    signUp, signIn, signOutNow, toggleSave
  } = useSavedProducts();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qRef = query(collection(db, "products"), orderBy("updatedAt", "desc"));
        const snap = await getDocs(qRef);
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p && p.name);
        setItems(rows);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const filtered = useMemo(() => {
    let base = items;

    if (onlySaved && user) {
      base = base.filter((p) => savedIds.has(p.id));
    }
    if (fCatL1) base = base.filter((p) => (p.categoryL1 || "") === fCatL1);
    if (fCatL2) base = base.filter((p) => (p.categoryL2 || "") === fCatL2);

    const tagTokens = tokenizeTags(fTag);
    if (tagTokens.length) {
      base = base.filter((p) => {
        const tagSet = new Set((p.tags || []).map((t) => String(t).toLowerCase()));
        return tagTokens.every((t) => tagSet.has(t));
      });
    }

    const k = qText.trim().toLowerCase();
    if (!k) return base;

    return base.filter((p) => {
      const hay = [
        p.name,
        p.productCode,
        p.categoryL1,
        p.categoryL2,
        ...(p.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(k);
    });
  }, [items, onlySaved, user, savedIds, fCatL1, fCatL2, fTag, qText]);

  const resetFilters = () => {
    setFCatL1("");
    setFCatL2("");
    setFTag("");
  };

  const l2Options = fCatL1 ? CATEGORY_MAP[fCatL1] || [] : [];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <Navbar
        user={user}
        onlySaved={onlySaved}
        onToggleOnlySaved={(v) => setOnlySaved(v)}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOutNow}
      />

      {/* 검색 */}
      <div style={{ marginBottom: 10 }}>
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="검색: 상품명/코드/태그/카테고리"
          style={{
            width: "100%",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        />
      </div>

      {/* 필터 바 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto auto 1fr auto",
          gap: 8,
          alignItems: "center",
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          borderRadius: 10,
          padding: 10,
          marginBottom: 12,
        }}
      >
        {/* L1 */}
        <select
          value={fCatL1}
          onChange={(e) => {
            setFCatL1(e.target.value);
            setFCatL2("");
          }}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 10px",
            minWidth: 220,
          }}
        >
          <option value="">대분류(L1): 전체</option>
          {Object.keys(CATEGORY_MAP).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>

        {/* L2 */}
        <select
          value={fCatL2}
          onChange={(e) => setFCatL2(e.target.value)}
          disabled={!fCatL1}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 10px",
            minWidth: 220,
            opacity: fCatL1 ? 1 : 0.5,
          }}
        >
          <option value="">{fCatL1 ? "중분류(L2): 전체" : "대분류 먼저 선택"}</option>
          {l2Options.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* 태그 입력 */}
        <input
          value={fTag}
          onChange={(e) => setFTag(e.target.value)}
          placeholder="태그 필터 (쉼표/공백 구분: 전통, 봉투)"
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: "8px 10px",
            width: "100%",
          }}
        />

        {/* 초기화 */}
        <button
          onClick={resetFilters}
          style={{
            borderRadius: 8,
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            background: "white",
          }}
        >
          필터 초기화
        </button>
      </div>

      {/* 결과 정보 */}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        총 {items.length.toLocaleString()}개 / 표시 {filtered.length.toLocaleString()}개
        {onlySaved && user ? " · 저장만 보기" : ""}
        {fCatL1 ? ` · L1=${fCatL1}` : ""}
        {fCatL2 ? ` · L2=${fCatL2}` : ""}
        {fTag ? ` · 태그=${fTag}` : ""}
        {qText ? ` · 검색="${qText}"` : ""}
      </div>

      {loading ? (
        <div>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div>검색/필터 결과가 없습니다.</div>
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
              restockPending={isRestockPending(p)}  
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
    </div>
  );
}
