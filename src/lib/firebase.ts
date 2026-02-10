import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAOrb982IITeJ1id2kERk5X1tC4d2eU6Bc",
    authDomain: "muahasebe.firebaseapp.com",
    projectId: "muahasebe",
    storageBucket: "muahasebe.firebasestorage.app",
    messagingSenderId: "1034524721488",
    appId: "1:1034524721488:web:496742eed5ec7398aa2c55",
    measurementId: "G-8Y2T6YRVXL"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
