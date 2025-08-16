// src/App.jsx

import React, { useState, useEffect } from 'react';
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

// ★★★ 1. 우리가 만든 모든 부품(컴포넌트)을 가져옵니다.
import Auth from './components/Auth';
import DdayApp from './components/DdayApp';
import Footer from './components/Footer';
import Loading from './components/Loading';
import StartScreen from './components/StartScreen';

function App() {
  // ★★★ 2. 앱의 전체 상태를 관리하는 State들을 만듭니다.
  const [user, setUser] = useState(null); // 로그인한 사용자 정보
  const [appState, setAppState] = useState('loading'); // 'loading', 'start', 'auth', 'app'

  useEffect(() => {
    // Firebase의 로그인 상태 감시
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAppState('app'); // 로그인되면 앱 화면으로
      } else {
        // ★★★ "user" state가 null이고, mode가 local이 아닐 때만 로그아웃으로 간주
        if (user && user.mode !== 'local') {
          setUser(null);
          setAppState('start');
        } else if (!user) { // 앱 최초 로딩 시
           setAppState('start');
        }
      }
    });

    return () => unsubscribe();
  }, [user]); // user상태가 바뀔 때도 이 효과를 재평가

    // --- 인증 관련 함수들 (기존과 동일, alert 대신 에러 처리 보강 가능) ---
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
    // ★★★ 로컬 사용자인지 Firebase 사용자인지 구분하여 로그아웃 처리
    if (user && user.mode === 'local') {
      setUser(null); // 로컬 사용자는 상태만 null로 변경
    } else {
      await signOut(auth); // Firebase 사용자는 실제 로그아웃
    }
    setAppState('start');
  };

  // ★★★ 3. StartScreen에서 어떤 버튼을 눌렀는지 처리하는 함수
    const handleNavigation = (destination) => {
      if (destination === 'login') {
        setAppState('auth');
      } else if (destination === 'local') {
        // ★★★ '바로 시작하기'를 위한 가짜 사용자 객체 생성
        setUser({
          mode: 'local',
          uid: 'localUser', // 로컬 스토리지를 위한 고유 ID
          email: '로컬 사용자님'
        });
        setAppState('app'); // 앱 화면으로 전환
      }
    };

  // ★★★ Auth 화면에서 시작 화면으로 돌아가는 함수
    const handleBackToStart = () => {
      setAppState('start');
    };


  // ★★★ 4. 현재 앱 상태(appState)에 따라 보여줄 화면을 결정하는 함수
    const renderContent = () => {
      switch (appState) {
        case 'loading':
          return <Loading />;
        case 'start':
          return <StartScreen onNavigate={handleNavigation} />;
        case 'auth':
          return (
            <>
              <Auth 
                onBackToStart={handleBackToStart}
                handleLogin={handleLogin}
                handleGoogleLogin={handleGoogleLogin}
                handleSignup={handleSignup}
                handleResetPassword={handleResetPassword}
              />
              <Footer />
            </>
          );
        case 'app':
          // user가 확실히 있을 때만 DdayApp을 렌더링
          return user ? <DdayApp user={user} handleLogout={handleLogout} /> : <Loading />;
        default:
          return <StartScreen onNavigate={handleNavigation} />;
      }
    };

    return (
      <div className="container">
        {renderContent()}
      </div>
    );
  }

export default App;