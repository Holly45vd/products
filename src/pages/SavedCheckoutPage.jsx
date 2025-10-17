// src/pages/SavedCheckoutPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, documentId, getDocs, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

function tsToMs(ts){ if(!ts) return 0; if(typeof ts?.toMillis==="function") return ts.toMillis(); const v=Number(ts); return Number.isFinite(v)?v:0; }
function chunk10(a){ const out=[]; for(let i=0;i<a.length;i+=10) out.push(a.slice(i,i+10)); return out; }
const fmtKRW = (n=0)=> n.toLocaleString("ko-KR");
const isPositive = (n)=> Number(n||0) > 0;

export default function SavedCheckoutPage(){
  const { user, savedIds, loadingUser, loadingSaved } = useSavedProducts();
  const navigate = useNavigate();

  const [items,setItems] = useState([]);
  const [qty,setQty] = useState({});
  const [loading,setLoading] = useState(true);
  const [errorMsg,setErrorMsg] = useState("");

  // 추가: 주문서 이름/할인/주문일
  const [orderName,setOrderName] = useState("");
  const [orderDate,setOrderDate] = useState(()=> new Date().toISOString().slice(0,10));
  const [discountAmount,setDiscountAmount] = useState(0); // 고정 할인 금액(원)

  const savedIdList = useMemo(()=> Array.from(savedIds || new Set()), [savedIds]);

  const runIdRef = useRef(0);
  useEffect(()=>{
    let canceled=false; const myRun=++runIdRef.current;
    (async()=>{
      setErrorMsg("");
      if(!user){ setItems([]); setLoading(false); return; }
      setLoading(true);
      try{
        if(!savedIdList.length){ setItems([]); return; }
        const snaps = await Promise.all(
          chunk10(savedIdList).map(ids=> getDocs(query(collection(db,"products"), where(documentId(),"in",ids))))
        );
        const results=[]; snaps.forEach(s=> s.forEach(d=> results.push({id:d.id, ...d.data()})));
        results.sort((a,b)=> (tsToMs(b.updatedAt)||tsToMs(b.createdAt)||0) - (tsToMs(a.updatedAt)||tsToMs(a.createdAt)||0) || String(b.id).localeCompare(String(a.id)));
        if(!canceled && myRun===runIdRef.current){
          setItems(results);
          setQty(prev=>{
            const next={...prev};
            results.forEach(p=>{ if(next[p.id]==null) next[p.id] = (typeof p.price==="number"&&p.price>0)?1:0; });
            return next;
          });
        }
      }catch(e){
        if(!canceled && myRun===runIdRef.current){ console.error(e); setErrorMsg(e?.message||"목록 로드 오류"); setItems([]); }
      }finally{ if(!canceled && myRun===runIdRef.current) setLoading(false); }
    })();
    return ()=>{ canceled=true; };
  },[user,savedIdList]);

  const rows = useMemo(()=> items.map(p=>{
    const price = typeof p.price==="number"? p.price:0;
    const q = Math.max(0, Number(qty[p.id]??0) || 0);
    return { ...p, _price:price, _qty:q, _subtotal: price*q };
  }),[items,qty]);

  const totalQty = useMemo(()=> rows.reduce((s,r)=>s+r._qty,0),[rows]);
  const totalPrice = useMemo(()=> rows.reduce((s,r)=>s+r._subtotal,0),[rows]);
  const discount = Math.max(0, Number(discountAmount)||0);
  const finalTotal = Math.max(0, totalPrice - discount);
const [showZero, setShowZero] = useState(false);
  const setQtySafe=(id,v)=>{ let n=Number(v); if(!Number.isFinite(n)||n<0) n=0; if(n>9999) n=9999; setQty(prev=>({...prev,[id]:n})); };

  const handleCreateOrder = async ()=>{
    if(!user){ alert("로그인 필요"); return; }
    const itemsForOrder = rows.filter(r=> r._qty>0);
    if(itemsForOrder.length===0){ alert("수량 1 이상인 상품이 없습니다."); return; }
    const d=new Date(orderDate); if(Number.isNaN(d.getTime())){ alert("주문일이 올바르지 않습니다."); return; }

    const payload = {
      userId: user.uid,
      orderName: orderName?.trim() || "",        // 주문서 이름
      orderDate: d.toISOString().slice(0,10),
      createdAt: serverTimestamp(),
      totalQty,
      totalPrice,
      discountAmount: discount,
      finalTotal,
      items: itemsForOrder.map(r=>({
        productId:r.id, name:r.name||"", price:r._price, qty:r._qty, subtotal:r._subtotal,
        imageUrl:r.imageUrl||"", productCode:r.productCode||"", categoryL1:r.categoryL1||"", categoryL2:r.categoryL2||"", link:r.link||""
      })),
    };

    try{
      const ref = await addDoc(collection(db,"users",user.uid,"orders"), payload);
      navigate(`/orders/${ref.id}`, { replace:true, state:{ created:true } });
    }catch(e){ console.error(e); alert(e?.message||"주문서 생성 실패"); }
  };

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:16 }}>
      <h2 style={{ marginTop:0 }}>주문서 만들기</h2>

      {!user ? (
        <div style={{ marginTop:24 }}>
          <h3>로그인이 필요합니다</h3>
          <p>상단에서 로그인/회원가입을 진행하세요.</p>
        </div>
      ) : (loadingUser || loadingSaved || loading) ? (
        <div>불러오는 중…</div>
      ) : (
        <>
          {errorMsg && <div style={{ marginBottom:12, padding:"8px 10px", border:"1px solid #fecaca", background:"#fef2f2", color:"#991b1b", borderRadius:8 }}>{errorMsg}</div>}

          {/* 상단 입력: 이름/날짜/할인/요약 */}
          <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr 1fr auto", gap:12, alignItems:"center", marginBottom:12 }}>
            <input
              value={orderName}
              onChange={e=>setOrderName(e.target.value)}
              placeholder="주문서 이름 (예: 10월 MD 발주)"
              style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 10px" }}
            />
            <label style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span>주문일</span>
              <input type="date" value={orderDate} onChange={e=>setOrderDate(e.target.value)}
                     style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 8px" }}/>
            </label>
            <label style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span>할인금액</span>
              <input
                inputMode="numeric"
                value={discountAmount}
                onChange={e=> setDiscountAmount(e.target.value.replace(/[^\d]/g,""))}
                style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 8px", width:140, textAlign:"right" }}
                placeholder="0"
              />
            </label>
            <button
              onClick={handleCreateOrder}
              disabled={totalQty===0}
              style={{ borderRadius:8, padding:"8px 12px", border:"1px solid #e5e7eb", background: totalQty? "#111827":"#9ca3af", color:"#fff" }}
            >
              주문서 만들기
            </button>
          </div>

          {/* 합계 박스 */}
          <div style={{ display:"flex", gap:16, alignItems:"center", justifyContent:"flex-end", marginBottom:8, color:"#374151" }}>
            <div>총 수량 <strong>{totalQty}</strong>개</div>
            <div>상품합계 <strong>{fmtKRW(totalPrice)}</strong> 원</div>
            <div>할인 <strong>-{fmtKRW(discount)}</strong> 원</div>
            <div>결제합계 <strong>{fmtKRW(finalTotal)}</strong> 원</div>
          </div>

          {/* 테이블(수량 입력) */}
          {rows.length===0 ? (
            <div>저장한 상품이 없습니다.</div>
          ) : (
            <div style={{ overflowX:"auto", border:"1px solid #e5e7eb", borderRadius:10 }}>
              <table style={{ borderCollapse:"collapse", width:"100%" }}>
                <thead>
                  <tr style={{ background:"#f9fafb" }}>
                    <th style={th}>상품</th><th style={th}>코드</th>
                    <th style={thRight}>가격</th><th style={thCenter}>수량</th>
                    <th style={thRight}>소계</th><th style={thCenter}>원본</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
   .filter(r => isPositive(r._qty) || items.length <= 50) // 수량 0이면 기본 숨김. (초기 진입 시 50개 이하면 모두 보이기)
   .filter(r => showZero || r._qty > 0)
   .map(r => (
                    <tr key={r.id} style={{ borderTop:"1px solid #f3f4f6" }}>
                      <td style={{ padding:10, display:"flex", gap:10, alignItems:"center", minWidth:280 }}>
                        <div style={{ width:60, height:60, background:"#f3f4f6", borderRadius:8, overflow:"hidden" }}>
                          {r.imageUrl && <img src={r.imageUrl} alt={r.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>}
                        </div>
                        <div><div style={{ fontWeight:600 }}>{r.name}</div><div style={{ fontSize:12, color:"#6b7280" }}>{r.categoryL1 || "-"} {r.categoryL2? `> ${r.categoryL2}`:""}</div></div>
                      </td>
                      <td style={{ padding:10, fontSize:12, color:"#6b7280" }}>{r.productCode || r.id}</td>
                      <td style={tdRight}>{fmtKRW(r._price)} 원</td>
                      <td style={{ padding:10, textAlign:"center" }}>
                        <div style={{ display:"inline-flex", alignItems:"center", border:"1px solid #e5e7eb", borderRadius:8 }}>
                          <button onClick={()=>setQtySafe(r.id,(qty[r.id]||0)-1)} style={btnSpin}>−</button>
                          <input value={qty[r.id]??0} onChange={e=>setQtySafe(r.id,e.target.value)} inputMode="numeric" style={{ width:56, textAlign:"center", border:"none", outline:"none" }}/>
                          <button onClick={()=>setQtySafe(r.id,(qty[r.id]||0)+1)} style={btnSpin}>＋</button>
                        </div>
                        <button
        onClick={()=> setQtySafe(r.id, 0)}
        style={{ marginLeft:8, border:"1px solid #e5e7eb", borderRadius:8, padding:"6px 10px", background:"#fff", cursor:"pointer", fontSize:12 }}
        title="이 상품을 주문서에서 제외"
     >
       삭제
     </button>
                      </td>
                      <td style={tdRight}><strong>{fmtKRW(r._subtotal)}</strong> 원</td>
                      <td style={{ padding:10, textAlign:"center" }}>{r.link? <a href={r.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:12 }}>열기</a> : <span style={{ fontSize:12, color:"#9ca3af" }}>-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
const th={ textAlign:"left", padding:10, borderBottom:"1px solid #e5e7eb", whiteSpace:"nowrap" };
const thRight={ ...th, textAlign:"right" };
const thCenter={ ...th, textAlign:"center" };
const tdRight={ padding:10, textAlign:"right" };
const btnSpin={ width:32, height:32, border:"none", background:"#fff", cursor:"pointer" };
