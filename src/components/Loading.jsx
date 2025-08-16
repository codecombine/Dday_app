// src/components/Loading.jsx

function Loading() {
  // 로딩 스피너의 스타일은 index.css에 이미 정의되어 있습니다.
  return (
    <div className="loader">
      <div className="spinner"></div>
    </div>
  );
}

export default Loading;