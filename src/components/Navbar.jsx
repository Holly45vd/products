// src/components/Navbar.jsx
import React, { useState } from "react";
import AuthModal from "./AuthModal";

export default function Navbar({ user, onSignIn, onSignUp, onSignOut, onlySaved, onToggleOnlySaved }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ fontWeight:700 }}>상품관리</div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ display:"flex", alignItems:"center", gap:6, fontSize:12 }}>
            <input type="checkbox" checked={onlySaved} onChange={e=>onToggleOnlySaved(e.target.checked)} />
            저장만 보기
          </label>
          {user ? (
            <>
              <span style={{ fontSize:12, color:"#374151" }}>{user.email}</span>
              <button onClick={onSignOut} style={{ borderRadius:8, padding:"6px 10px", border:"1px solid #e5e7eb", background:"#fff" }}>로그아웃</button>
            </>
          ) : (
            <button onClick={()=>setOpen(true)} style={{ borderRadius:8, padding:"6px 10px", border:"1px solid #e5e7eb", background:"#111827", color:"#fff" }}>로그인</button>
          )}
        </div>
      </nav>
      <AuthModal open={open} onClose={()=>setOpen(false)} onSignIn={onSignIn} onSignUp={onSignUp} />
    </>
  );
}
