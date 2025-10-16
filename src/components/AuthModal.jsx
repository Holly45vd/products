// src/components/AuthModal.jsx
import React, { useState } from "react";

export default function AuthModal({ open, onClose, onSignIn, onSignUp }) {
  const [mode, setMode] = useState("signin"); // 'signin' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    try {
      if (mode === "signin") await onSignIn(email, password);
      else await onSignUp(email, password);
      onClose();
    } catch (e) {
      alert(e.message || e.code);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
      <div style={{ width:360, background:"#fff", borderRadius:12, padding:16, boxShadow:"0 10px 30px rgba(0,0,0,.15)" }}>
        <h3 style={{ margin:"0 0 8px" }}>{mode === "signin" ? "로그인" : "회원가입"}</h3>
        <form onSubmit={submit} style={{ display:"grid", gap:8 }}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="이메일" required
            style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 10px" }}/>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호" required
            style={{ border:"1px solid #e5e7eb", borderRadius:8, padding:"8px 10px" }}/>
          <button type="submit" style={{ borderRadius:8, padding:"8px 12px", border:"1px solid #e5e7eb", background:"#111827", color:"#fff" }}>
            {mode === "signin" ? "로그인" : "가입"}
          </button>
        </form>
        <div style={{ marginTop:8, fontSize:12 }}>
          {mode === "signin" ? (
            <button onClick={()=>setMode("signup")} style={{ background:"none", border:"none", color:"#2563eb", cursor:"pointer" }}>
              계정이 없나요? 회원가입
            </button>
          ) : (
            <button onClick={()=>setMode("signin")} style={{ background:"none", border:"none", color:"#2563eb", cursor:"pointer" }}>
              이미 계정이 있나요? 로그인
            </button>
          )}
        </div>
        <div style={{ marginTop:8 }}>
          <button onClick={onClose} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer" }}>닫기</button>
        </div>
      </div>
    </div>
  );
}
