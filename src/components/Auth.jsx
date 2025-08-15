// =======================================================
// 파일 경로: src/components/Auth.jsx
// 역할: State와 Props를 사용하여 스스로 화면을 전환하고,
//       부모로부터 받은 함수를 실행하는 컴포넌트
// =======================================================

import React, { useState } from 'react'; // ★★★ useState를 import 합니다.

// ★★★ 부모로부터 함수들을 props로 전달받습니다.
function Auth({ handleLogin, handleGoogleLogin, handleSignup, handleResetPassword }) {
  // ★★★ State를 사용하여 현재 보여줄 뷰(view)를 기억합니다.
  const [view, setView] = useState('login'); // 'login', 'signup', 'reset'

  // ★★★ State를 사용하여 각 입력창의 값을 기억합니다.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // ★★★ 각 뷰를 보여주는 JSX를 미리 만들어 둡니다.
  const loginView = (
    <div id="login-view">
      <h2>로그인</h2>
      <div className="auth-form">
        <input 
          type="email" 
          placeholder="이메일" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} // 입력값이 바뀔 때마다 email state 업데이트
        />
        <input 
          type="password" 
          placeholder="비밀번호" 
          value={password}
          onChange={(e) => setPassword(e.target.value)} // 입력값이 바뀔 때마다 password state 업데이트
        />
        <button id="login-button" onClick={() => handleLogin(email, password)}>로그인</button>
        <button id="google-login-button" onClick={handleGoogleLogin}>구글 계정으로 로그인</button>
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '5px 0' }} />
        <button className="auth-link" onClick={() => setView('signup')}>계정이 없으신가요? 회원가입</button>
        <button className="auth-link" onClick={() => setView('reset')}>비밀번호를 잊으셨나요?</button>
      </div>
    </div>
  );

  const signupView = (
    <div id="signup-view">
      <h2>회원가입</h2>
      <div className="auth-form">
        <input 
          type="email" 
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input 
          type="password" 
          placeholder="비밀번호 (6자리 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button id="signup-button" onClick={() => handleSignup(email, password)}>이메일로 회원가입</button>
        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '5px 0' }} />
        <button className="auth-link" onClick={() => setView('login')}>이미 계정이 있으신가요? 로그인</button>
      </div>
    </div>
  );

  const resetView = (
     <div id="reset-view">
        <h2>비밀번호 재설정</h2>
        <div className="auth-form">
          <p>가입하신 이메일 주소를 입력하시면 재설정 링크를 보내드립니다.</p>
          <input 
            type="email" 
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button id="reset-password-button" onClick={() => handleResetPassword(email)}>재설정 링크 발송</button>
          <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '5px 0' }} />
          <button className="auth-link" onClick={() => setView('login')}>로그인 화면으로 돌아가기</button>
        </div>
      </div>
  );

  return (
    <div id="auth-section">
      {/* ★★★ view state 값에 따라 보여줄 화면을 결정합니다. */}
      {view === 'login' && loginView}
      {view === 'signup' && signupView}
      {view === 'reset' && resetView}
    </div>
  );
}

export default Auth;