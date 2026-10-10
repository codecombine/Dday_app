// =======================================================
// 파일 경로: src/components/DdayApp.jsx
// 역할: 실제 Firebase Firestore와 연동하여 데이터를 보여주고 관리합니다.
// =======================================================

import React, { useState, useEffect } from 'react';
// ★★★ db 객체와 Firestore 함수들을 가져옵니다.
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from "firebase/firestore";

function DdayApp({ user, handleLogout, showAlert }) {
  const [ddays, setDdays] = useState([]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);

  // ★★★ useEffect를 사용하여 Firestore 데이터 감시 기능을 설정합니다.
  useEffect(() => {
    // 로컬 모드인 경우
    if (user && user.mode === 'local') {
      const savedDdays = JSON.parse(localStorage.getItem('localDdays')) || [];
      setDdays(savedDdays);
      return; // Firebase 리스너를 설정하지 않고 종료
    }

    // Firebase 모드인 경우 (기존 로직)
    if (!user) return;
    // 현재 로그인한 사용자의 dday만 가져오는 쿼리
    const q = query(collection(db, "ddays"), where("userId", "==", user.uid));
    
    // onSnapshot은 데이터가 변경될 때마다 실시간으로 호출됩니다.
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ddayData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDdays(ddayData); // ddays state를 최신 데이터로 업데이트
    });

    // 컴포넌트가 사라질 때 감시 기능을 정리합니다.
    return () => unsubscribe();
  }, [user]); // user 정보가 바뀔 때마다 이 useEffect를 다시 실행합니다.


  // ★★★ 로컬 스토리지에 데이터를 저장하는 도우미 함수
  const saveToLocalStorage = (newDdays) => {
    localStorage.setItem('localDdays', JSON.stringify(newDdays));
  };

  const handleAddDday = async () => {
    if (!title || !date) {
      showAlert("추가 실패", "제목과 날짜를 입력해주세요.");
      return;
    }
      // return alert("제목과 날짜를 입력해주세요.");
    
    // 로컬 모드 처리
    try {
      if (user.mode === 'local') {
        const newDday = { id: Date.now(), title, date };
        const newDdays = [...ddays, newDday];
        setDdays(newDdays);
        saveToLocalStorage(newDdays);
        showAlert("성공", "새로운 D-Day가 추가되었습니다.");
      } else { // Firebase 모드 처리
        await addDoc(collection(db, "ddays"), {
          title: title, date: date, userId: user.uid, createdAt: new Date(),
        });
        showAlert("성공", "새로운 D-Day가 추가되었습니다.");
      }
      setTitle('');
      setDate('');
    } catch (error) {
      console.error("Add D-Day Error:", error);
      showAlert("추가 실패", "D-Day를 추가하는 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteDday = async (id) => {
    // 로컬 모드 처리
    try {
      if (user.mode === 'local') {
        const newDdays = ddays.filter(dday => dday.id !== id);
        setDdays(newDdays);
        saveToLocalStorage(newDdays);
        showAlert("성공", "D-Day가 삭제되었습니다.");
      } else { // Firebase 모드 처리
        await deleteDoc(doc(db, "ddays", id));
        showAlert("성공", "D-Day가 삭제되었습니다.");
      }
     } catch (error) {
        console.error("Delete D-Day Error:", error);
        showAlert("삭제 실패", "D-Day를 삭제하는 중 오류가 발생했습니다.");
      }
  };

  return (
    <div id="app-section">
      <div className="app-header">
        <span className="user-info">환영합니다, {user.email}</span>
        <button id="logout-button" onClick={handleLogout}>로그아웃</button>
      </div>
      <h1>D-Day 목록</h1>
      
      <button id="toggle-edit-button" onClick={() => setIsEditMode(!isEditMode)}>
        {isEditMode ? '완료' : '편집'}
      </button>

      {isEditMode && (
        <div id="edit-panel">
          <input 
            type="text" 
            placeholder="이벤트 이름" 
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input 
            type="date" 
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button id="add-button" onClick={handleAddDday}>추가하기</button>
        </div>
      )}


      <ul id="dday-list">
        {ddays.map(dday => {
          // --- 1. 화면을 그리기 전에 모든 계산을 먼저 끝냅니다. ---
          const targetDate = new Date(dday.date);
          const now = new Date();
          const diff = targetDate - now;

          let resultHTML = null; // JSX를 담을 변수는 null로 초기화

          if (diff < 0) {
            // D-Day가 지난 경우
            const daysPassed = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));
            
            // 년/월/일 계산 로직
            let years = now.getFullYear() - targetDate.getFullYear();
            let months = now.getMonth() - targetDate.getMonth();
            let days = now.getDate() - targetDate.getDate();

            if (days < 0) {
              months--;
              // 이전 달의 마지막 날짜를 가져와 더해줌
              const lastDayOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
              days += lastDayOfPrevMonth;
            }
            if (months < 0) {
              years--;
              months += 12;
            }

            // ★★★ 계산된 결과를 JSX 형태로 변수에 저장
            resultHTML = (
              <>
                <div className="dday-result">D+{daysPassed}</div>
                <div className="dday-elapsed">{years}년 {months}개월 {days}일 지남</div>
              </>
            );

          } else {
            // D-Day가 남은 경우
            const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
            let resultText = `D-${daysLeft}`;
            if (daysLeft === 0) resultText = 'D-Day!';

            // ★★★ 계산된 결과를 JSX 형태로 변수에 저장
            resultHTML = <div className="dday-result">{resultText}</div>;
          }

          // --- 2. 계산이 끝난 후, 그 결과를 사용하여 화면을 그립니다. ---
          return (
            <li key={dday.id} className="dday-item">
              <div className="dday-info">
                <div className="dday-title">{dday.title}</div>
                <div className="dday-date">{dday.date}</div>
                {/* ★★★ JSX 변수를 화면에 렌더링 */}
                {resultHTML}
              </div>
              {isEditMode && (
                <button className="delete-button" onClick={() => handleDeleteDday(dday.id)}>×</button>
              )}
            </li>
          );
        })}
      </ul>
      
    </div>
  );
}

export default DdayApp;
