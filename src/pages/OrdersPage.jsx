// src/pages/OrdersPage.jsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import useSavedProducts from "../hooks/useSavedProducts";

const fmtKRW = (n = 0) => Number(n || 0).toLocaleString("ko-KR");

export default function OrdersPage() {
  const { user, loadingUser } = useSavedProducts();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const handleDeleteOrder = async (orderId) => {
    if (!user) return;
    if (!window.confirm("이 주문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "orders", orderId));
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } catch (e) {
      console.error(e);
      alert(e?.message || "삭제 실패");
    }
  };

  useEffect(() => {
    if (!user) {
      setOrders([]);
      setLoading(false);
      return;
    }
    (async () => {
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
    })();
  }, [user]);

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

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>주문서 목록</h2>

      {err && (
        <div
          style={{
            marginBottom: 12,
            padding: "8px 10px",
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#991b1b",
            borderRadius: 8,
          }}
        >
          {err}
        </div>
      )}

      {orders.length === 0 ? (
        <div>주문서가 없습니다.</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {orders.map((o) => (
            <div key={o.id} style={{ display: "grid", gap: 6 }}>
              {/* 카드(전체 클릭) */}
              <div
                onClick={() => navigate(`/orders/${o.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate(`/orders/${o.id}`);
                }}
                style={{
                  textAlign: "left",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <strong>
                    {o.orderName || `#${o.id.slice(0, 8)}`} · {o.orderDate || "-"}
                  </strong>
                  <div style={{ color: "#374151" }}>
                    수량: <strong>{o.totalQty}</strong>개 · 합계:{" "}
                    <strong>{fmtKRW(o.finalTotal ?? o.totalPrice)}</strong> 원
                  </div>
                </div>
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(o.items || []).slice(0, 6).map((it) => (
                    <span
                      key={it.productId}
                      style={{
                        fontSize: 12,
                        background: "#f3f4f6",
                        border: "1px solid #e5e7eb",
                        padding: "2px 8px",
                        borderRadius: 9999,
                      }}
                    >
                      {it.name} × {it.qty}
                    </span>
                  ))}
                  {(o.items || []).length > 6 && (
                    <span style={{ fontSize: 12, color: "#6b7280" }}>
                      …외 {o.items.length - 6}개
                    </span>
                  )}
                </div>
              </div>

              {/* 삭제 버튼 (카드 아래) */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteOrder(o.id);
                  }}
                  style={{
                    border: "1px solid #fecaca",
                    background: "#fff",
                    color: "#b91c1c",
                    padding: "6px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  주문서 삭제
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
