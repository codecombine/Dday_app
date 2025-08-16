// src/components/StartScreen.jsx

import Footer from './Footer'; // 방금 만든 Footer 컴포넌트를 가져옵니다.

// ★★★ App.jsx로부터 어떤 버튼을 눌렀는지 알려줄 함수를 props로 전달받습니다.
function StartScreen({ onNavigate }) {
  return (
    <div>
      <h1 className="main-title">D-Day App</h1>
      <p style={{ marginTop: '-20px', marginBottom: '40px' }}>
        편리하고 안전한 D-Day App 서비스를 평생 무료로 제공해드립니다.
      </p>

      <div className="auth-form">
        {/* '바로 시작하기' 버튼을 누르면 onNavigate 함수에 'local'을 전달합니다. */}
        <button onClick={() => onNavigate('local')} style={{ backgroundColor: '#0B3040' }}>
          바로 시작하기
        </button>
        {/* '로그인하여 시작하기' 버튼을 누르면 onNavigate 함수에 'login'을 전달합니다. */}
        <button onClick={() => onNavigate('login')} style={{ backgroundColor: '#104861' }}>
          로그인하여 시작하기
        </button>
      </div>

      <p style={{ fontSize: '0.8em', color: '#888', marginTop: '20px', lineHeight: '1.5' }}>
        <strong>바로 시작하기</strong>: 데이터가 현재 기기(브라우저)에만 저장됩니다.<br />
        <strong>로그인하여 시작하기</strong>: 데이터가 Google Firebase DB에 안전하게 보관됩니다.
      </p>
      
      <Footer />
    </div>
  );
}

export default StartScreen;