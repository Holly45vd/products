import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import ProductCard from "../components/ProductCard";

/* ================= MUI ================= */
import {
  Container,
  Box,
  Grid,
  Card,
  CardContent,
  TextField,
  Select,
  MenuItem,
  Button,
  Chip,
  Stack,
  Divider,
  Typography,
  InputAdornment,
  Paper,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  CircularProgress,
  Checkbox,                 // ✅ 추가
  FormControlLabel,         // ✅ 추가
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import CategoryIcon from "@mui/icons-material/Category";
import LayersIcon from "@mui/icons-material/Layers";

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

  // ✅ 재입고 예정 제외 체크박스 상태
  const [excludeRestock, setExcludeRestock] = useState(false);

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
    const tagTokens = tokenizeTags(fTag);
    if (!tagTokens.length) return new Map();

    let base = items;
    if (onlySaved && user) base = base.filter((p) => savedIds.has(p.id));

    base = base.filter((p) => {
      const tagSet = new Set((p.tags || []).map((t) => String(t).toLowerCase()));
      return tagTokens.every((t) => tagSet.has(t));
    });

    const k = qText.trim().toLowerCase();
    if (k) {
      base = base.filter((p) => {
        const hay = [p.name, p.productCode, ...(p.tags || [])]
          .filter(Boolean).join(" ").toLowerCase();
        return hay.includes(k);
      });
    }

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

    // ✅ 재입고 예정 제외 체크 적용
    if (excludeRestock) {
      base = base.filter((p) => !isRestockPending(p));
    }

    // 태그 파셋(포함/제외) 적용
    if (fTag && facetCatsL1.size > 0) {
      base = base.filter((p) => {
        const key = p.categoryL1 || "(미지정)";
        const hit = facetCatsL1.has(key);
        return facetMode === "include" ? hit : !hit;
      });
    }

    return base;
  }, [items, onlySaved, user, savedIds, fCatL1, fCatL2, fTag, qText, excludeRestock, facetCatsL1, facetMode]);

  const resetFilters = () => {
    setFCatL1("");
    setFCatL2("");
    setFTag("");
    setFacetCatsL1(new Set());
    setFacetMode("include");
    setExcludeRestock(false);     // ✅ 함께 초기화
  };

  const l2Options = fCatL1 ? CATEGORY_MAP[fCatL1] || [] : [];

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      {/* 검색 바 */}
      <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, mb: 1.5 }}>
        <TextField
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          placeholder="검색: 상품명 / 코드 / 태그 / 카테고리"
          fullWidth
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      {/* 필터 바 */}
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={1.5} alignItems="center">
            {/* L1 */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                label="대분류(L1)"
                value={fCatL1}
                onChange={(e) => {
                  setFCatL1(e.target.value);
                  setFCatL2("");
                }}
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <CategoryIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              >
                <MenuItem value="">전체</MenuItem>
                {Object.keys(CATEGORY_MAP).map((k) => (
                  <MenuItem key={k} value={k}>
                    {k}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* L2 */}
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                select
                label="중분류(L2)"
                value={fCatL2}
                onChange={(e) => setFCatL2(e.target.value)}
                fullWidth
                size="small"
                disabled={!fCatL1}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LayersIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              >
                <MenuItem value="">{fCatL1 ? "전체" : "대분류 먼저 선택"}</MenuItem>
                {l2Options.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>

            {/* 태그 */}
            <Grid item xs={12} md={3}>
              <TextField
                value={fTag}
                onChange={(e) => setFTag(e.target.value)}
                placeholder="태그 필터 (쉼표/공백 구분: 전통, 봉투)"
                fullWidth
                size="small"
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LocalOfferIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>

            {/* ✅ 재입고 예정 제외 체크박스 */}
            <Grid item xs={12} sm={6} md={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={excludeRestock}
                    onChange={(e) => setExcludeRestock(e.target.checked)}
                    size="small"
                  />
                }
                label="재입고 예정 제외"
              />
            </Grid>

            {/* 초기화/적용 */}
            <Grid item xs={12} sm={6} md={1.5}>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Tooltip title="필터 초기화">
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      startIcon={<RestartAltIcon />}
                      onClick={resetFilters}
                    >
                      초기화
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="필터 적용">
                  <span>
                    <Button variant="contained" size="small" startIcon={<FilterAltIcon />}>
                      적용
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      {/* 태그 검색 결과 기반 카테고리 파셋(포함/제외) */}
      {fTag && tagFacetsL1.size > 0 && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Typography variant="subtitle2">카테고리 파셋 (태그 결과 기준)</Typography>
              <Box sx={{ flex: 1 }} />
              <ToggleButtonGroup
                size="small"
                value={facetMode}
                exclusive
                onChange={(_, v) => v && setFacetMode(v)}
              >
                <ToggleButton value="include">포함</ToggleButton>
                <ToggleButton value="exclude">제외</ToggleButton>
              </ToggleButtonGroup>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setFacetCatsL1(new Set())}
                sx={{ ml: 1 }}
              >
                선택 해제
              </Button>
            </Stack>

            <Divider sx={{ my: 1 }} />

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {Array.from(tagFacetsL1.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([l1, cnt]) => {
                  const active = facetCatsL1.has(l1);
                  return (
                    <Chip
                      key={l1}
                      label={`${l1} · ${cnt.toLocaleString()}`}
                      clickable
                      variant={active ? "filled" : "outlined"}
                      color={active ? (facetMode === "include" ? "info" : "error") : "default"}
                      onClick={() =>
                        setFacetCatsL1((prev) => {
                          const next = new Set(prev);
                          if (next.has(l1)) next.delete(l1);
                          else next.add(l1);
                          return next;
                        })
                      }
                    />
                  );
                })}
            </Stack>

            {facetCatsL1.size > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                적용: {facetMode === "include" ? "선택 카테고리만 표시" : "선택 카테고리 제외"} · 선택{" "}
                {facetCatsL1.size}개
              </Typography>
            )}
          </CardContent>
        </Card>
      )}

      {/* 결과 정보 */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          총 {items.length.toLocaleString()}개 / 표시 {filtered.length.toLocaleString()}개
        </Typography>
        {onlySaved && user && <Chip size="small" label="저장만 보기" variant="outlined" />}
        {fCatL1 && <Chip size="small" label={`L1=${fCatL1}`} />}
        {fCatL2 && <Chip size="small" label={`L2=${fCatL2}`} />}
        {fTag && <Chip size="small" label={`태그=${fTag}`} />}
        {qText && <Chip size="small" label={`검색="${qText}"`} />}
        {excludeRestock && <Chip size="small" color="default" variant="outlined" label="재입고 제외" />} {/* ✅ 요약 */}
        {fTag && facetCatsL1.size > 0 && (
          <Chip
            size="small"
            label={`파셋(${facetMode}): ${Array.from(facetCatsL1).join(", ")}`}
          />
        )}
      </Stack>

      {/* 리스트 */}
      {loading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            불러오는 중…
          </Typography>
        </Stack>
      ) : filtered.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
          <Typography color="text.secondary">검색/필터 결과가 없습니다.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={1.5}>
          {filtered.map((p) => (
            <Grid item key={p.id} xs={6} sm={4} md={3} lg={3}>
              {/* 반응형 그리드 분할값은 원하는 대로 조절 가능 */}
              <ProductCard
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
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
