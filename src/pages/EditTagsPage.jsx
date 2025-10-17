// src/pages/EditTagsAndCategoriesPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  doc,
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/** ===== 카테고리 정의 (LNB 대분류 → 중분류 리스트) ===== */
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

/** ===== 태그 토크나이저 ===== */
function tokenizeTags(input = "") {
  return String(input)
    .split(/[,|#/ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ===== CSV 유틸 ===== */
function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows) {
  const header = [
    "상품ID",
    "상품명",
    "상품코드",
    "가격",
    "평점",
    "리뷰수",
    "조회수",
    "태그",
    "링크",
    "대분류(categoryL1)",
    "중분류(categoryL2)",
  ];
  const lines = [header.map(csvEscape).join(",")];
  rows.forEach((p) => {
    lines.push(
      [
        p.id,
        p.name,
        p.productCode || "",
        p.price ?? "",
        p.rating ?? "",
        p.reviewCount ?? "",
        p.views ?? "",
        (p.tags || []).join(" | "),
        p.link || "",
        p.categoryL1 || "",
        p.categoryL2 || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\r\n");
}

/** ===== 텍스트 다운로드 (BOM 추가) ===== */
function downloadText(content, filename, mime = "text/csv;charset=utf-8") {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** =======================
 *  CSV 업서트 모달 컴포넌트
 * ======================= */
function CsvImportModal({ open, onClose, onAfterImport }) {
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]); // string[][]
  const [header, setHeader] = useState([]); // normalized keys
  const [rawHeader, setRawHeader] = useState([]); // original

  const [overwriteMode, setOverwriteMode] = useState(false); // set merge:false
  const [replaceTags, setReplaceTags] = useState(true); // CSV tags 반영(교체)
  const [replaceCategories, setReplaceCategories] = useState(true); // CSV cat 반영
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });

  const parsedProducts = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => rowToProduct(r, header)).filter(Boolean);
  }, [rows, header]);

  // --- CSV 파서/헤더 normalize/rowToProduct (모달 내부 전용) ---
  function parseCsv(text) {
    let src = text.replace(/^\uFEFF/, "");
    const sep = src.includes("\t") ? "\t" : ",";
    const out = [];
    let cur = [];
    let cell = "";
    let inQ = false;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '"') {
        if (inQ && src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQ = !inQ;
        }
        continue;
      }
      if (!inQ && (ch === sep || ch === "\n" || ch === "\r")) {
        cur.push(cell);
        cell = "";
        if (ch === "\n") {
          out.push(cur);
          cur = [];
        }
        continue;
      }
      cell += ch;
    }
    cur.push(cell);
    if (cur.length) out.push(cur);
    return out.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function normalizeHeader(h = "") {
    const raw = String(h).trim();
  const canon = raw
    .toLowerCase()
    .replace(/\s+/g, "")        // 공백 제거
    .replace(/\([^)]*\)/g, ""); // ( ... ) 제거

  if (["id","상품id","문서id"].includes(canon)) return "id";
  if (["상품명","name","title"].includes(canon)) return "name";
  if (["상품코드","productcode","code","pdno"].includes(canon)) return "productCode";
  if (["가격","price"].includes(canon)) return "price";
  if (["평점","rating"].includes(canon)) return "rating";
  if (["리뷰수","review","reviewcount"].includes(canon)) return "reviewCount";
  if (["조회수","views","view"].includes(canon)) return "views";
  if (["태그","tags"].includes(canon)) return "tags";
  if (["링크","url","link"].includes(canon)) return "link";
  if (["이미지","이미지url","image","imageurl","thumbnail"].includes(canon)) return "imageUrl";
  if (["재입고","restock","restockable"].includes(canon)) return "restockable";
  if (["상태","status"].includes(canon)) return "status";
  if (["재고","stock","재고수량"].includes(canon)) return "stock";
  // 카테고리: 괄호/밑줄/공백/대소문자 허용
  if (/^(대분류|categoryl1|category_l1|lnb|lnb1)$/.test(canon)) return "categoryL1";
  if (/^(중분류|categoryl2|category_l2|sub|lnb2)$/.test(canon)) return "categoryL2";
  return raw; // 디버깅 용이하게 원문 반환
}
  function parseKoreanCount(text = "") {
    const t = String(text).replace(/[\s,()보기]/g, "");
    if (!t) return 0;
    const mMan = t.match(/([\d.]+)\s*만/);
    const mCheon = t.match(/([\d.]+)\s*천/);
    if (mMan) return Math.round(parseFloat(mMan[1]) * 10000);
    if (mCheon) return Math.round(parseFloat(mCheon[1]) * 1000);
    const num = t.match(/[\d.]+/);
    return num ? Number(num[0]) : 0;
  }
  function parsePrice(text = "") {
    const n = String(text).replace(/[^\d.]/g, "");
    return n ? Number(n) : 0;
  }
  function clean(s = "") {
    return String(s).replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
  }

  function rowToProduct(row, header) {
    const obj = {};
    header.forEach((key, idx) => {
      obj[key] = row[idx] ?? "";
    });

    const id = clean(obj.id || obj.productCode || "");
    if (!id) return null;

    const product = { id };

    const fields = {
      name: clean(obj.name || ""),
      imageUrl: clean(obj.imageUrl || ""),
      link: clean(obj.link || ""),
      productCode: clean(obj.productCode || ""),
      price: obj.price !== undefined ? parsePrice(obj.price) : undefined,
      rating:
        obj.rating !== undefined
          ? parseFloat(String(obj.rating).replace(/[^\d.]/g, "")) || 0
          : undefined,
      reviewCount: obj.reviewCount !== undefined ? parseKoreanCount(obj.reviewCount) : undefined,
      views: obj.views !== undefined ? parseKoreanCount(obj.views) : undefined,
      restockable:
        obj.restockable !== undefined ? /^(true|1|예|y)$/i.test(String(obj.restockable).trim()) : undefined,
      status: obj.status ? String(obj.status).trim() : undefined,
      stock: obj.stock !== undefined ? Number(String(obj.stock).replace(/[^\d-]/g, "")) || 0 : undefined,
      categoryL1: obj.categoryL1 ? clean(obj.categoryL1) : undefined,
      categoryL2: obj.categoryL2 ? clean(obj.categoryL2) : undefined,
    };

    Object.entries(fields).forEach(([k, v]) => {
      if (v === undefined) return;
      if (typeof v === "string" && !v) return;
      product[k] = v;
    });

    if (obj.tags != null && String(obj.tags).trim() !== "") {
      product.tags = Array.from(new Set(tokenizeTags(String(obj.tags))));
    }

    return product;
  }

  function fmt(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(" | ");
    return String(v);
  }

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    loadText(text);
  };

  const loadText = (text) => {
    const grid = parseCsv(text);
    if (!grid.length) {
      setRows([]);
      setHeader([]);
      setRawHeader([]);
      setRaw("");
      return;
    }
    const [h0, ...body] = grid;
    const norm = h0.map(normalizeHeader);
    setRaw(text);
    setRows(body);
    setHeader(norm);
    setRawHeader(h0);
  };

  const downloadTemplate = () => {
    const headers = [
      "상품ID",
      "상품명",
      "상품코드",
      "가격",
      "평점",
      "리뷰수",
      "조회수",
      "태그",
      "링크",
      "이미지URL",
      "재입고",
      "상태",
      "재고",
      "대분류(categoryL1)",
      "중분류(categoryL2)",
    ];
    const content = "\uFEFF" + headers.join(",") + "\r\n";
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "상품_업데이트_템플릿.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!parsedProducts.length) {
      alert("유효한 행이 없습니다.");
      return;
    }
    const total = parsedProducts.length;
    setProgress({ done: 0, total, running: true });

    try {
      const chunkSize = 400;
      for (let i = 0; i < parsedProducts.length; i += chunkSize) {
        const chunk = parsedProducts.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        chunk.forEach((p) => {
          const { id, ...rest } = p;

          const payload = { updatedAt: serverTimestamp() };

          // 필드 지정: overwriteMode 여부와 옵션에 따라 반영
          // 태그
          if (replaceTags && rest.tags) payload.tags = rest.tags;

          // 기본 필드들(카테고리 외)
          ["name", "imageUrl", "link", "productCode", "price", "rating", "reviewCount", "views", "restockable", "status", "stock"].forEach(
            (k) => {
              if (rest[k] !== undefined) payload[k] = rest[k];
            }
          );

          // 카테고리
          if (replaceCategories) {
            if (rest.categoryL1 !== undefined) payload.categoryL1 = rest.categoryL1;
            if (rest.categoryL2 !== undefined) payload.categoryL2 = rest.categoryL2;
          }

          const ref = doc(db, "products", id);
          batch.set(ref, payload, { merge: !overwriteMode });
        });

        await batch.commit();
        setProgress((s) => ({ ...s, done: Math.min(s.done + chunk.length, total) }));
      }

      alert(
        `완료: ${total}개 처리\n- 모드: ${overwriteMode ? "문서 덮어쓰기" : "필드 병합 업데이트"}\n- tags: ${
          replaceTags ? "CSV값 반영/교체" : "CSV 무시(기존 유지)"
        }\n- category: ${replaceCategories ? "CSV값 반영/교체" : "CSV 무시(기존 유지)"}`
      );
      onAfterImport?.();
      onClose?.();
    } catch (e) {
      console.error(e);
      alert(`에러: ${e.message}`);
    } finally {
      setProgress({ done: 0, total: 0, running: false });
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(e) => {
        // 바깥 클릭 닫기
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div style={{ width: "min(1080px, 96%)", maxHeight: "90vh", overflow: "auto", background: "white", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>CSV 업서트(등록/업데이트)</h2>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button
              onClick={onClose}
              style={{ border: "1px solid #e5e7eb", background: "white", borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
            >
              닫기
            </button>
          </div>
        </div>

        {/* 업로드/옵션 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="file" accept=".csv,text/csv" onChange={onFile} aria-label="CSV 파일 선택" />
            <button
              onClick={downloadTemplate}
              style={{ borderRadius: 8, padding: "8px 12px", border: "1px solid #e5e7eb", background: "white", cursor: "pointer" }}
            >
              템플릿 다운로드
            </button>
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {fileName ? `선택된 파일: ${fileName}` : "CSV(UTF-8, BOM 권장). 탭 구분도 OK"}
            </span>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={overwriteMode} onChange={(e) => setOverwriteMode(e.target.checked)} />
              문서 덮어쓰기(merge 아님)
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={replaceTags} onChange={(e) => setReplaceTags(e.target.checked)} />
              CSV의 태그 반영(교체)
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={replaceCategories}
                onChange={(e) => setReplaceCategories(e.target.checked)}
              />
              CSV의 카테고리 반영(교체)
            </label>
            <button
              onClick={handleImport}
              disabled={!parsedProducts.length || progress.running}
              style={{
                borderRadius: 8,
                padding: "8px 12px",
                border: "1px solid #e5e7eb",
                background: "#111827",
                color: "white",
                cursor: "pointer",
                minWidth: 140,
              }}
            >
              {progress.running ? `처리중… (${progress.done}/${progress.total})` : `업서트 실행 (${parsedProducts.length}개)`}
            </button>
          </div>
        </div>

        {/* 붙여넣기 입력 */}
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={raw}
            onChange={(e) => loadText(e.target.value)}
            placeholder={`여기에 CSV/TSV를 붙여넣어도 됩니다.\n예시:\n상품ID,상품명,가격,태그,대분류(categoryL1),중분류(categoryL2)\n1038756,전통문양 봉투 2매입,1000,"전통 | 봉투 | 핑크",전통/시리즈,전통 시리즈`}
            style={{ width: "100%", height: 140, borderRadius: 8, border: "1px solid #e5e7eb", padding: 8 }}
          />
        </div>

        {/* 미리보기 */}
        <h3 style={{ marginTop: 10, marginBottom: 8 }}>미리보기 ({parsedProducts.length}행)</h3>
        {!parsedProducts.length ? (
          <div style={{ color: "#6b7280" }}>파싱된 행이 없습니다.</div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {[
                    "id",
                    "name",
                    "productCode",
                    "price",
                    "rating",
                    "reviewCount",
                    "views",
                    "tags",
                    "link",
                    "imageUrl",
                    "restockable",
                    "status",
                    "stock",
                    "categoryL1",
                    "categoryL2",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedProducts.slice(0, 200).map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 8 }}>{fmt(p.id)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.name)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.productCode)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.price)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.rating)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.reviewCount)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.views)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.tags)}</td>
                    <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fmt(p.link)}
                    </td>
                    <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {fmt(p.imageUrl)}
                    </td>
                    <td style={{ padding: 8 }}>{fmt(p.restockable)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.status)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.stock)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.categoryL1)}</td>
                    <td style={{ padding: 8 }}>{fmt(p.categoryL2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedProducts.length > 200 && (
              <div style={{ padding: 8, fontSize: 12, color: "#6b7280" }}>
                미리보기는 상위 200행까지만 표시합니다. 전체 {parsedProducts.length}행 처리됩니다.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** =======================
 *  메인 페이지
 * ======================= */
export default function EditTagsAndCategoriesPage() {
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  // 선택 상태
  const [selected, setSelected] = useState(new Set());

  // 태그 벌크 입력
  const [bulkInput, setBulkInput] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);

  // 카테고리 벌크 입력
  const [l1, setL1] = useState(""); // categoryL1
  const [l2, setL2] = useState(""); // categoryL2

  // CSV 모달
  const [csvOpen, setCsvOpen] = useState(false);

  // 데이터 로드
  const load = async () => {
    setLoading(true);
    try {
      const qRef = query(collection(db, "products"), orderBy("updatedAt", "desc"));
      const snap = await getDocs(qRef);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p && p.name);
      setItems(rows);
    } catch (e) {
      console.error("load error", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 검색 필터
  const filtered = useMemo(() => {
    const k = qText.trim().toLowerCase();
    if (!k) return items;
    return items.filter((p) => {
      const hay = [
        p.name,
        p.productCode,
        ...(p.tags || []),
        p.categoryL1 || "",
        p.categoryL2 || "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(k);
    });
  }, [items, qText]);

  // 선택 토글/모두선택/해제
  const toggleCheck = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((p) => next.add(p.id));
      return next;
    });
  };
  const clearSelection = () => setSelected(new Set());

  /** ===== 태그 벌크 추가/삭제 ===== */
  const handleBulkAdd = async () => {
    const tokens = tokenizeTags(bulkInput);
    if (!tokens.length) return alert("추가할 태그를 입력하세요.");
    if (selected.size === 0) return alert("선택된 상품이 없습니다.");

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => {
        const ref = doc(db, "products", id);
        batch.update(ref, { tags: arrayUnion(...tokens), updatedAt: serverTimestamp() });
      });
      await batch.commit();

      // 로컬 갱신
      setItems((prev) =>
        prev.map((p) =>
          selected.has(p.id)
            ? { ...p, tags: Array.from(new Set([...(p.tags || []), ...tokens])) }
            : p
        )
      );
      setBulkInput("");
    } catch (e) {
      console.error("bulk add error", e);
      alert(`벌크 추가 실패: ${e.message}`);
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkRemove = async () => {
    const tokens = tokenizeTags(bulkInput);
    if (!tokens.length) return alert("삭제할 태그를 입력하세요.");
    if (selected.size === 0) return alert("선택된 상품이 없습니다.");
    if (!window.confirm(`선택된 ${selected.size}개에서 [${tokens.join(", ")}] 태그를 제거할까요?`)) return;

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => {
        const ref = doc(db, "products", id);
        batch.update(ref, { tags: arrayRemove(...tokens), updatedAt: serverTimestamp() });
      });
      await batch.commit();

      setItems((prev) =>
        prev.map((p) =>
          selected.has(p.id)
            ? { ...p, tags: (p.tags || []).filter((t) => !tokens.includes(t)) }
            : p
        )
      );
      setBulkInput("");
    } catch (e) {
      console.error("bulk remove error", e);
      alert(`벌크 삭제 실패: ${e.message}`);
    } finally {
      setBulkWorking(false);
    }
  };

  /** ===== 카테고리 벌크 지정 ===== */
  const handleBulkSetCategory = async () => {
    if (!l1) return alert("대분류(L1)를 선택하세요.");
    if (!l2) return alert("중분류(L2)를 선택하세요.");
    if (selected.size === 0) return alert("선택된 상품이 없습니다.");

    if (!window.confirm(`선택된 ${selected.size}개 상품의 카테고리를\n${l1} > ${l2} 로 지정할까요?`)) return;

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => {
        const ref = doc(db, "products", id);
        batch.update(ref, {
          categoryL1: l1,
          categoryL2: l2,
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();

      // 로컬 반영
      setItems((prev) =>
        prev.map((p) => (selected.has(p.id) ? { ...p, categoryL1: l1, categoryL2: l2 } : p))
      );
    } catch (e) {
      console.error("bulk category error", e);
      alert(`카테고리 지정 실패: ${e.message}`);
    } finally {
      setBulkWorking(false);
    }
  };

  /** ===== CSV 내보내기 ===== */
  const downloadCsv = (onlySelected = false) => {
    const list = onlySelected ? filtered.filter((p) => selected.has(p.id)) : filtered;
    if (list.length === 0) return alert("내보낼 항목이 없습니다.");
    const csv = buildCsv(list);
    const today = new Date().toISOString().slice(0, 10);
    const suffix = onlySelected ? "_선택만" : "_필터결과";
    downloadText(csv, `상품리스트${suffix}_${today}.csv`, "text/csv;charset=utf-8");
  };

  // 중분류 옵션
  const l2Options = l1 ? CATEGORY_MAP[l1] || [] : [];

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 22, fontWeight: 700 }}>
        상품 태그/카테고리 편집
      </h1>

      {/* 상단 툴바 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 12 }}>
        <input
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="검색: 상품명 / 상품코드 / 태그 / 카테고리"
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
        />

        {/* 벌크 툴바 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr auto auto auto auto auto auto auto",
            gap: 8,
            alignItems: "center",
          }}
        >
          {/* 태그 입력 */}
          <input
            value={bulkInput}
            onChange={(e) => setBulkInput(e.target.value)}
            placeholder="태그 입력: 전통, 핑크 #봉투"
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
          />
          <button
            onClick={handleBulkAdd}
            disabled={bulkWorking || selected.size === 0}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            {bulkWorking ? "처리중…" : `선택 ${selected.size}개 태그추가`}
          </button>
          <button
            onClick={handleBulkRemove}
            disabled={bulkWorking || selected.size === 0}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            선택 {selected.size}개 태그삭제
          </button> <br />

          {/* 카테고리 선택 */}
          <select
            value={l1}
            onChange={(e) => {
              setL1(e.target.value);
              setL2(""); // L1 변경 시 L2 초기화
            }}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
            aria-label="대분류 선택"
          >
            <option value="">대분류(L1)</option>
            {Object.keys(CATEGORY_MAP).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={l2}
            onChange={(e) => setL2(e.target.value)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
            aria-label="중분류 선택"
            disabled={!l1}
          >
            <option value="">{l1 ? "중분류(L2)" : "대분류 먼저 선택"}</option>
            {l2Options.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <button
            onClick={handleBulkSetCategory}
            disabled={bulkWorking || selected.size === 0 || !l1 || !l2}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              minWidth: 150,
            }}
            title="선택 항목 카테고리 지정"
          >
            선택 {selected.size}개 카테고리 지정
          </button>

          {/* 선택 컨트롤 */}
          <button
            onClick={selectAllOnPage}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
            }}
            title="현재 검색 결과 모두 선택"
          >
            전체선택
          </button>
          <button
            onClick={clearSelection}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
            }}
            title="선택 해제"
          >
            선택해제
          </button>

          {/* CSV */}
          <button
            onClick={() => downloadCsv(false)}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              cursor: "pointer",
              minWidth: 120,
            }}
            title="현재 검색/필터된 목록 CSV 저장"
          >
            CSV(필터결과)
          </button>
          <button
            onClick={() => downloadCsv(true)}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              minWidth: 120,
            }}
            title="체크된 항목만 CSV 저장"
          >
            CSV(선택만)
          </button>
        </div>

        {/* CSV 업서트 모달 열기 */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setCsvOpen(true)}
            style={{
              borderRadius: 8,
              padding: "8px 12px",
              border: "1px solid #e5e7eb",
              background: "#111827",
              color: "white",
              cursor: "pointer",
            }}
          >
            CSV 업서트 열기
          </button>
          <span style={{ fontSize: 12, color: "#6b7280" }}>
            모달에서 categoryL1 / categoryL2 컬럼을 인식합니다.
          </span>
        </div>
      </div>

      {loading ? (
        <div>불러오는 중…</div>
      ) : filtered.length === 0 ? (
        <div>검색 결과가 없습니다.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
          {filtered.map((p) => {
            const isChecked = selected.has(p.id);
            const uniqTags = Array.from(new Set(p.tags || []));
            return (
              <div
                key={p.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 10,
                  display: "grid",
                  gridTemplateColumns: "28px 80px 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCheck(p.id)}
                  style={{ width: 18, height: 18 }}
                  aria-label={`상품 선택: ${p.name}`}
                />

                <div
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 8,
                    background: "#f3f4f6",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>No Image</span>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong>{p.name}</strong>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>({p.productCode || p.id})</span>
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12 }}
                      >
                        원본 링크
                      </a>
                    )}
                    {isChecked && (
                      <span style={{ fontSize: 11, color: "#111827", marginLeft: "auto" }}>
                        선택됨
                      </span>
                    )}
                  </div>

                  {/* 카테고리 표시 */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {(p.categoryL1 || p.categoryL2) ? (
                      <>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            background: "#eef2ff",
                            border: "1px solid #e5e7eb",
                            padding: "2px 8px",
                            borderRadius: 9999,
                          }}
                          title="대분류"
                        >
                          L1: {p.categoryL1 || "-"}
                        </span>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            background: "#ecfeff",
                            border: "1px solid #e5e7eb",
                            padding: "2px 8px",
                            borderRadius: 9999,
                          }}
                          title="중분류"
                        >
                          L2: {p.categoryL2 || "-"}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>카테고리 미지정</span>
                    )}
                  </div>

                  {/* 태그 표시 */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {uniqTags.length === 0 ? (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>태그 없음</span>
                    ) : (
                      uniqTags.map((t) => (
                        <span
                          key={t}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12,
                            background: "#f3f4f6",
                            border: "1px solid #e5e7eb",
                            padding: "2px 8px",
                            borderRadius: 9999,
                          }}
                        >
                          #{t}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CSV 업서트 모달 */}
      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onAfterImport={() => load()}
      />
    </div>
  );
}
