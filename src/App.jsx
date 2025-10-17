// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import CatalogPage from "./pages/CatalogPage";
import SavedPage from "./pages/SavedPage";
import ImportPage from "./pages/ImportPage";
import EditTagsPage from "./pages/EditTagsPage.jsx";
import CsvImportPage from "./pages/CsvImportPage";
import useSavedProducts from "./hooks/useSavedProducts";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";     // ✅ 새로 추가
import SavedCheckoutPage from "./pages/SavedCheckoutPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import OrderDetailPage from "./pages/OrderDetailPage.jsx";
import { isAdmin } from "./utils/authz";

export default function App() {
  const { user } = useSavedProducts();

  return (
    <BrowserRouter basename="/products">
      <Navbar user={user} />  {/* ✅ 분리된 Navbar */}
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/checkout" element={<SavedCheckoutPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<OrderDetailPage />} />
        <Route path="/orders/:orderId" element={<OrderDetailPage />} />
        <Route
          path="/import"
          element={
            <ProtectedRoute user={user} allow={isAdmin}>
              <ImportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/edit"
          element={
            <ProtectedRoute user={user} allow={isAdmin}>
              <EditTagsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/import-csv"
          element={
            <ProtectedRoute user={user} allow={isAdmin}>
              <CsvImportPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
