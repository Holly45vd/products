// src/pages/OrderDetailPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

const fmtKRW = (n = 0) => Number(n || 0).toLocaleString("ko-KR");

export default function OrderDetailPage() {
  const { user, loadingUser } = useSavedProducts();
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [order, setOrder] = useState(null);

  // 편집 상태
  const [orderName, setOrderName] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [items, setItems] = useState([]); // [{productId, name, price, qty, subtotal, ...}]

  useEffect(() => {
    if (!user) {
      setLoading(false);
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
            subtotal: Number(it.subtotal || Number(it.price || 0) * Number(it.qty || 0)),
          }))
        );
      } catch (e) {
        console.error(e);
        setErr(e?.message || "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, orderId]);

  const totals = useMemo(() => {
    const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0);
    const totalPrice = items.reduce((s, it) => s + (Number(it.price || 0) * Number(it.qty || 0)), 0);
    const discount = Math.max(0, Number(discountAmount) || 0);
    const finalTotal = Math.max(0, totalPrice - discount);
    return { totalQty, totalPrice, discount, finalTotal };
  }, [items, discountAmount]);

  const setQty = (idx, v) => {
    setItems((prev) => {
      const cp = [...prev];
      let n = Number(v);
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
    // 아이템 0개면 저장 방지(권장)
    if (items.length === 0) {
      alert("최소 1개 이상의 아이템이 필요합니다.");
      return;
    }
    if (!orderDate || Number.isNaN(new Date(orderDate).getTime())) {
      alert("주문일이 올바르지 않습니다.");
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
      // updatedAt을 기록하고 싶다면 rules/설계에 맞춰 serverTimestamp()를 서버에서 처리하는 컬렉션으로 이동하거나,
      // 여기서 setDoc merge로 추가할 수 있음.
    };

    try {
      await updateDoc(doc(db, "users", user.uid, "orders", order.id), payload);
      alert("저장 완료");
      navigate("/orders", { replace: true });
    } catch (e) {
      console.error(e);
      alert(e?.message || "저장 실패");
    }
  };

  const handleDeleteOrder = async () => {
    if (!user || !order) return;
    if (!window.confirm("이 주문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "orders", order.id));
      alert("삭제 완료");
      navigate("/orders", { replace: true });
    } catch (e) {
      console.error(e);
      alert(e?.message || "삭제 실패");
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
        <h2>로그인 필요</h2>
      </div>
    );
  }
  if (loadingUser || loading) {
    return (
      <div style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
        불러오는 중…
      </div>
    );
  }
  if (err) {
    return (
      <div style={{ maxWidth: 960, margin: "40px auto", padding: 16, color: "#991b1b" }}>
        {err}
      </div>
    );
  }
  if (!order) return null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>주문서 수정</h2>

      {/* 상단 액션: 이름/날짜/할인 + 저장/삭제 */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.4fr 1fr 1fr auto auto",
          gap: 12,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <input
          value={orderName}
          onChange={(e) => setOrderName(e.target.value)}
          placeholder="주문서 이름"
          style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 10px" }}
        />
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>주문일</span>
          <input
            type="date"
            value={orderDate}
            onChange={(e) => setOrderDate(e.target.value)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px" }}
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span>할인금액</span>
          <input
            inputMode="numeric"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(e.target.value.replace(/[^\d]/g, ""))}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "6px 8px",
              width: 140,
              textAlign: "right",
            }}
            placeholder="0"
          />
        </label>
        <button
          onClick={handleSave}
          disabled={items.length === 0}
          style={{
            borderRadius: 8,
            padding: "8px 12px",
            border: "1px solid #e5e7eb",
            background: items.length ? "#111827" : "#9ca3af",
            color: "#fff",
            cursor: items.length ? "pointer" : "not-allowed",
          }}
        >
          저장
        </button>
        <button
          onClick={handleDeleteOrder}
          style={{
            border: "1px solid #fecaca",
            background: "#fff",
            color: "#b91c1c",
            borderRadius: 8,
            padding: "8px 12px",
          }}
        >
          주문서 삭제
        </button>
      </div>

      {/* 합계 */}
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          justifyContent: "flex-end",
          marginBottom: 8,
          color: "#374151",
        }}
      >
        <div>
          총 수량 <strong>{totals.totalQty}</strong>개
        </div>
        <div>
          상품합계 <strong>{fmtKRW(totals.totalPrice)}</strong> 원
        </div>
        <div>
          할인 <strong>-{fmtKRW(totals.discount)}</strong> 원
        </div>
        <div>
          결제합계 <strong>{fmtKRW(totals.finalTotal)}</strong> 원
        </div>
      </div>

      {/* 테이블 */}
      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#f9fafb" }}>
              <th style={th}>상품</th>
              <th style={th}>코드</th>
              <th style={thRight}>가격</th>
              <th style={thCenter}>수량</th>
              <th style={thRight}>소계</th>
              <th style={thCenter}>원본/삭제</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.productId} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10, minWidth: 280 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div
                      style={{
                        width: 60,
                        height: 60,
                        background: "#f3f4f6",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      {it.imageUrl && (
                        <img
                          src={it.imageUrl}
                          alt={it.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{it.name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>
                        {it.categoryL1 || "-"} {it.categoryL2 ? `> ${it.categoryL2}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: 10, fontSize: 12, color: "#6b7280" }}>
                  {it.productCode || it.productId}
                </td>
                <td style={tdRight}>{fmtKRW(it.price)} 원</td>
                <td style={{ padding: 10, textAlign: "center" }}>
                  <input
                    value={it.qty}
                    onChange={(e) => setQty(idx, e.target.value)}
                    inputMode="numeric"
                    style={{
                      width: 64,
                      textAlign: "center",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      padding: "6px 8px",
                    }}
                  />
                </td>
                <td style={tdRight}>
                  <strong>{fmtKRW(Number(it.price || 0) * Number(it.qty || 0))}</strong> 원
                </td>
                <td style={{ padding: 10, textAlign: "center", whiteSpace: "nowrap" }}>
                  {it.link ? (
                    <a
                      href={it.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      열기
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>-</span>
                  )}
                  <button
                    onClick={() => handleRemoveRow(idx)}
                    style={{
                      marginLeft: 8,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      borderRadius: 8,
                      padding: "6px 10px",
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                    title="이 상품을 주문서에서 제거"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#6b7280" }}>
                  아이템이 없습니다. (상단에서 저장할 수 없습니다)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
  whiteSpace: "nowrap",
};
const thRight = { ...th, textAlign: "right" };
const thCenter = { ...th, textAlign: "center" };
const tdRight = { padding: 10, textAlign: "right" };
