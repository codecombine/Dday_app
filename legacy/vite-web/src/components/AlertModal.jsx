// src/components/AlertModal.jsx

import React from 'react';

// isVisible, title, message, onClose를 props로 전달받음
function AlertModal({ isVisible, title, message, onClose }) {
  // isVisible이 false이면 아무것도 보여주지 않음
  if (!isVisible) {
    return null;
  }

  return (
    // 모달 배경 (어둡게 처리)
    <div style={styles.overlay}>
      {/* 실제 모달 창 */}
      <div style={styles.modal}>
        <h3 style={styles.title}>{title}</h3>
        <p style={styles.message}>{message}</p>
        <button style={styles.button} onClick={onClose}>
          확인
        </button>
      </div>
    </div>
  );
}

// 스타일을 JavaScript 객체로 정의 (CSS 파일 대신)
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    padding: '20px 30px',
    borderRadius: '12px',
    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
    width: '80%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  title: {
    marginTop: 0,
    color: '#2c3e50',
  },
  message: {
    color: '#555',
    marginBottom: '25px',
  },
  button: {
    padding: '10px 25px',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#0B3040',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '16px',
    cursor: 'pointer',
  }
};

export default AlertModal;