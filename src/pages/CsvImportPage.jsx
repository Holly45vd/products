// CsvImportPage.jsx — categoryL1/L2 업서트 지원 버전
import React, { useMemo, useState } from "react";
import { doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/** ===== 유틸 ===== */
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
function tokenizeTags(input = "") {
  return String(input)
    .split(/[,|#/ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** ===== CSV 파서 ===== */
function parseCsv(text) {
  let src = text.replace(/^\uFEFF/, "");
  const sep = src.includes("\t") ? "\t" : ",";
  const rows = [];
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
        rows.push(cur);
        cur = [];
      }
      continue;
    }
    cell += ch;
  }
  cur.push(cell);
  if (cur.length) rows.push(cur);
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

/** ===== 헤더 매핑 ===== */
function normalizeHeader(h = "") {
  const k = String(h).trim().toLowerCase();
  if (["id", "상품id", "문서id"].includes(k)) return "id";
  if (["상품명", "name", "title"].includes(k)) return "name";
  if (["상품코드", "productcode", "code", "pdno"].includes(k)) return "productCode";
  if (["가격", "price"].includes(k)) return "price";
  if (["평점", "rating"].includes(k)) return "rating";
  if (["리뷰수", "review", "reviewcount"].includes(k)) return "reviewCount";
  if (["조회수", "views", "view"].includes(k)) return "views";
  if (["태그", "tags"].includes(k)) return "tags";
  if (["링크", "url", "link"].includes(k)) return "link";
  if (["이미지", "이미지url", "image", "imageurl", "thumbnail"].includes(k)) return "imageUrl";
  if (["재입고", "restock", "restockable"].includes(k)) return "restockable";
  if (["상태", "status"].includes(k)) return "status";
  if (["재고", "stock"].includes(k)) return "stock";
  if (["업데이트시각", "updatedat"].includes(k)) return "updatedAt";

  // ★ 카테고리 인식 추가
  if (["대분류", "categoryl1", "category_l1", "lnb", "lnb1"].includes(k)) return "categoryL1";
  if (["중분류", "categoryl2", "category_l2", "sub", "lnb2"].includes(k)) return "categoryL2";

  return k;
}

/** ===== 행 → 상품 객체 ===== */
function rowToProduct(row, header) {
  const obj = {};
  header.forEach((key, idx) => {
    obj[key] = row[idx] ?? "";
  });

  const id = clean(obj.id || obj.productCode || "");
  const name = clean(obj.name || "");
  const imageUrl = clean(obj.imageUrl || "");
  const link = clean(obj.link || "");
  const productCode = clean(obj.productCode || "");
  const price = obj.price !== undefined ? parsePrice(obj.price) : undefined;
  const rating =
    obj.rating !== undefined
      ? parseFloat(String(obj.rating).replace(/[^\d.]/g, "")) || 0
      : undefined;
  const reviewCount =
    obj.reviewCount !== undefined ? parseKoreanCount(obj.reviewCount) : undefined;
  const views = obj.views !== undefined ? parseKoreanCount(obj.views) : undefined;
  const restockable =
    obj.restockable !== undefined
      ? /^(true|1|예|y)$/i.test(String(obj.restockable).trim())
      : undefined;
  const status = obj.status ? String(obj.status).trim() : undefined;
  const stock =
    obj.stock !== undefined
      ? Number(String(obj.stock).replace(/[^\d-]/g, "")) || 0
      : undefined;

  const rawTags = obj.tags != null ? String(obj.tags) : "";
  const tags = rawTags ? Array.from(new Set(tokenizeTags(rawTags))) : undefined;

  // ★ 카테고리 필드 파싱
  const categoryL1 =
    obj.categoryL1 != null && String(obj.categoryL1).trim() !== ""
      ? clean(obj.categoryL1)
      : undefined;
  const categoryL2 =
    obj.categoryL2 != null && String(obj.categoryL2).trim() !== ""
      ? clean(obj.categoryL2)
      : undefined;

  if (!id) return null;

  const product = { id };
  if (name) product.name = name;
  if (imageUrl) product.imageUrl = imageUrl;
  if (link) product.link = link;
  if (productCode) product.productCode = productCode;
  if (price !== undefined && !Number.isNaN(price)) product.price = price;
  if (rating !== undefined) product.rating = rating;
  if (reviewCount !== undefined) product.reviewCount = reviewCount;
  if (views !== undefined) product.views = views;
  if (restockable !== undefined) product.restockable = restockable;
  if (status) product.status = status;
  if (stock !== undefined) product.stock = stock;
  if (tags !== undefined) product.tags = tags;
  if (categoryL1 !== undefined) product.categoryL1 = categoryL1;   // ★
  if (categoryL2 !== undefined) product.categoryL2 = categoryL2;   // ★

  return product;
}

/** ===== 표시 포맷 ===== */
function fmt(v) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(" | ");
  return String(v);
}

export default function CsvImportPage() {
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]); // string[][]
  const [header, setHeader] = useState([]); // normalized
  const [rawHeader, setRawHeader] = useState([]); // original

  const [overwriteMode, setOverwriteMode] = useState(false);
  const [replaceTags, setReplaceTags] = useState(false);
  const [replaceCategories, setReplaceCategories] = useState(true); // ★ 새 옵션
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });

  const parsedProducts = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => rowToProduct(r, header)).filter(Boolean);
  }, [rows, header]);

  /** 파일 업로드 */
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    loadText(text);
  };

  /** 붙여넣기/파일 공용 로더 */
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

  /** CSV 템플릿 다운로드 (카테고리 포함) */
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
      "대분류(categoryL1)",   // ★ 추가
      "중분류(categoryL2)",   // ★ 추가
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

  /** 업서트 실행 */
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

          // 기본 필드들
          ["name","imageUrl","link","productCode","price","rating","reviewCount","views","restockable","status","stock"]
            .forEach((k) => {
              if (rest[k] !== undefined) payload[k] = rest[k];
            });

          // 태그: 옵션에 따라 반영
          if (replaceTags && rest.tags) payload.tags = rest.tags;

          // ★ 카테고리: 옵션에 따라 반영
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
        `완료: ${total}개 처리
- 모드: ${overwriteMode ? "문서 덮어쓰기" : "필드 병합 업데이트"}
- tags: ${replaceTags ? "CSV값 반영/교체" : "CSV 무시(기존 유지)"}
- category: ${replaceCategories ? "CSV값 반영/교체" : "CSV 무시(기존 유지)"}`
      );
    } catch (e) {
      console.error(e);
      alert(`에러: ${e.message}`);
    } finally {
      setProgress({ done: 0, total: 0, running: false });
    }
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 22, fontWeight: 700 }}>
        CSV 업서트(등록/업데이트)
      </h1>

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
          {/* ★ 카테고리 교체 옵션 */}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={replaceCategories} onChange={(e) => setReplaceCategories(e.target.checked)} />
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
          placeholder={`여기에 CSV/TSV를 붙여넣어도 됩니다.
예시(쉼표):
상품ID,상품명,상품코드,가격,태그,링크,이미지URL,대분류(categoryL1),중분류(categoryL2)
1038756,전통문양 봉투 2매입,1038756,1000,"전통 | 봉투 | 핑크",https://...,https://...,문구/팬시,포장용품

예시(탭):
상품ID\t상품명\t가격\t태그\t대분류(categoryL1)\t중분류(categoryL2)
1038756\t전통문양 봉투 2매입\t1,000\t전통 | 봉투\t문구/팬시\t포장용품`}
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
                  "id","name","productCode","price","rating","reviewCount","views","tags","link","imageUrl","restockable","status","stock","categoryL1","categoryL2"
                ].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" }}>{h}</th>
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
                  <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmt(p.link)}</td>
                  <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmt(p.imageUrl)}</td>
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
  );
}
