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
import AlertModal from './components/AlertModal';

function App() {
  // ★★★ 2. 앱의 전체 상태를 관리하는 State들을 만듭니다.
  const [user, setUser] = useState(null); // 로그인한 사용자 정보
  const [appState, setAppState] = useState('loading'); // 'loading', 'start', 'auth', 'app'
  const [alertInfo, setAlertInfo] = useState({ isVisible: false, title: '', message: '' }); // ★★★ 2. AlertModal의 상태를 관리할 State 추가
  // ★★★ 2. AlertModal을 제어하는 함수들
  const showAlert = (title, message) => {
    setAlertInfo({ isVisible: true, title, message });
  };
  const hideAlert = () => {
    setAlertInfo({ isVisible: false, title: '', message: '' });
  };

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
          const userCredential = await signInWithEmailAndPassword(auth, email, password);
          if (!userCredential.user.emailVerified) {
            await signOut(auth);
            showAlert("인증 필요", "이메일 인증이 완료되지 않았습니다. 메일함을 확인해주세요.");
          }
        } catch (error) {
              // 개발자를 위해 콘솔에 상세 에러를 기록합니다.
              console.error("Login Error:", error.code, error.message);

              // 상황에 따라 사용자에게 다른 메시지를 보여줍니다.
              if (error.code === 'auth/network-request-failed') {
                showAlert("로그인 실패", "인터넷 연결을 확인해주세요.");
              } else {
                showAlert("로그인 실패", "이메일 또는 비밀번호를 확인해주세요.");
              }
            }
    };

    const handleGoogleLogin = async () => {
      const provider = new GoogleAuthProvider();
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        console.error("Google Login Error:", error.code, error.message);

        //v3. 사용자가 팝업을 닫은 경우는 오류가 아니므로 무시합니다.
        if (error.code !== 'auth/popup-closed-by-user') {
          showAlert("구글 로그인 실패", "팝업이 차단되었거나 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
        //v2. showAlert("구글 로그인 실패", "팝업이 차단되었거나 오류가 발생했습니다.");
        //v1. alert("구글 로그인 실패: " + error.message);
      }
    };

    const handleSignup = async (email, password) => {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        showAlert("회원가입 성공", "인증 메일을 보냈습니다. 확인 후 로그인해주세요.");
        //alert("회원가입 성공! 인증 메일을 확인해주세요.");
        await signOut(auth);
      } catch (error) {
        console.error("Signup Error:", error.code, error.message);
        // ★★★ else if를 사용한 조건 분기
        if (error.code === 'auth/email-already-in-use') {
          showAlert("회원가입 실패", "이미 사용 중인 이메일입니다.");
        } else if (error.code === 'auth/weak-password') {
          showAlert("회원가입 실패", "비밀번호는 6자리 이상으로 설정해주세요.");
        } else if (error.code === 'auth/missing-password') {
          showAlert("회원가입 실패", "패스워드를 입력해주세요")
        }
        else if (error.code === 'auth/invalid-email') {
          showAlert("회원가입 실패", "유효하지 않은 이메일주소입니다.")
        }
        
        else {
          showAlert("회원가입 실패", "오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
        // showAlert("회원가입 실패", error.code === 'auth/email-already-in-use' ? "이미 사용 중인 이메일입니다." : "오류가 발생했습니다.");
        // alert("회원가입 실패: " + error.message);
      }
    };

    const handleResetPassword = async (email) => {
      if (!email) {
        showAlert("입력 오류", "이메일 주소를 입력해주세요.");
        return;
      }
      try {
        await sendPasswordResetEmail(auth, email);
        showAlert("전송 완료", "비밀번호 재설정 링크를 보냈습니다.");
      } catch (error) {
        console.error("Password Reset Error:", error.code, error.message);

        if (error.code === 'auth/invalid-email') {
          showAlert("전송 실패", "가입되지 않은 이메일 주소입니다.");
        } else {
          showAlert("전송 실패", "오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        }
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
        // ★★★ showAlert 함수를 DdayApp에 props로 전달(추가)
        return user ? <DdayApp user={user} handleLogout={handleLogout} showAlert={showAlert} /> : <Loading />;  

        //  return user ? <DdayApp user={user} handleLogout={handleLogout} /> : <Loading />;
        default:
          return <StartScreen onNavigate={handleNavigation} />;
      }
    };

    return (
      <div className="container">
        {renderContent()}
        {/* ★★★ 3. AlertModal을 렌더링하고 상태와 함수를 props로 전달 */}
        <AlertModal
          isVisible={alertInfo.isVisible}
          title={alertInfo.title}
          message={alertInfo.message}
          onClose={hideAlert}
        />
      </div>
    );
  }

export default App;