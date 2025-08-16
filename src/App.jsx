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
        setUser(null);
        // 로그아웃 상태일 때는 시작 화면을 보여주도록 appState를 'start'로 설정
        // 단, 로딩 후 최초 진입 시점에만 'start'로 설정
        if(appState !== 'auth') {
          setAppState('start');
        }
      }
    });

    return () => unsubscribe();
  }, [appState]); // appState가 바뀔 때도 이 효과를 재평가

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
      await signOut(auth);
      setAppState('start'); // 로그아웃하면 시작 화면으로
    };

  // ★★★ 3. StartScreen에서 어떤 버튼을 눌렀는지 처리하는 함수
    const handleNavigation = (destination) => {
      if (destination === 'login') {
        setAppState('auth'); // '로그인하여 시작하기' -> 인증 화면으로
      } else if (destination === 'local') {
        // '바로 시작하기' -> 이 부분은 추후 로컬 스토리지 버전으로 확장 가능
        // 지금은 일단 로그인 화면으로 안내합니다.
        alert("현재 '바로 시작하기'는 준비 중입니다. 로그인하여 이용해주세요.");
        setAppState('auth');
      }
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