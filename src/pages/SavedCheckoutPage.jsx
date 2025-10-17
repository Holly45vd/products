// src/pages/SavedCheckoutPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection, documentId, getDocs, query, where, addDoc, serverTimestamp
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

/* ================= MUI ================= */
import {
  AppBar,
  Toolbar,
  Container,
  Typography,
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
  IconButton,
  Tooltip,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import ShoppingCartCheckoutIcon from "@mui/icons-material/ShoppingCartCheckout";
import RefreshIcon from "@mui/icons-material/Refresh";

function tsToMs(ts){ if(!ts) return 0; if(typeof ts?.toMillis==="function") return ts.toMillis(); const v=Number(ts); return Number.isFinite(v)?v:0; }
function chunk10(a){ const out=[]; for(let i=0;i<a.length;i+=10) out.push(a.slice(i,i+10)); return out; }
const fmtKRW = (n=0)=> Number(n||0).toLocaleString("ko-KR");
const isPositive = (n)=> Number(n||0) > 0;

/* "재입고 예정" 판별 */
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

export default function SavedCheckoutPage(){
  const { user, savedIds, loadingUser, loadingSaved } = useSavedProducts();
  const navigate = useNavigate();

  const [items,setItems] = useState([]);
  const [qty,setQty] = useState({});
  const [loading,setLoading] = useState(true);
  const [errorMsg,setErrorMsg] = useState("");

  // 주문 메타
  const [orderName,setOrderName] = useState("");
  const [orderDate,setOrderDate] = useState(()=> new Date().toISOString().slice(0,10));
  const [discountAmount,setDiscountAmount] = useState(0);

  // UI
  const [showZero, setShowZero] = useState(false);
  const [snack, setSnack] = useState({ open:false, msg:"", severity:"success" });

  const savedIdList = useMemo(()=> Array.from(savedIds || new Set()), [savedIds]);

  const runIdRef = useRef(0);
  const fetchProducts = async () => {
    setErrorMsg("");
    if(!user){ setItems([]); setLoading(false); return; }
    setLoading(true);
    try{
      if(!savedIdList.length){ setItems([]); return; }
      const snaps = await Promise.all(
        chunk10(savedIdList).map(ids=> getDocs(query(collection(db,"products"), where(documentId(),"in",ids))))
      );
      const results=[];
      snaps.forEach(s=> s.forEach(d=> results.push({id:d.id, ...d.data()})));
      results.sort((a,b)=>
        (tsToMs(b.updatedAt)||tsToMs(b.createdAt)||0) - (tsToMs(a.updatedAt)||tsToMs(a.createdAt)||0) ||
        String(b.id).localeCompare(String(a.id))
      );
      setItems(results);
      setQty(prev=>{
        const next={...prev};
        results.forEach(p=>{
          const restock = isRestockPending(p);
          if (restock) next[p.id] = 0;
          else if (next[p.id]==null) next[p.id] = (typeof p.price==="number"&&p.price>0)?1:0;
        });
        return next;
      });
    }catch(e){
      console.error(e);
      setErrorMsg(e?.message||"목록 로드 오류");
      setItems([]);
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{
    let canceled=false; const myRun=++runIdRef.current;
    (async()=>{
      if(!user){ setItems([]); setLoading(false); return; }
      await fetchProducts();
    })();
    return ()=>{ canceled=true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user, savedIdList.join("|")]);

  const rows = useMemo(()=> items.map(p=>{
    const price = typeof p.price==="number"? p.price:0;
    const restock = isRestockPending(p);
    const baseQty = qty[p.id] ?? 0;
    const q = restock ? 0 : Math.max(0, Number(baseQty) || 0);
    return { ...p, _price:price, _qty:q, _subtotal: price*q, _restockPending: restock };
  }),[items,qty]);

  const totalQty = useMemo(()=> rows.reduce((s,r)=>s+r._qty,0),[rows]);
  const totalPrice = useMemo(()=> rows.reduce((s,r)=>s+r._subtotal,0),[rows]);
  const discount = Math.max(0, Number(discountAmount)||0);
  const finalTotal = Math.max(0, totalPrice - discount);

  const setQtySafe=(id,v)=>{
    const p = items.find(x=>x.id===id);
    if (p && isRestockPending(p)) {
      setQty(prev=>({ ...prev, [id]: 0 }));
      return;
    }
    let n=Number(String(v).replace(/[^\d]/g,""));
    if(!Number.isFinite(n)||n<0) n=0;
    if(n>9999) n=9999;
    setQty(prev=>({...prev,[id]:n}));
  };

  const handleCreateOrder = async ()=>{
    if(!user){ setSnack({open:true,msg:"로그인이 필요합니다.",severity:"info"}); return; }
    const itemsForOrder = rows.filter(r=> r._qty>0);
    if(itemsForOrder.length===0){ setSnack({open:true,msg:"수량 1 이상인 상품이 없습니다.",severity:"warning"}); return; }
    const d=new Date(orderDate); if(Number.isNaN(d.getTime())){ setSnack({open:true,msg:"주문일이 올바르지 않습니다.",severity:"warning"}); return; }

    const payload = {
      userId: user.uid,
      orderName: orderName?.trim() || "",
      orderDate: d.toISOString().slice(0,10),
      createdAt: serverTimestamp(),
      totalQty,
      totalPrice,
      discountAmount: discount,
      finalTotal,
      items: itemsForOrder.map(r=>({
        productId:r.id, name:r.name||"",
        price:r._price, qty:r._qty, subtotal:r._subtotal,
        imageUrl:r.imageUrl||"", productCode:r.productCode||"",
        categoryL1:r.categoryL1||"", categoryL2:r.categoryL2||"",
        link:r.link||""
      })),
    };

    try{
      const ref = await addDoc(collection(db,"users",user.uid,"orders"), payload);
navigate(`/orders/${ref.id}`, { replace: true, state: { created: true } });
    }catch(e){
      console.error(e);
      setSnack({ open:true, msg: e?.message || "주문서 생성 실패", severity:"error" });
    }
  };

  /* ======= Guards ======= */
  if (!user) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Alert severity="info">로그인이 필요합니다.</Alert>
      </Container>
    );
  }
  if (loadingUser || loadingSaved || loading) {
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
        <Toolbar sx={{ gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>주문서 만들기</Typography>
          <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
            <Tooltip title="새로고침">
              <span>
                <IconButton onClick={fetchProducts} disabled={loading}>
                  <RefreshIcon />
                </IconButton>
              </span>
            </Tooltip>
            <Button
              variant="contained"
              startIcon={<ShoppingCartCheckoutIcon />}
              onClick={handleCreateOrder}
              disabled={totalQty === 0}
            >
              주문서 만들기
            </Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 3 }}>
        {errorMsg && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMsg}
          </Alert>
        )}

        {/* 상단 폼 */}
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField
                  label="주문서 이름"
                  value={orderName}
                  onChange={(e)=>setOrderName(e.target.value)}
                  fullWidth size="small"
                  placeholder="예: 10월 MD 발주"
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="주문일"
                  type="date"
                  value={orderDate}
                  onChange={(e)=>setOrderDate(e.target.value)}
                  fullWidth size="small"
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={3}>
                <TextField
                  label="할인금액"
                  value={discountAmount}
                  onChange={(e)=> setDiscountAmount(String(e.target.value).replace(/[^\d]/g,""))}
                  fullWidth size="small" inputMode="numeric"
                  InputProps={{ endAdornment: <InputAdornment position="end">원</InputAdornment> }}
                />
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* 합계바 + 옵션 */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" justifyContent="space-between">
            <FormControlLabel
              control={
                <Checkbox checked={showZero} onChange={(e)=>setShowZero(e.target.checked)} size="small" />
              }
              label="수량 0도 표시"
            />
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip label={`총 수량 ${totalQty}개`} variant="outlined" />
              <Divider orientation="vertical" flexItem />
              <Chip label={`상품합계 ${fmtKRW(totalPrice)} 원`} />
              <Chip variant="outlined" label={`할인 -${fmtKRW(discount)} 원`} />
              <Chip color="primary" label={`결제합계 ${fmtKRW(finalTotal)} 원`} />
            </Stack>
          </Stack>
        </Paper>

        {/* 테이블 */}
        {rows.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: "center" }}>
            <Typography color="text.secondary">저장한 상품이 없습니다.</Typography>
          </Paper>
        ) : (
          <Paper variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "grey.50" }}>
                  <TableCell>상품</TableCell>
                  <TableCell>코드</TableCell>
                  <TableCell align="right">가격</TableCell>
                  <TableCell align="center">수량</TableCell>
                  <TableCell align="right">소계</TableCell>
                  <TableCell align="center">원본</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows
                  .filter(r => isPositive(r._qty) || items.length <= 50 || r._restockPending)
                  .filter(r => showZero || r._qty > 0 || r._restockPending)
                  .map(r => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ minWidth: 320 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <Paper
                          variant="outlined"
                          sx={{
                            position: "relative",
                            width: 60, height: 60,
                            bgcolor: "grey.100", borderRadius: 1,
                            overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center"
                          }}
                        >
                          {r.imageUrl ? (
                            <img
                              src={r.imageUrl} alt={r.name}
                              style={{
                                width:"100%", height:"100%", objectFit:"cover",
                                filter: r._restockPending ? "grayscale(80%)" : "none"
                              }}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">No Image</Typography>
                          )}
                          {r._restockPending && (
                            <Stack
                              title="재입고 예정 상품은 주문에서 제외됩니다."
                              sx={{
                                position:"absolute", inset:0, bgcolor:"rgba(55,65,81,0.45)",
                                color:"#fff", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12
                              }}
                              direction="row"
                            >
                              재입고 예정
                            </Stack>
                          )}
                        </Paper>
                        <Stack spacing={0.25}>
                          <Typography fontWeight={700} color={r._restockPending ? "text.secondary" : "text.primary"} noWrap>
                            {r.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" noWrap>
                            {r.categoryL1 || "-"} {r.categoryL2 ? `> ${r.categoryL2}` : ""}
                          </Typography>
                          {r._restockPending && (
                            <Typography variant="caption" color="text.secondary">
                              재입고 예정 상품은 수량 입력이 비활성화됩니다.
                            </Typography>
                          )}
                        </Stack>
                      </Stack>
                    </TableCell>

                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {r.productCode || r.id}
                      </Typography>
                    </TableCell>

                    <TableCell align="right">{fmtKRW(r._price)} 원</TableCell>

                    <TableCell align="center" sx={{ minWidth: 160 }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ opacity: r._restockPending ? 0.5 : 1 }}>
                        <IconButton size="small" disabled={r._restockPending} onClick={()=> setQtySafe(r.id, (qty[r.id]||0) - 1)}>
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                        <TextField
                          value={qty[r.id] ?? 0}
                          onChange={(e)=> setQtySafe(r.id, e.target.value)}
                          size="small"
                          inputMode="numeric"
                          sx={{ width: 80 }}
                          disabled={r._restockPending}
                        />
                        <IconButton size="small" disabled={r._restockPending} onClick={()=> setQtySafe(r.id, (qty[r.id]||0) + 1)}>
                          <AddIcon fontSize="small" />
                        </IconButton>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={()=> setQtySafe(r.id, 0)}
                          disabled={r._restockPending}
                          sx={{ ml: 0.5 }}
                        >
                          삭제
                        </Button>
                      </Stack>
                    </TableCell>

                    <TableCell align="right">
                      <Typography fontWeight={700}>{fmtKRW(r._subtotal)}</Typography> 원
                    </TableCell>

                    <TableCell align="center">
                      {r.link ? (
                        <Tooltip title="원본 열기">
                          <IconButton
                            size="small"
                            component="a"
                            href={r.link}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Container>

      {/* 스낵바 */}
      <Snackbar open={snack.open} autoHideDuration={2500} onClose={()=> setSnack(s=>({ ...s, open:false }))}>
        <Alert severity={snack.severity} onClose={()=> setSnack(s=>({ ...s, open:false }))} sx={{ width:"100%" }}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </>
  );
}
