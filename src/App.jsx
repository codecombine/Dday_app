// =======================================================
// 파일 경로: src/App.jsx
// 역할: 최상위 컴포넌트. 실제 Firebase 인증 로직을 처리합니다.
// =======================================================

import React, { useState, useEffect } from 'react';
// ★★★ 우리가 만든 firebase.js 파일에서 auth 객체를 가져옵니다.
import { auth } from './firebase'; 
import { 
  onAuthStateChanged, 
  signOut, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithPopup, 
  sendEmailVerification, 
  sendPasswordResetEmail 
} from "firebase/auth";

import Auth from './components/Auth';
import DdayApp from './components/DdayApp';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // ★★★ 로딩 상태 추가

  // ★★★ useEffect를 사용하여 앱이 처음 시작될 때 딱 한 번만 실행됩니다.
  useEffect(() => {
    // onAuthStateChanged는 로그인, 로그아웃 등 사용자 상태가 바뀔 때마다 호출됩니다.
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser); // user state를 현재 로그인한 사용자 정보로 업데이트
      setLoading(false); // 로딩 완료
    });

    // 컴포넌트가 사라질 때 감시 기능을 정리합니다. (메모리 누수 방지)
    return () => unsubscribe();
  }, []); // []가 비어있으면 처음 한 번만 실행하라는 의미입니다.

  // ★★★ 실제 Firebase 인증 함수들
  const handleLogin = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      alert("로그인 실패: " + error.message);
    }
  };

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      alert("구글 로그인 실패: " + error.message);
    }
  };

  const handleSignup = async (email, password) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(userCredential.user);
      alert("회원가입 성공! 인증 메일을 확인해주세요.");
      await signOut(auth);
    } catch (error) {
      alert("회원가입 실패: " + error.message);
    }
  };

  const handleResetPassword = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert("비밀번호 재설정 링크를 보냈습니다.");
    } catch (error) {
      alert("재설정 링크 발송 실패: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // ★★★ 로딩 중일 때는 아무것도 보여주지 않음 (또는 로딩 스피너를 보여줄 수 있음)
  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container">
      <h1 className="main-title">D-Day App</h1>

      {user ? (
        <DdayApp user={user} handleLogout={handleLogout} />
      ) : (
        <Auth 
          handleLogin={handleLogin}
          handleGoogleLogin={handleGoogleLogin}
          handleSignup={handleSignup}
          handleResetPassword={handleResetPassword}
        />
      )}

      <footer>
        <p>
          <a href="/privacy_v1.0.0.html" target="_blank" className="footer-link">개인정보 처리방침</a> | 
          <a href="/Terms_v1.0.0.html" target="_blank" className="footer-link">서비스 이용약관</a>
        </p>
        <p>Contact: <a href="mailto:1538iron@gmail.com">1538iron@gmail.com</a></p>
        <p>Copyright &copy; 2025 IronCPA. All Rights Reserved.</p>
      </footer>
    </div>
  );
}

export default App;