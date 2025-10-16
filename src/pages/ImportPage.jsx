import React, { useMemo, useState } from "react";
import { doc, setDoc,  serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

/** "5.8만", "3.2천", "85건" 같은 텍스트 → 숫자 */
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

/** "1,000" → 1000 */
function parsePrice(text = "") {
  const n = String(text).replace(/[^\d.]/g, "");
  return n ? Number(n) : 0;
}

/** 셀 텍스트 정리 */
function clean(s = "") {
  return String(s).replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
}

/** 마지막 컬럼이 URL인지 점검 */
function looksLikeUrl(s = "") {
  return /^https?:\/\//i.test(String(s).trim());
}

/** 1행(배열) → product 객체로 매핑 (방어적) */
function mapRowToProduct(cols, rowIdx) {
  try {
    if (!Array.isArray(cols) || cols.length < 4) return null;

    const imageUrl = clean(cols[0] ?? "");
    const price = parsePrice(cols[1]);
    const title = clean(cols[3] ?? "");

    // 🔗 링크: 원칙적으로 마지막 열. 만약 마지막이 URL이 아니면 링크 없음 처리.
    const lastCol = cols[cols.length - 1] ?? "";
    const link = looksLikeUrl(lastCol) ? clean(lastCol) : "";

    // 🏷 태그: 9번 인덱스부터 (마지막-1)까지. 범위가 뒤집히면 빈 배열.
    const tagStartIndex = 9;
    const tagEndIndex = (looksLikeUrl(lastCol) ? cols.length - 2 : cols.length - 1);
    const safeStart = Math.max(tagStartIndex, 0);
    const safeEnd = Math.max(tagEndIndex, safeStart - 1); // end < start 면 slice 결과 []
    const tags = cols
      .slice(safeStart, safeEnd + 1)
      .map(clean)
      .filter(Boolean)
      .filter((t) => !looksLikeUrl(t));

    const rating = parseFloat(String(cols[5] ?? "").replace(/[^\d.]/g, "")) || 0;
    const reviewCount = parseKoreanCount(cols[6] ?? "");
    const views = Math.max(parseKoreanCount(cols[7] ?? ""), parseKoreanCount(cols[8] ?? ""));

    // 🔎 재입고 안내/예정 문구 감지 (전체 행 텍스트에서)
    const rawJoined = cols.map((x) => String(x || "")).join(" ");
    const hasRestockNotice = /재입고\s*(안내|예정)/i.test(rawJoined);

    // 🆔 상품코드 (pdNo=숫자) — 링크에서만 추출 가능
    let productCode = "";
    const m = link.match(/pdNo=(\d+)/);
    if (m) productCode = m[1];

    // ✅ 유효성 검사 (title, price, productCode 필수)
    if (!title || price <= 0 || !productCode) {
      // 진단용 로그
      console.warn("[Import] Skipped row", { rowIdx, title, price, productCode, cols });
      return null;
    }

    return {
      id: productCode,          // 문서 ID로 사용
      name: title,
      price,
      imageUrl,
      link,
      productCode,
      tags,
      rating,
      reviewCount,
      views,
      stock: hasRestockNotice ? 0 : 0,
      restockable: hasRestockNotice,
      status: "active",
      updatedAt: serverTimestamp(),
    };
  } catch (err) {
    console.error("[Import] mapRowToProduct error at row", rowIdx, err, cols);
    return null;
  }
}

/** 텍스트(붙여넣기/CSV) → 행 배열 (따옴표 내부 개행 지원) */
function parseInput(text) {
  const sep = text.includes("\t") ? "\t" : ",";
  const rows = [];
  let cur = [];
  let cell = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQ && text[i + 1] === '"') {
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
        if (cur.length > 0) rows.push(cur);
        cur = [];
      }
      continue;
    }

    cell += ch;
  }

  // 마지막 셀/행 반영
  cur.push(cell);
  if (cur.some((c) => c && c.trim().length > 0)) rows.push(cur);

  // 완전 빈 행 제거
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const rows = useMemo(() => parseInput(raw), [raw]);

  const products = useMemo(
    () => rows.map((r, i) => mapRowToProduct(r, i)).filter(Boolean),
    [rows]
  );

  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);

  const handleImport = async () => {
    if (!products.length) {
      alert("업로드할 유효한 상품이 없습니다.");
      return;
    }
    setImporting(true);
    setDone(0);
    try {
      const chunkSize = 10;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((p) => {
            // ✅ 환경별 오류 방지: doc(db, "products", id) 형태 고정
            const ref = doc(db, "products", p.id);
            return setDoc(ref, p, { merge: true });
          })
        );
        setDone((prev) => prev + chunk.length);
      }
      alert(`✅ 완료: ${products.length}개 업로드 (기존 상품은 업데이트)`);
    } catch (e) {
      console.error(e);
      alert(`에러: ${e.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>상품 임포트 (엑셀 붙여넣기 / CSV)</h1>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={`이미지URL\t1,000\t원\t"고급전통봉투(2P/1000) 레드"\t상품평점 5점 만점에\t4.9점\t(상품평 개수28건)\t1111명 봤어요\t전통\t\thttps://www.daisomall.co.kr/pd/pdr/SCR_PDR_0001?pdNo=1038756`}
        style={{
          width: "100%",
          height: 160,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          padding: 8,
        }}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button
          onClick={handleImport}
          disabled={importing || !products.length}
          style={{
            borderRadius: 8,
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            background: "#111827",
            color: "white",
            cursor: "pointer",
          }}
        >
          {importing
            ? `업로드 중… (${done}/${products.length})`
            : `Firestore에 업로드 (${products.length}개)`}
        </button>
      </div>

      <h3 style={{ marginTop: 20 }}>미리보기</h3>
      {!products.length ? (
        <div style={{ color: "#6b7280" }}>붙여넣은 내용이 없습니다.</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px,1fr))",
            gap: 12,
          }}
        >
          {products.map((p, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 10,
              }}
            >
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ fontWeight: 600 }}>{p.name}</div>
              </a>
              <div>
                {p.price.toLocaleString()}원 · 평점 {p.rating} · 리뷰 {p.reviewCount} · 조회 {p.views}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                상품코드: {p.productCode}
              </div>
              {p.tags?.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                    marginTop: 6,
                  }}
                >
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: 12,
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        padding: "2px 8px",
                        borderRadius: 9999,
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
