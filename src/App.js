import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import CatalogPage from "./pages/CatalogPage";
import SavedPage from "./pages/SavedPage";
import "./styles/globals.css";
import ImportPage from "./pages/ImportPage";
import EditTagsPage from "./pages/EditTagsPage.jsx";
import CsvImportPage from "./pages/CsvImportPage.jsx";
function Navbar() {
  return (
    <nav
      style={{
        width: "100%",
        borderBottom: "1px solid #e5e7eb",
        marginBottom: 16,
        background: "white",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          gap: 12,
        }}
      >
        <Link to="/">카탈로그</Link>
        <Link to="/saved">Save</Link>
        <Link to="/edit">Admin</Link>       
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/edit" element={<EditTagsPage />} />
        <Route path="/import-csv" element={<CsvImportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
