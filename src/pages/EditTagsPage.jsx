// src/pages/EditTagsAndCategoriesPage.jsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
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
  limit as fsLimit,
  startAfter as fsStartAfter,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";

/* ================= MUI ================= */
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Checkbox,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Select,
  MenuItem,
  Chip,
  Stack,
  Divider,
  Snackbar,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Menu,
  Tooltip,
  FormControlLabel,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DeleteIcon from "@mui/icons-material/Delete";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DownloadIcon from "@mui/icons-material/Download";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import AddIcon from "@mui/icons-material/Add";
import TagIcon from "@mui/icons-material/Sell";
import RefreshIcon from "@mui/icons-material/Refresh";
import CategoryIcon from "@mui/icons-material/Category";

/** ===== 카테고리 정의 ===== */
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

/** ===== 유틸 ===== */
const PAGE_SIZE = 120;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tokenizeTags = (input = "") =>
  String(input)
    .split(/[,|#/ ]+/)
    .map((s) => s.trim())
    .filter(Boolean);

const csvEscape = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

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
    "이미지URL",
    "이미지여부(hasImage)",
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
        p.imageUrl || "",
        p.imageUrl ? "Y" : "N",
        p.categoryL1 || "",
        p.categoryL2 || "",
      ]
        .map(csvEscape)
        .join(",")
    );
  });
  return lines.join("\r\n");
}

const downloadText = (content, filename, mime = "text/csv;charset=utf-8") => {
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
};

/* =============== 공통 확인 다이얼로그 =============== */
function ConfirmDialog({ open, title, message, onCancel, onConfirm, confirmText = "확인", loading = false }) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ whiteSpace: "pre-line" }}>{message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          취소
        </Button>
        <Button variant="contained" color="error" startIcon={<DeleteIcon />} onClick={onConfirm} disabled={loading}>
          {loading ? "처리중…" : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* =============== CSV 업서트 모달(MUI 버전) =============== */
const CsvImportModal = React.memo(function CsvImportModal({ open, onClose, onAfterImport }) {
  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]); // string[][]
  const [header, setHeader] = useState([]); // normalized
  const [overwriteMode, setOverwriteMode] = useState(false);
  const [replaceTags, setReplaceTags] = useState(true);
  const [replaceCategories, setReplaceCategories] = useState(true);
  const [progress, setProgress] = useState({ done: 0, total: 0, running: false });

  const fileRef = useRef(null); // ⬅️ 파일 선택 강제 오픈용 ref

  const parsedProducts = useMemo(() => {
    if (!rows.length) return [];
    return rows.map((r) => rowToProduct(r, header)).filter(Boolean);
  }, [rows, header]);

  const parseCsv = (text) => {
    let src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
        } else inQ = !inQ;
        continue;
      }
      if (!inQ && (ch === sep || ch === "\n")) {
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
  };

  const normalizeHeader = (h = "") => {
    const raw = String(h).trim();
    const canon = raw.toLowerCase().replace(/\s+/g, "").replace(/\([^)]*\)/g, "");
    if (["id", "상품id", "문서id"].includes(canon)) return "id";
    if (["상품명", "name", "title"].includes(canon)) return "name";
    if (["상품코드", "productcode", "code", "pdno"].includes(canon)) return "productCode";
    if (["가격", "price"].includes(canon)) return "price";
    if (["평점", "rating"].includes(canon)) return "rating";
    if (["리뷰수", "review", "reviewcount"].includes(canon)) return "reviewCount";
    if (["조회수", "views", "view"].includes(canon)) return "views";
    if (["태그", "tags"].includes(canon)) return "tags";
    if (["링크", "url", "link"].includes(canon)) return "link";
    if (["이미지", "이미지url", "image", "imageurl", "thumbnail"].includes(canon)) return "imageUrl";
    if (["재입고", "restock", "restockable"].includes(canon)) return "restockable";
    if (["상태", "status"].includes(canon)) return "status";
    if (["재고", "stock", "재고수량"].includes(canon)) return "stock";
    if (/^(대분류|categoryl1|category_l1|lnb|lnb1)$/.test(canon)) return "categoryL1";
    if (/^(중분류|categoryl2|category_l2|sub|lnb2)$/.test(canon)) return "categoryL2";
    return raw;
  };

  const parseKoreanCount = (text = "") => {
    const t = String(text).replace(/[\s,()보기]/g, "");
    if (!t) return 0;
    const mMan = t.match(/([\d.]+)\s*만/);
    const mCheon = t.match(/([\d.]+)\s*천/);
    if (mMan) return Math.round(parseFloat(mMan[1]) * 10000);
    if (mCheon) return Math.round(parseFloat(mCheon[1]) * 1000);
    const num = t.match(/[\d.]+/);
    return num ? Number(num[0]) : 0;
  };

  const parsePrice = (text = "") => {
    const n = String(text).replace(/[^\d.]/g, "");
    return n ? Number(n) : 0;
  };

  const clean = (s = "") => String(s).replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();

  const rowToProduct = (row, header) => {
    const obj = {};
    header.forEach((key, idx) => (obj[key] = row[idx] ?? ""));
    const id = clean(obj.id || obj.productCode || "");
    if (!id) return null;

    const product = { id };
    const fields = {
      name: clean(obj.name || ""),
      imageUrl: clean(obj.imageUrl || ""),
      link: clean(obj.link || ""),
      productCode: clean(obj.productCode || ""),
      price: obj.price !== undefined ? parsePrice(obj.price) : undefined,
      rating: obj.rating !== undefined ? parseFloat(String(obj.rating).replace(/[^\d.]/g, "")) || 0 : undefined,
      reviewCount: obj.reviewCount !== undefined ? parseKoreanCount(obj.reviewCount) : undefined,
      views: obj.views !== undefined ? parseKoreanCount(obj.views) : undefined,
      restockable: obj.restockable !== undefined ? /^(true|1|예|y)$/i.test(String(obj.restockable).trim()) : undefined,
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
  };

  const loadText = (text) => {
    const grid = parseCsv(text);
    if (!grid.length) {
      setRows([]);
      setHeader([]);
      setRaw("");
      return;
    }
    const [h0, ...body] = grid;
    const norm = h0.map(normalizeHeader);
    setRaw(text);
    setRows(body);
    setHeader(norm);
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    const text = await f.text();
    loadText(text);
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
    if (!parsedProducts.length) return alert("유효한 행이 없습니다.");
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
          if (replaceTags && rest.tags) payload.tags = rest.tags;
          ["name", "imageUrl", "link", "productCode", "price", "rating", "reviewCount", "views", "restockable", "status", "stock"].forEach(
            (k) => {
              if (rest[k] !== undefined) payload[k] = rest[k];
            }
          );
          if (replaceCategories) {
            if (rest.categoryL1 !== undefined) payload.categoryL1 = rest.categoryL1;
            if (rest.categoryL2 !== undefined) payload.categoryL2 = rest.categoryL2;
          }
          batch.set(doc(db, "products", id), payload, { merge: true });
        });
        await batch.commit();
        setProgress((s) => ({ ...s, done: Math.min(s.done + chunk.length, total) }));
        await sleep(10);
      }
      onAfterImport?.();
      onClose?.();
    } catch (e) {
      alert(`에러: ${e.message}`);
    } finally {
      setProgress({ done: 0, total: 0, running: false });
    }
  };

  return (
    <Dialog open={open} onClose={progress.running ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogTitle>CSV 업서트(등록/업데이트)</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {/* 파일 선택 (ref.click 방식) */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,text/csv,text/tab-separated-values"
              style={{ display: "none" }}
              onChange={onFile}
            />
            <Button
              variant="outlined"
              startIcon={<CloudUploadIcon />}
              onClick={() => {
                if (fileRef.current) fileRef.current.value = ""; // 같은 파일 재선택 이슈 방지
                fileRef.current?.click();
              }}
            >
              파일 선택
            </Button>
            <Button variant="outlined" onClick={downloadTemplate}>
              템플릿 다운로드
            </Button>
            <Typography variant="body2" color="text.secondary">
              {fileName ? `선택된 파일: ${fileName}` : "CSV/TSV 지원 (UTF-8, BOM 권장)"}
            </Typography>
          </Stack>

          {/* 드래그앤드롭 보조 입력 */}
          <Box
            sx={{
              p: 2,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 1,
              textAlign: "center",
              bgcolor: "background.default",
              userSelect: "none",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer?.files?.[0];
              if (!f) return;
              setFileName(f.name);
              const text = await f.text();
              loadText(text);
            }}
          >
            여기로 CSV/TSV 파일을 드래그해서 놓아도 됩니다.
          </Box>

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Chip
              label={`문서 덮어쓰기: ${overwriteMode ? "ON" : "OFF"}`}
              onClick={() => setOverwriteMode((v) => !v)}
              variant={overwriteMode ? "filled" : "outlined"}
            />
            <Chip label={`태그 교체: ${replaceTags ? "ON" : "OFF"}`} onClick={() => setReplaceTags((v) => !v)} icon={<TagIcon />} variant={replaceTags ? "filled" : "outlined"} />
            <Chip label={`카테고리 교체: ${replaceCategories ? "ON" : "OFF"}`} onClick={() => setReplaceCategories((v) => !v)} icon={<CategoryIcon />} variant={replaceCategories ? "filled" : "outlined"} />
            <Button variant="contained" onClick={handleImport} disabled={!parsedProducts.length || progress.running}>
              {progress.running ? `처리중… (${progress.done}/${progress.total})` : `업서트 실행 (${parsedProducts.length}개)`}
            </Button>
          </Stack>

          {/* 붙여넣기 → 즉시 파싱 */}
          <TextField
            minRows={6}
            maxRows={12}
            multiline
            placeholder={`여기에 CSV/TSV 붙여넣기\n예시: 상품ID,상품명,가격,태그,대분류(categoryL1),중분류(categoryL2)\n1038756,전통문양 봉투 2매입,1000,"전통 | 봉투 | 핑크",전통/시리즈,전통 시리즈`}
            value={raw}
            onChange={(e) => {
              const v = e.target.value;
              setRaw(v);
              if (v) loadText(v);
            }}
            fullWidth
          />

          <Divider />

          <Typography variant="subtitle1">미리보기 ({parsedProducts.length}행)</Typography>
          <Box sx={{ overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {["id", "name", "productCode", "price", "rating", "reviewCount", "views", "tags", "link", "imageUrl", "restockable", "status", "stock", "categoryL1", "categoryL2"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #eee", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedProducts.slice(0, 200).map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
                    <td style={{ padding: 8 }}>{p.id}</td>
                    <td style={{ padding: 8 }}>{p.name || ""}</td>
                    <td style={{ padding: 8 }}>{p.productCode || ""}</td>
                    <td style={{ padding: 8 }}>{p.price ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.rating ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.reviewCount ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.views ?? ""}</td>
                    <td style={{ padding: 8 }}>{Array.isArray(p.tags) ? p.tags.join(" | ") : ""}</td>
                    <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.link || ""}</td>
                    <td style={{ padding: 8, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.imageUrl || ""}</td>
                    <td style={{ padding: 8 }}>{p.restockable ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.status ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.stock ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.categoryL1 ?? ""}</td>
                    <td style={{ padding: 8 }}>{p.categoryL2 ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsedProducts.length > 200 && (
              <Typography variant="caption" sx={{ p: 1, display: "block", color: "text.secondary" }}>
                미리보기는 상위 200행까지만 표시. 전체 {parsedProducts.length}행 처리됨.
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={progress.running}>
          닫기
        </Button>
      </DialogActions>
    </Dialog>
  );
});

/* ======================= 메인 페이지 ======================= */
export default function EditTagsAndCategoriesPage() {
  const [items, setItems] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef(null);

  const [selected, setSelected] = useState(new Set());
  const [bulkInput, setBulkInput] = useState("");
  const [bulkWorking, setBulkWorking] = useState(false);
  const [l1, setL1] = useState("");
  const [l2, setL2] = useState("");
  const [csvOpen, setCsvOpen] = useState(false);

  // 이미지 없는 상품만 보기
  const [noImageOnly, setNoImageOnly] = useState(false);

  // Snackbar
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });

  // Confirm (bulk delete / single delete)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmTargetIds, setConfirmTargetIds] = useState([]); // []=bulk, [id]=single

  // per-item menu state
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuTargetId, setMenuTargetId] = useState(null);

  const openMenu = (e, id) => {
    setMenuAnchor(e.currentTarget);
    setMenuTargetId(id);
  };
  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuTargetId(null);
  };

  const loadPage = useCallback(
    async (reset = false) => {
      setLoading(true);
      try {
        let qRef = query(collection(db, "products"), orderBy("updatedAt", "desc"), fsLimit(PAGE_SIZE));
        if (!reset && lastDocRef.current) {
          qRef = query(collection(db, "products"), orderBy("updatedAt", "desc"), fsStartAfter(lastDocRef.current), fsLimit(PAGE_SIZE));
        }
        const snap = await getDocs(qRef);
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p && p.name);

        if (reset) {
          setItems(rows);
          setSelected(new Set());
        } else {
          setItems((prev) => [...prev, ...rows]);
        }
        if (snap.docs.length < PAGE_SIZE) {
          setHasMore(false);
        } else {
          setHasMore(true);
        }
        lastDocRef.current = snap.docs[snap.docs.length - 1] || null;
      } catch (e) {
        setSnack({ open: true, msg: `불러오기 실패: ${e.message}`, severity: "error" });
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  const reloadAll = useCallback(() => {
    lastDocRef.current = null;
    setHasMore(true);
    loadPage(true);
  }, [loadPage]);

  // 디바운스 검색
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(qText.trim().toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [qText]);

  const filtered = useMemo(() => {
    const base = items;
    const searched = debounced
      ? base.filter((p) => {
          const hay = [p.name, p.productCode, ...(p.tags || []), p.categoryL1 || "", p.categoryL2 || ""]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(debounced);
        })
      : base;
    return searched.filter((p) => !noImageOnly || !p.imageUrl);
  }, [items, debounced, noImageOnly]);

  // 선택
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

  // 태그 벌크 추가/삭제
  const handleBulkAdd = async () => {
    const tokens = tokenizeTags(bulkInput);
    if (!tokens.length) return setSnack({ open: true, msg: "추가할 태그를 입력하세요.", severity: "warning" });
    if (selected.size === 0) return setSnack({ open: true, msg: "선택된 상품이 없습니다.", severity: "warning" });

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => batch.update(doc(db, "products", id), { tags: arrayUnion(...tokens), updatedAt: serverTimestamp() }));
      await batch.commit();
      setItems((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, tags: Array.from(new Set([...(p.tags || []), ...tokens])) } : p)));
      setBulkInput("");
      setSnack({ open: true, msg: `태그 추가 완료 (${selected.size}개)`, severity: "success" });
    } catch (e) {
      setSnack({ open: true, msg: `벌크 추가 실패: ${e.message}`, severity: "error" });
    } finally {
      setBulkWorking(false);
    }
  };

  const handleBulkRemove = async () => {
    const tokens = tokenizeTags(bulkInput);
    if (!tokens.length) return setSnack({ open: true, msg: "삭제할 태그를 입력하세요.", severity: "warning" });
    if (selected.size === 0) return setSnack({ open: true, msg: "선택된 상품이 없습니다.", severity: "warning" });

    if (!window.confirm(`선택된 ${selected.size}개에서 [${tokens.join(", ")}] 태그를 제거할까요?`)) return;

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => batch.update(doc(db, "products", id), { tags: arrayRemove(...tokens), updatedAt: serverTimestamp() }));
      await batch.commit();
      setItems((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, tags: (p.tags || []).filter((t) => !tokens.includes(t)) } : p)));
      setBulkInput("");
      setSnack({ open: true, msg: `태그 삭제 완료 (${selected.size}개)`, severity: "success" });
    } catch (e) {
      setSnack({ open: true, msg: `벌크 삭제 실패: ${e.message}`, severity: "error" });
    } finally {
      setBulkWorking(false);
    }
  };

  // 카테고리 벌크 지정
  const handleBulkSetCategory = async () => {
    if (!l1 || !l2) return setSnack({ open: true, msg: "대분류/중분류를 선택하세요.", severity: "warning" });
    if (selected.size === 0) return setSnack({ open: true, msg: "선택된 상품이 없습니다.", severity: "warning" });

    if (!window.confirm(`선택된 ${selected.size}개 상품의 카테고리를\n${l1} > ${l2} 로 지정할까요?`)) return;

    setBulkWorking(true);
    try {
      const batch = writeBatch(db);
      selected.forEach((id) => batch.update(doc(db, "products", id), { categoryL1: l1, categoryL2: l2, updatedAt: serverTimestamp() }));
      await batch.commit();
      setItems((prev) => prev.map((p) => (selected.has(p.id) ? { ...p, categoryL1: l1, categoryL2: l2 } : p)));
      setSnack({ open: true, msg: `카테고리 지정 완료 (${selected.size}개)`, severity: "success" });
    } catch (e) {
      setSnack({ open: true, msg: `카테고리 지정 실패: ${e.message}`, severity: "error" });
    } finally {
      setBulkWorking(false);
    }
  };

  // CSV
  const downloadCsv = (onlySelected = false) => {
    const list = onlySelected ? filtered.filter((p) => selected.has(p.id)) : filtered;
    if (list.length === 0) return setSnack({ open: true, msg: "내보낼 항목이 없습니다.", severity: "warning" });
    const csv = buildCsv(list);
    const today = new Date().toISOString().slice(0, 10);
    downloadText(csv, `상품리스트_${onlySelected ? "선택만" : "필터결과"}_${today}.csv`);
  };

  // 삭제 (개별/다중 공용)
  const requestDelete = (ids) => {
    setConfirmTargetIds(ids);
    setConfirmOpen(true);
    closeMenu();
  };

  const doDelete = async () => {
    setConfirmLoading(true);
    try {
      if (confirmTargetIds.length === 1) {
        await deleteDoc(doc(db, "products", confirmTargetIds[0]));
      } else {
        // 대량 삭제: batch(최대 500). 안전하게 400으로 분할
        const ids = [...confirmTargetIds];
        const CHUNK = 400;
        for (let i = 0; i < ids.length; i += CHUNK) {
          const chunk = ids.slice(i, i + CHUNK);
          const batch = writeBatch(db);
          chunk.forEach((id) => batch.delete(doc(db, "products", id)));
          await batch.commit();
        }
      }
      setItems((prev) => prev.filter((p) => !confirmTargetIds.includes(p.id)));
      setSelected((prev) => {
        const next = new Set(prev);
        confirmTargetIds.forEach((id) => next.delete(id));
        return next;
      });
      setSnack({ open: true, msg: `삭제 완료 (${confirmTargetIds.length}개)`, severity: "success" });
    } catch (e) {
      setSnack({ open: true, msg: `삭제 실패: ${e.message}`, severity: "error" });
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
      setConfirmTargetIds([]);
    }
  };

  const l2Options = useMemo(() => (l1 ? CATEGORY_MAP[l1] || [] : []), [l1]);

  return (
    <>
      {/* 상단 앱바 */}
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar sx={{ gap: 2, flexWrap: "wrap" }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            상품 태그/카테고리 편집
          </Typography>
          <Box sx={{ flex: 1 }} />
          <TextField
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder="검색: 상품명 / 상품코드 / 태그 / 카테고리"
            size="small"
            sx={{ minWidth: 340 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <Tooltip title="전체 새로고침">
            <span>
              <IconButton onClick={reloadAll} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Button variant="contained" startIcon={<CloudUploadIcon />} onClick={() => setCsvOpen(true)}>
            CSV 업서트
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv(false)}>
            CSV(필터결과)
          </Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => downloadCsv(true)} disabled={selected.size === 0}>
            CSV(선택만)
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {/* 선택/벌크 툴바 */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={4}>
                <TextField
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder="태그 입력: 전통, 핑크 #봉투"
                  size="small"
                  fullWidth
                  InputProps={{ startAdornment: <InputAdornment position="start"><TagIcon fontSize="small" /></InputAdornment> }}
                />
              </Grid>
              <Grid item>
                <Button variant="contained" onClick={handleBulkAdd} disabled={bulkWorking || selected.size === 0} startIcon={<AddIcon />}>
                  태그 추가({selected.size})
                </Button>
              </Grid>
              <Grid item>
                <Button variant="outlined" onClick={handleBulkRemove} disabled={bulkWorking || selected.size === 0}>
                  태그 삭제({selected.size})
                </Button>
              </Grid>
              <Grid item>
                <Divider orientation="vertical" flexItem />
              </Grid>
              <Grid item xs={12} md={3}>
                <Select size="small" value={l1} onChange={(e) => { setL1(e.target.value); setL2(""); }} displayEmpty fullWidth>
                  <MenuItem value="">
                    <em>대분류(L1)</em>
                  </MenuItem>
                  {Object.keys(CATEGORY_MAP).map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </Select>
              </Grid>
              <Grid item xs={12} md={3}>
                <Select size="small" value={l2} onChange={(e) => setL2(e.target.value)} displayEmpty fullWidth disabled={!l1}>
                  <MenuItem value="">
                    <em>{l1 ? "중분류(L2)" : "대분류 먼저 선택"}</em>
                  </MenuItem>
                  {l2Options.map((k) => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </Select>
              </Grid>
              <Grid item>
                <Button variant="contained" color="primary" onClick={handleBulkSetCategory} disabled={bulkWorking || selected.size === 0 || !l1 || !l2} startIcon={<CategoryIcon />}>
                  카테고리 지정({selected.size})
                </Button>
              </Grid>
              <Grid item>
                <Button variant="outlined" onClick={selectAllOnPage}>
                  전체선택
                </Button>
              </Grid>
              <Grid item>
                <Button variant="outlined" onClick={clearSelection}>
                  선택해제
                </Button>
              </Grid>
              <Grid item sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  disabled={selected.size === 0}
                  onClick={() => requestDelete([...selected])}
                  title="선택 항목 삭제"
                >
                  선택 삭제
                </Button>
                <FormControlLabel
                  control={<Checkbox checked={noImageOnly} onChange={(e) => setNoImageOnly(e.target.checked)} size="small" />}
                  label="이미지 없는 상품만"
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* 리스트 */}
        {loading && items.length === 0 ? (
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              불러오는 중…
            </Typography>
          </Stack>
        ) : filtered.length === 0 ? (
          <Typography color="text.secondary">검색 결과가 없습니다.</Typography>
        ) : (
          <Grid container spacing={1.5}>
            {filtered.map((p) => {
              const isChecked = selected.has(p.id);
              const uniqTags = Array.from(new Set(p.tags || []));
              return (
                <Grid item xs={12} key={p.id}>
                  <Card variant="outlined">
                    <CardContent sx={{ display: "grid", gridTemplateColumns: "36px 88px 1fr 36px", gap: 12, alignItems: "center" }}>
                      <Checkbox checked={isChecked} onChange={() => toggleCheck(p.id)} inputProps={{ "aria-label": `select-${p.name}` }} />
                      {p.imageUrl ? (
                        <CardMedia component="img" image={p.imageUrl} alt={p.name} sx={{ width: 80, height: 80, borderRadius: 1, bgcolor: "grey.100", objectFit: "cover" }} />
                      ) : (
                        <Box sx={{ width: 80, height: 80, borderRadius: 1, bgcolor: "grey.100" }} />
                      )}
                      <Box>
                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                          <Typography fontWeight={700}>{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            ({p.productCode || p.id})
                          </Typography>
                          {p.link && (
                            <Button size="small" href={p.link} target="_blank" rel="noopener noreferrer">
                              원본 링크
                            </Button>
                          )}
                          {isChecked && <Chip label="선택됨" size="small" color="default" variant="outlined" sx={{ ml: "auto" }} />}
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5, flexWrap: "wrap" }}>
                          {p.categoryL1 || p.categoryL2 ? (
                            <>
                              <Chip size="small" label={`L1: ${p.categoryL1 || "-"}`} color="primary" variant="outlined" />
                              <Chip size="small" label={`L2: ${p.categoryL2 || "-"}`} color="info" variant="outlined" />
                            </>
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              카테고리 미지정
                            </Typography>
                          )}
                        </Stack>

                        <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap" }}>
                          {uniqTags.length > 0 ? uniqTags.map((t) => <Chip key={t} label={`#${t}`} size="small" variant="outlined" />) : <Typography variant="caption" color="text.secondary">태그 없음</Typography>}
                        </Stack>
                      </Box>

                      {/* per-item menu */}
                      <Box sx={{ display: "flex", justifyContent: "center" }}>
                        <IconButton aria-label="more" onClick={(e) => openMenu(e, p.id)}>
                          <MoreVertIcon />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        )}

        {/* 페이지네이션 */}
        <Stack alignItems="center" sx={{ mt: 2 }}>
          {hasMore ? (
            <Button variant="contained" onClick={() => loadPage(false)} disabled={loading} sx={{ minWidth: 200 }}>
              {loading ? "불러오는 중…" : "더 불러오기"}
            </Button>
          ) : (
            <Typography variant="caption" color="text.secondary">
              모든 항목을 불러왔습니다.
            </Typography>
          )}
        </Stack>
      </Container>

      {/* CSV 모달 */}
      <CsvImportModal open={csvOpen} onClose={() => setCsvOpen(false)} onAfterImport={() => reloadAll()} />

      {/* per-item 메뉴 */}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu}>
        <MenuItem
          onClick={() => {
            requestDelete([menuTargetId]);
          }}
        >
          <DeleteIcon fontSize="small" style={{ marginRight: 8 }} /> 삭제
        </MenuItem>
      </Menu>

      {/* 삭제 확인 */}
      <ConfirmDialog
        open={confirmOpen}
        title="삭제 확인"
        message={confirmTargetIds.length > 1 ? `선택된 ${confirmTargetIds.length}개 항목을 삭제합니다.\n이 작업은 되돌릴 수 없습니다.` : "이 상품을 삭제합니다. 되돌릴 수 없습니다."}
        confirmText="삭제"
        onCancel={() => !confirmLoading && setConfirmOpen(false)}
        onConfirm={doDelete}
        loading={confirmLoading}
      />

      {/* 스낵바 */}
      <Snackbar open={snack.open} autoHideDuration={3000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))} sx={{ width: "100%" }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
