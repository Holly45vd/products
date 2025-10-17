// src/pages/OrdersPage.jsx
import React, { useEffect, useState, useMemo } from "react";
import { collection, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

/* =============== MUI =============== */
import {
  AppBar,
  Toolbar,
  Container,
  Typography,
  Stack,
  Button,
  IconButton,
  Paper,
  Card,
  CardContent,
  CardActions,
  Chip,
  Grid,
  Divider,
  Tooltip,
  CircularProgress,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";

const fmtKRW = (n = 0) => Number(n || 0).toLocaleString("ko-KR");

export default function OrdersPage() {
  const { user, loadingUser } = useSavedProducts();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [snack, setSnack] = useState({ open: false, msg: "", severity: "success" });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const navigate = useNavigate();

  const fetchOrders = async () => {
    if (!user) return;
    setErr("");
    setLoading(true);
    try {
      const qRef = query(
        collection(db, "users", user.uid, "orders"),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(qRef);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(rows);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "주문서 조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleAskDelete = (order) => {
    setConfirmTarget(order);
    setConfirmOpen(true);
  };

  const handleDeleteOrder = async () => {
    if (!user || !confirmTarget) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, "users", user.uid, "orders", confirmTarget.id));
      setOrders((prev) => prev.filter((o) => o.id !== confirmTarget.id));
      setSnack({ open: true, msg: "삭제 완료", severity: "success" });
    } catch (e) {
      console.error(e);
      setSnack({ open: true, msg: e?.message || "삭제 실패", severity: "error" });
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
      setConfirmTarget(null);
    }
  };

  const totalInfo = useMemo(() => {
    const count = orders.length;
    const sum = orders.reduce((s, o) => s + Number(o.finalTotal ?? o.totalPrice ?? 0), 0);
    return { count, sum };
  }, [orders]);

  /* ====== Guards ====== */
  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert severity="info">로그인이 필요합니다.</Alert>
      </Container>
    );
  }
  if (loadingUser || loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <CircularProgress />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          불러오는 중…
        </Typography>
      </Container>
    );
  }

  return (
    <>
      {/* 상단 앱바 */}
      <AppBar position="sticky" color="transparent" elevation={0} sx={{ borderBottom: "1px solid", borderColor: "divider" }}>
        <Toolbar>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            주문서 목록
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
            <Tooltip title="새로고침">
              <span>
                <IconButton onClick={fetchOrders} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate("/orders/new")}
            >
              주문서 만들기
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {/* 에러 알림 */}
        {err && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {err}
          </Alert>
        )}

        {/* 요약 바 */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
            <Chip label={`총 ${totalInfo.count.toLocaleString()}건`} />
            <Divider orientation="vertical" flexItem />
            <Chip color="primary" label={`합계 ${fmtKRW(totalInfo.sum)} 원`} />
          </Stack>
        </Paper>

        {/* 목록 */}
        {orders.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
            <Typography color="text.secondary">주문서가 없습니다.</Typography>
            <Button
              sx={{ mt: 2 }}
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate("/orders/new")}
            >
              주문서 만들기
            </Button>
          </Paper>
        ) : (
          <Grid container spacing={1.5}>
            {orders.map((o) => (
              <Grid item xs={12} key={o.id}>
                <Card variant="outlined">
                  <CardContent
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/orders/${o.id}`)}
                  >
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      justifyContent="space-between"
                      flexWrap="wrap"
                    >
                      <Typography fontWeight={700} noWrap>
                        {o.orderName || `#${o.id.slice(0, 8)}`} · {o.orderDate || "-"}
                      </Typography>
                      <Typography color="text.primary">
                        수량 <b>{o.totalQty || 0}</b>개 · 합계 <b>{fmtKRW(o.finalTotal ?? o.totalPrice)}</b> 원
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
                      {(o.items || []).slice(0, 6).map((it) => (
                        <Chip
                          key={it.productId}
                          size="small"
                          variant="outlined"
                          label={`${it.name} × ${it.qty}`}
                          sx={{ maxWidth: 260 }}
                        />
                      ))}
                      {(o.items || []).length > 6 && (
                        <Chip size="small" label={`…외 ${o.items.length - 6}개`} />
                      )}
                    </Stack>
                  </CardContent>

                  <CardActions sx={{ justifyContent: "flex-end" }}>
                    <Tooltip title="상세 열기">
                      <Button
                        size="small"
                        startIcon={<OpenInNewIcon />}
                        onClick={() => navigate(`/orders/${o.id}`)}
                      >
                        열기
                      </Button>
                    </Tooltip>
                    <Tooltip title="주문서 삭제">
                      <span>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeleteIcon />}
                          onClick={() => handleAskDelete(o)}
                        >
                          삭제
                        </Button>
                      </span>
                    </Tooltip>
                  </CardActions>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
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
          <Button onClick={() => setConfirmOpen(false)} disabled={deleting}>취소</Button>
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
        autoHideDuration={2500}
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
