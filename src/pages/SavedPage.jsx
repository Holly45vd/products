// src/pages/SavedPage.jsx
import React, { useEffect, useMemo, useState, useRef } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";
import ProductCard from "../components/ProductCard";

/* ================= MUI ================= */
import {
  Container,
  Stack,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Grid,
  Chip,
  Box,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";

/* ===== Utils ===== */
// 안전한 Timestamp → number(ms) 변환
function tsToMs(ts) {
  if (!ts) return 0;
  if (typeof ts?.toMillis === "function") return ts.toMillis();
  const v = Number(ts); // serverTimestamp 직후 미해결 보호
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
        const snaps = await Promise.all(
          chunks.map((ids) =>
            getDocs(query(collection(db, "products"), where(documentId(), "in", ids)))
          )
        );

        const results = [];
        snaps.forEach((snap) => {
          snap.forEach((d) => results.push({ id: d.id, ...d.data() }));
        });

        const foundIds = new Set(results.map((r) => r.id));
        const missingCount = savedIdList.filter((id) => !foundIds.has(id)).length;

        results.sort((a, b) => {
          const av = tsToMs(a.updatedAt) || tsToMs(a.createdAt) || 0;
          const bv = tsToMs(b.updatedAt) || tsToMs(b.createdAt) || 0;
          if (bv !== av) return bv - av;
          return String(b.id).localeCompare(String(a.id));
        });

        if (!canceled && myRun === runIdRef.current) {
          setItems(results);
          if (missingCount > 0) {
            setErrorMsg(
              `알림: 저장된 ${savedIdList.length}개 중 ${missingCount}개는 현재 조회할 수 없습니다(삭제/권한/비공개 가능).`
            );
          }
        }
      } catch (e) {
        if (!canceled && myRun === runIdRef.current) {
          console.error(e);
          const msg = String(e?.message || "");
          const hint = /per-query|disjunct/i.test(msg)
            ? " (힌트: Firestore 'in' 조건은 10개씩 끊어 처리하세요.)"
            : /permission|denied|insufficient/i.test(msg)
            ? " (힌트: 인증/규칙 권한을 확인하세요.)"
            : "";
          setErrorMsg(`오류: ${msg || "목록을 불러오는 중 문제가 발생했습니다."}${hint}`);
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

  // 필터: 낮은 비용을 위해 소문자 haystack 캐시
  const itemsForFilter = useMemo(
    () =>
      items.map((p) => ({
        raw: p,
        hay: [p.name, p.productCode, p.categoryL1, p.categoryL2, ...(p.tags || [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
      })),
    [items]
  );

  const filtered = useMemo(() => {
    if (!debouncedQ) return items;
    return itemsForFilter.filter((x) => x.hay.includes(debouncedQ)).map((x) => x.raw);
  }, [items, itemsForFilter, debouncedQ]);

  // 저장 토글
  const handleToggleSave = async (id) => {
    try {
      await toggleSave(id);
    } catch (e) {
      alert(e?.message || "저장 상태 변경 중 오류가 발생했습니다.");
    }
  };

  const savedTotal = savedIdList.length;

  // 클라이언트 측 간단 페이지네이션(카드 크기 줄였으므로 96개 기본)
  const PAGE = 96;
  const [page, setPage] = useState(1);
  const visible = useMemo(
    () => filtered.slice(0, PAGE * page),
    [filtered, page]
  );
  const canLoadMore = PAGE * page < filtered.length;

  return (
    <Container maxWidth="lg" sx={{ pb: 4 }}>
    

      {!user ? (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" fontWeight={700} gutterBottom>
            로그인 필요
          </Typography>
          <Typography color="text.secondary">
            상단에서 로그인/회원가입을 진행하세요.
          </Typography>
        </Box>
      ) : (
        <>
          {/* 검색 바 */}
          <Stack direction="row" spacing={1} alignItems="center" sx={{ my: 2 }}>
            <TextField
              value={qText}
              onChange={(e) => setQText(e.target.value)}
              placeholder="저장한 상품 내 검색"
              fullWidth
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: qText ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setQText("")} aria-label="검색어 지우기">
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Stack>

          {/* 에러/알림 */}
          {errorMsg && (
            <Alert severity={/오류:/.test(errorMsg) ? "error" : "warning"} sx={{ mb: 2 }}>
              {errorMsg}
            </Alert>
          )}

          {/* 로딩 */}
          {(loadingUser || loadingSaved || loading) ? (
            <Stack alignItems="center" sx={{ py: 8 }}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                불러오는 중…
              </Typography>
            </Stack>
          ) : (
            <>
              {/* 요약 */}
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap: "wrap" }}>
                <Chip variant="outlined" label={`총 저장 ${savedTotal.toLocaleString()}개`} />
                {debouncedQ && (
                  <Chip color="primary" label={`검색 결과 ${filtered.length.toLocaleString()}개`} />
                )}
              </Stack>

              {/* 결과 */}
              {filtered.length === 0 ? (
                <Alert sx={{ mt: 2 }} severity="info">
                  {savedTotal === 0
                    ? "저장한 상품이 없습니다."
                    : "검색 결과가 없습니다. 다른 키워드를 시도해 보세요."}
                </Alert>
              ) : (
                <>
                  <Grid
  container
  spacing={2}
  justifyContent="flex-start"
  alignItems="stretch"
>
  {visible.map((p) => (
    <Grid
      key={p.id}
      item
      xs={12}
      sm={6}
      md={3}  // ✅ 한 줄에 4개 (12 ÷ 3 = 4)
      sx={{
        display: "flex",
        justifyContent: "center",
      }}
    >
      <ProductCard
        product={p}
        user={user}
        isSaved={savedIds?.has(p.id)}
        onToggleSave={handleToggleSave}
        dense
      />
    </Grid>
  ))}
</Grid>


                  {/* 더보기 */}
                  {canLoadMore && (
                    <Stack alignItems="center" sx={{ mt: 2 }}>
                      <Button
                        variant="outlined"
                        onClick={() => setPage((v) => v + 1)}
                        sx={{ minWidth: 220 }}
                      >
                        더 보기
                      </Button>
                    </Stack>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </Container>
  );
}
