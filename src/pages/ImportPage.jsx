import React, { useEffect, useMemo, useState } from "react";
import {
  collection, getDocs, orderBy, query, doc,
  writeBatch, setDoc, deleteDoc, serverTimestamp, arrayUnion, arrayRemove
} from "firebase/firestore";
import { db } from "../firebase";

/** ===== 카테고리 맵 ===== */
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
  return String(input).split(/[,|#/ ]+/).map((s) => s.trim()).filter(Boolean);
}

/** ===== 메인 컴포넌트 ===== */
export default function ProductsAdminPage() {
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());

  const [tagInput, setTagInput] = useState("");
  const [catL1, setCatL1] = useState("");
  const [catL2, setCatL2] = useState("");

  // ===== Firestore 데이터 로드 =====
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const qRef = query(collection(db, "products"), orderBy("updatedAt", "desc"));
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p && p.name);
        setItems(rows);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    };
    run();
  }, []);

  // ===== 검색 필터 =====
  const filtered = useMemo(() => {
    const k = qText.trim().toLowerCase();
    if (!k) return items;
    return items.filter((p) => {
      const hay = [
        p.name, p.productCode, (p.categoryL1 || ""), (p.categoryL2 || ""), ...(p.tags || [])
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(k);
    });
  }, [items, qText]);

  const toggleCheck = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const selectAllFiltered = () => setSelected(new Set(filtered.map((p) => p.id)));
  const clearSelection = () => setSelected(new Set());

  /** ===== CSV 내보내기 ===== */
  const downloadCsv = (onlySelected = false) => {
    const list = onlySelected ? filtered.filter((p) => selected.has(p.id)) : filtered;
    if (list.length === 0) return alert("내보낼 항목이 없습니다.");
    const csv = list.map((p) =>
      [p.id, p.name, p.productCode, p.price ?? "", (p.tags || []).join(" | "), p.categoryL1, p.categoryL2].join(",")
    ).join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = onlySelected ? "선택상품.csv" : "필터상품.csv";
    a.click();
  };

  /** ===== UI 시작 ===== */
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>상품 관리</h1>

      {/* ✅ 상단 메뉴 */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        marginBottom: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        background: "#f9fafb"
      }}>

        {/* 1️⃣ 태그 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="전통, 봉투, #핑크"
            style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}
          />
          <button
            onClick={() => alert(`선택 ${selected.size}개 태그 추가 실행`)}
            disabled={selected.size === 0}
            style={{ borderRadius: 8, padding: "6px 12px", background: "#111827", color: "white", border: "none" }}
          >
            선택 {selected.size}개 태그 추가
          </button>
          <button
            onClick={() => alert(`선택 ${selected.size}개 태그 삭제 실행`)}
            disabled={selected.size === 0}
            style={{ borderRadius: 8, padding: "6px 12px", background: "white", border: "1px solid #e5e7eb" }}
          >
            선택 {selected.size}개 태그 삭제
          </button>
        </div>

        {/* 2️⃣ 카테고리 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={catL1}
            onChange={(e) => { setCatL1(e.target.value); setCatL2(""); }}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}
          >
            <option value="">대분류 선택</option>
            {Object.keys(CATEGORY_MAP).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <select
            value={catL2}
            onChange={(e) => setCatL2(e.target.value)}
            disabled={!catL1}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px" }}
          >
            <option value="">{catL1 ? "중분류 선택" : "대분류 먼저"}</option>
            {(catL1 ? CATEGORY_MAP[catL1] || [] : []).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button
            onClick={() => alert(`선택 ${selected.size}개 카테고리 지정 (${catL1} > ${catL2})`)}
            disabled={selected.size === 0 || !catL1 || !catL2}
            style={{ borderRadius: 8, padding: "6px 12px", background: "#111827", color: "white", border: "none" }}
          >
            선택 {selected.size}개 카테고리 지정
          </button>
        </div>

        {/* 3️⃣ CSV */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={selectAllFiltered} style={{ borderRadius: 8, padding: "6px 12px", background: "white", border: "1px solid #e5e7eb" }}>
            전체 선택
          </button>
          <button onClick={clearSelection} style={{ borderRadius: 8, padding: "6px 12px", background: "white", border: "1px solid #e5e7eb" }}>
            선택 해제
          </button>
          <button onClick={() => downloadCsv(false)} style={{ borderRadius: 8, padding: "6px 12px", background: "#111827", color: "white", border: "none" }}>
            CSV(필터결과)
          </button>
          <button onClick={() => downloadCsv(true)} style={{ borderRadius: 8, padding: "6px 12px", background: "white", border: "1px solid #e5e7eb" }}>
            CSV(선택만)
          </button>
          <button
            onClick={() => document.getElementById("csvUpsertBox")?.scrollIntoView({ behavior: "smooth" })}
            style={{ borderRadius: 8, padding: "6px 12px", background: "#2563eb", color: "white", border: "none" }}
          >
            CSV 업서트 열기
          </button>
        </div>
      </div>

      {/* 검색 */}
      <div style={{ marginBottom: 12 }}>
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="검색: 상품명/코드/태그/카테고리"
          style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
        />
      </div>

      {/* 상품 목록 */}
      {loading ? (
        <div>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div>검색 결과가 없습니다.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filtered.map((p) => {
            const isChecked = selected.has(p.id);
            return (
              <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, display: "grid", gridTemplateColumns: "28px 80px 1fr", gap: 12, alignItems: "center" }}>
                <input type="checkbox" checked={isChecked} onChange={() => toggleCheck(p.id)} />
                <div style={{ width: 80, height: 80, borderRadius: 8, background: "#f3f4f6", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {p.imageUrl ? (<img src={p.imageUrl} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />) : (<span style={{ fontSize: 12, color: "#9ca3af" }}>No Image</span>)}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <strong>{p.name}</strong>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>({p.id})</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
                      {typeof p.price === "number" ? p.price.toLocaleString() + "원" : "-"}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {p.categoryL1} / {p.categoryL2}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(p.tags || []).map((t) => (
                      <span key={t} style={{ background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 9999, padding: "2px 8px", fontSize: 12 }}>#{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
