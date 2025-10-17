import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import CatalogPage from "./pages/CatalogPage";
import SavedPage from "./pages/SavedPage";
import ImportPage from "./pages/ImportPage";
import EditTagsPage from "./pages/EditTagsPage.jsx";
import CsvImportPage from "./pages/CsvImportPage";
import useSavedProducts from "./hooks/useSavedProducts";
import ProtectedRoute from "./components/ProtectedRoute";
import { isAdmin } from "./utils/authz";
import SavedCheckoutPage from "./pages/SavedCheckoutPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import OrderDetailPage from "./pages/OrderDetailPage.jsx";

function Navbar({ user }) {
  return (
    <nav style={{ width:"100%", borderBottom:"1px solid #e5e7eb", marginBottom:16, background:"white" }}>
      <div style={{ maxWidth:960, margin:"0 auto", padding:"12px 16px", display:"flex", gap:12 }}>
        <Link to="/">카탈로그</Link>
        <Link to="/saved">찜</Link>
        <Link to="/checkout">주문서작성</Link>
        <Link to="/orders">주문서목록</Link>
        {/* 관리자만 Admin 메뉴 보이기 */}
        {isAdmin(user) && <Link to="/edit">Admin</Link>}
      </div>
    </nav>
  );
}

export default function App() {
  const { user } = useSavedProducts(); // user, signIn/out 등 필요시 더 전달

  return (
<BrowserRouter basename="/products">
      <Navbar user={user} />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/saved" element={<SavedPage />} />
       <Route path="/checkout" element={<SavedCheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route path="/import" element={
          <ProtectedRoute user={user} allow={isAdmin}>
            <ImportPage />
          </ProtectedRoute>
        } />
        <Route path="/edit" element={
          <ProtectedRoute user={user} allow={isAdmin}>
            <EditTagsPage />
          </ProtectedRoute>
        } />
        <Route path="/import-csv" element={
          <ProtectedRoute user={user} allow={isAdmin}>
            <CsvImportPage />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}
