// src/pages/OrderDetailPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

/* ================= MUI ================= */
import {
  AppBar,
  Toolbar,
  IconButton,
  Typography,
  Container,
  Card,
  CardContent,
  Grid,
  TextField,
  InputAdornment,
  Button,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Stack,
  Chip,
  Divider,
  CircularProgress,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Tooltip,
  Box, // ✅ 누락 보완
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

const fmtKRW = (n = 0) => Number(n || 0).toLocaleString("ko-KR");

export default function OrderDetailPage() {
  const { user, loadingUser } = useSavedProducts();
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // /orders/new 감지
  const isNew = !orderId && location.pathname.endsWith("/orders/new");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState(null);

  // 편집 상태
  const [orderName, setOrderName] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [items, setItems] = useState([]); // [{productId, name, price, qty, subtotal, ...}]

  // UI state
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 1) /orders/new 진입 시: 드래프트 생성 → 상세로 이동
  useEffect(() => {
    if (!user || !isNew) return;

    (async () => {
      try {
        const payload = {
          orderName: "새 주문서",
          orderDate: new Date().toISOString().slice(0, 10),
          discountAmount: 0,
          totalQty: 0,
          totalPrice: 0,
          finalTotal: 0,
          items: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        const ref = await addDoc(collection(db, "users", user.uid, "orders"), payload);
        navigate(`/orders/${ref.id}`, { replace: true, state: { created: true } });
      } catch (e) {
        console.error(e);
        setErr(e?.message || "주문서 생성 실패");
      }
    })();
  }, [user, isNew, navigate]);

  // 2) 기존 주문 상세 로드
  useEffect(() => {
    if (!user || isNew) {
      // isNew면 위 useEffect가 리다이렉트 처리
      if (!user) setLoading(false);
      return;
    }

    (async () => {
      setErr("");
      setLoading(true);
      try {
        const ref = doc(collection(db, "users", user.uid, "orders"), orderId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setErr("주문서를 찾을 수 없습니다.");
          setOrder(null);
          return;
        }
        const data = { id: snap.id, ...snap.data() };
        setOrder(data);
        setOrderName(data.orderName || "");
        setOrderDate(data.orderDate || new Date().toISOString().slice(0, 10));
        setDiscountAmount(Number(data.discountAmount || 0));
        setItems(
          (data.items || []).map((it) => ({
            ...it,
            price: Number(it.price || 0),
            qty: Number(it.qty || 0),
            subtotal:
              Number(it.subtotal || Number(it.price || 0) * Number(it.qty || 0)),
          }))
        );
      } catch (e) {
        console.error(e);
        setErr(e?.message || "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, orderId, isNew]);

  const totals = useMemo(() => {
    const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const totalPrice = items.reduce(
      (s, it) => s + Number(it.price || 0) * Number(it.qty || 0),
      0
    );
    const discount = Math.max(0, Number(discountAmount) || 0);
    const finalTotal = Math.max(0, totalPrice - discount);
    return { totalQty, totalPrice, discount, finalTotal };
  }, [items, discountAmount]);

  const setQty = (idx, v) => {
    setItems((prev) => {
      const cp = [...prev];
      let n = Number(String(v).replace(/[^\d]/g, ""));
      if (!Number.isFinite(n) || n < 0) n = 0;
      if (n > 9999) n = 9999;
      cp[idx] = { ...cp[idx], qty: n, subtotal: n * Number(cp[idx].price || 0) };
      return cp;
    });
  };

  const handleRemoveRow = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!user || !order) return;
    if (items.length === 0) {
      setSnack({
        open: true,
        msg: "최소 1개 이상의 아이템이 필요합니다.",
        severity: "warning",
      });
      return;
    }
    if (!orderDate || Number.isNaN(new Date(orderDate).getTime())) {
      setSnack({
        open: true,
        msg: "주문일이 올바르지 않습니다.",
        severity: "warning",
      });
      return;
    }

    const payload = {
      orderName: orderName?.trim() || "",
      orderDate,
      discountAmount: totals.discount,
      totalQty: totals.totalQty,
      totalPrice: totals.totalPrice,
      finalTotal: totals.finalTotal,
      items: items.map((it) => ({
        productId: it.productId,
        name: it.name || "",
        price: Number(it.price || 0),
        qty: Number(it.qty || 0),
        subtotal: Number(it.price || 0) * Number(it.qty || 0),
        imageUrl: it.imageUrl || "",
        productCode: it.productCode || "",
        categoryL1: it.categoryL1 || "",
        categoryL2: it.categoryL2 || "",
        link: it.link || "",
      })),
      updatedAt: serverTimestamp(),
    };

    try {
      setSaving(true);
      await updateDoc(doc(db, "users", user.uid, "orders", order.id), payload);
      setSnack({ open: true, msg: "저장 완료", severity: "success" });
      navigate("/orders", { replace: true });
    } catch (e) {
      console.error(e);
      setSnack({ open: true, msg: e?.message || "저장 실패", severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async () => {
    if (!user || !order) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "users", user.uid, "orders", order.id));
      setSnack({ open: true, msg: "삭제 완료", severity: "success" });
      navigate("/orders", { replace: true });
    } catch (e) {
      console.error(e);
      setSnack({ open: true, msg: e?.message || "삭제 실패", severity: "error" });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  /* ====== Guarded states ====== */
  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="info">로그인이 필요합니다.</Alert>
      </Container>
    );
  }
  if (loadingUser || loading) {
    return (
      <Container
        maxWidth="lg"
        sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          불러오는 중…
        </Typography>
      </Container>
    );
  }
  if (err) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">{err}</Alert>
      </Container>
    );
  }
  if (!order) return null;

  return (
    <>
      {/* 상단 앱바 */}
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{ borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Toolbar>
          <Tooltip title="뒤로">
            <IconButton edge="start" onClick={() => navigate(-1)}>
              <ArrowBackIcon />
            </IconButton>
          </Tooltip>
          <Typography variant="h6" sx={{ ml: 1, fontWeight: 700 }}>
            주문서 수정
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={items.length === 0 || saving}
            >
              {saving ? "저장중…" : "저장"}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => setConfirmOpen(true)}
            >
              삭제
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {/* 상단 폼 */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  label="주문서 이름"
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  fullWidth
                  size="small"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="주문일"
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="할인금액"
                  value={discountAmount}
                  onChange={(e) =>
                    setDiscountAmount(String(e.target.value).replace(/[^\d]/g, ""))
                  }
                  fullWidth
                  size="small"
                  inputMode="numeric"
                  InputProps={{
                    endAdornment: <InputAdornment position="end">원</InputAdornment>,
                    sx: { textAlign: "right" },
                  }}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* 합계바 */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            justifyContent="flex-end"
          >
            <Chip label={`총 수량 ${totals.totalQty}개`} variant="outlined" />
            <Divider flexItem orientation="vertical" sx={{ mx: 0.5 }} />
            <Chip label={`상품합계 ${fmtKRW(totals.totalPrice)} 원`} />
            <Chip
              color="default"
              variant="outlined"
              label={`할인 -${fmtKRW(totals.discount)} 원`}
            />
            <Chip color="primary" label={`결제합계 ${fmtKRW(totals.finalTotal)} 원`} />
          </Stack>
        </Paper>

        {/* 아이템 테이블 */}
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "grey.50" }}>
                <TableCell>상품</TableCell>
                <TableCell>코드</TableCell>
                <TableCell align="right">가격</TableCell>
                <TableCell align="center">수량</TableCell>
                <TableCell align="right">소계</TableCell>
                <TableCell align="center">원본/삭제</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((it, idx) => (
                <TableRow key={it.productId} hover>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Paper
                        variant="outlined"
                        sx={{
                          width: 60,
                          height: 60,
                          borderRadius: 1,
                          overflow: "hidden",
                          bgcolor: "grey.100",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {it.imageUrl ? (
                          <img
                            alt={it.name}
                            src={it.imageUrl}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            No Image
                          </Typography>
                        )}
                      </Paper>
                      <Box>
                        <Typography fontWeight={700} noWrap title={it.name}>
                          {it.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {it.categoryL1 || "-"} {it.categoryL2 ? `> ${it.categoryL2}` : ""}
                        </Typography>
                      </Box>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {it.productCode || it.productId}
                    </Typography>
                  </TableCell>

                  <TableCell align="right">{fmtKRW(it.price)} 원</TableCell>

                  <TableCell align="center" sx={{ minWidth: 100 }}>
                    <TextField
                      value={it.qty}
                      onChange={(e) => setQty(idx, e.target.value)}
                      size="small"
                      inputMode="numeric"
                      sx={{ width: 82 }}
                    />
                  </TableCell>

                  <TableCell align="right">
                    <Typography fontWeight={700}>
                      {fmtKRW(Number(it.price || 0) * Number(it.qty || 0))}
                    </Typography>{" "}
                    원
                  </TableCell>

                  <TableCell align="center" sx={{ whiteSpace: "nowrap" }}>
                    {it.link ? (
                      <Tooltip title="원본 열기">
                        <IconButton
                          size="small"
                          component="a"
                          href={it.link}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        -
                      </Typography>
                    )}
                    <Tooltip title="행 삭제">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={() => handleRemoveRow(idx)}
                          sx={{ ml: 1 }}
                        >
                          삭제
                        </Button>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}

              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                      아이템이 없습니다. (상단에서 저장할 수 없습니다)
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Container>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog
        open={confirmOpen}
        onClose={() => (deleting ? null : setConfirmOpen(false))}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>주문서 삭제</DialogTitle>
        <DialogContent>
          <DialogContentText>
            이 주문서를 삭제합니다. 되돌릴 수 없습니다.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={handleDeleteOrder}
            disabled={deleting}
          >
            {deleting ? "삭제중…" : "삭제"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* 스낵바 */}
      <Snackbar
        open={snack.open}
        autoHideDuration={3000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
      >
        <Alert
          severity={snack.severity}
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
          sx={{ width: "100%" }}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
