// =======================================================
// 파일 경로: src/main.jsx
// 역할: 우리 앱의 가장 첫 시작점. App 컴포넌트를 실제 HTML에 연결합니다.
// =======================================================

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css'; // 우리가 만든 CSS 파일을 앱 전체에 적용합니다.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
