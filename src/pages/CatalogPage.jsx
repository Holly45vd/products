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

  // 태그 검색 결과 기반 카테고리 파셋
  const [facetCatsL1, setFacetCatsL1] = useState(new Set()); // 선택된 L1 카테고리들
  const [facetMode, setFacetMode] = useState("include");     // 'include' | 'exclude'

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

  /** 태그 검색 결과 기반 L1 파셋 집계 (카테고리 드롭다운 필터는 제외하고 계산) */
  const tagFacetsL1 = useMemo(() => {
    // 태그 검색이 없으면 파셋 숨김
    const tagTokens = tokenizeTags(fTag);
    if (!tagTokens.length) return new Map();

    let base = items;

    if (onlySaved && user) base = base.filter((p) => savedIds.has(p.id));

    // 태그 조건
    base = base.filter((p) => {
      const tagSet = new Set((p.tags || []).map((t) => String(t).toLowerCase()));
      return tagTokens.every((t) => tagSet.has(t));
    });

    // 키워드 검색(카테고리 드롭다운은 제외) — 파셋용 시야만 좁혀줌
    const k = qText.trim().toLowerCase();
    if (k) {
      base = base.filter((p) => {
        const hay = [p.name, p.productCode, ...(p.tags || [])]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(k);
      });
    }

    // L1 카운트
    const map = new Map(); // L1 -> count
    base.forEach((p) => {
      const l1 = p.categoryL1 || "(미지정)";
      map.set(l1, (map.get(l1) || 0) + 1);
    });
    return map;
  }, [items, onlySaved, user, savedIds, fTag, qText]);

  /** 실제 화면에 뿌릴 목록 */
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
    if (k) {
      base = base.filter((p) => {
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
    }

    // 태그 파셋(포함/제외) 적용: 태그 검색이 있을 때만 의미 있게 적용
    if (fTag && facetCatsL1.size > 0) {
      base = base.filter((p) => {
        const key = p.categoryL1 || "(미지정)";
        const hit = facetCatsL1.has(key);
        return facetMode === "include" ? hit : !hit;
      });
    }

    return base;
  }, [items, onlySaved, user, savedIds, fCatL1, fCatL2, fTag, qText, facetCatsL1, facetMode]);

  const resetFilters = () => {
    setFCatL1("");
    setFCatL2("");
    setFTag("");
    setFacetCatsL1(new Set());
    setFacetMode("include");
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

      {/* 태그 검색 결과 기반 카테고리 파셋(포함/제외) */}
      {fTag && tagFacetsL1.size > 0 && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
            background: "#fff",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <strong>카테고리 파셋 (태그 결과 기준)</strong>
            <label
              style={{
                marginLeft: "auto",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              모드:
              <select
                value={facetMode}
                onChange={(e) => setFacetMode(e.target.value)}
                style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "2px 6px" }}
              >
                <option value="include">포함</option>
                <option value="exclude">제외</option>
              </select>
            </label>
            <button
              onClick={() => setFacetCatsL1(new Set())}
              style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 8, padding: "4px 8px" }}
              title="파셋 선택 해제"
            >
              선택 해제
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {Array.from(tagFacetsL1.entries())
              .sort((a, b) => b[1] - a[1]) // count desc
              .map(([l1, cnt]) => {
                const active = facetCatsL1.has(l1);
                return (
                  <button
                    key={l1}
                    onClick={() =>
                      setFacetCatsL1((prev) => {
                        const next = new Set(prev);
                        if (next.has(l1)) next.delete(l1);
                        else next.add(l1);
                        return next;
                      })
                    }
                    style={{
                      border: active ? "1px solid #111827" : "1px solid #e5e7eb",
                      background: active ? (facetMode === "include" ? "#e0f2fe" : "#fee2e2") : "white",
                      color: "#111827",
                      borderRadius: 9999,
                      padding: "4px 10px",
                      fontSize: 12,
                    }}
                    title={`${l1} (${cnt.toLocaleString()}개)`}
                  >
                    {l1} · {cnt.toLocaleString()}
                  </button>
                );
              })}
          </div>
          {facetCatsL1.size > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
              적용: {facetMode === "include" ? "선택 카테고리만 표시" : "선택 카테고리 제외"} · 선택 {facetCatsL1.size}개
            </div>
          )}
        </div>
      )}

      {/* 결과 정보 */}
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        총 {items.length.toLocaleString()}개 / 표시 {filtered.length.toLocaleString()}개
        {onlySaved && user ? " · 저장만 보기" : ""}
        {fCatL1 ? ` · L1=${fCatL1}` : ""}
        {fCatL2 ? ` · L2=${fCatL2}` : ""}
        {fTag ? ` · 태그=${fTag}` : ""}
        {qText ? ` · 검색="${qText}"` : ""}
        {fTag && facetCatsL1.size > 0 ? ` · 파셋(${facetMode}): ${Array.from(facetCatsL1).join(", ")}` : ""}
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
