// =======================================================
// ★★★ 새 파일: src/firebase.js
// 역할: Firebase 설정과 초기화를 담당하는 전용 파일
// =======================================================

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// =======================================================================
const firebaseConfig = {
    apiKey: "AIzaSyBq6wADijXkVUOqw44Pv5BKN0xJ9BtS11Q",
    authDomain: "d-day-app.firebaseapp.com",
    projectId: "d-day-app",
    storageBucket: "d-day-app.appspot.com",
    messagingSenderId: "39953405485",
    appId: "1:39953405485:web:3e655af75dcde652ce8aa4",
    measurementId: "G-2YY6MSFZZJ"
};
// =======================================================================

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);

// 다른 파일에서 사용할 수 있도록 auth와 db를 export 합니다.
export const auth = getAuth(app);
export const db = getFirestore(app);
