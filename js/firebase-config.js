// ------------------------------------------------------------------
// FIREBASE CONFIG — fill this in with YOUR Firestore project's keys.
//
// Get these values from: Firebase Console → Project Settings →
// General → "Your apps" → SDK setup and configuration → Config.
//
// If you leave this as-is (isConfigured stays false), the app will
// automatically fall back to browser localStorage so it still works
// end-to-end while you set up Firestore.
// ------------------------------------------------------------------

export const firebaseConfig = {
  apiKey: "AIzaSyCaQphkoKlUqR2ruOAOLJ1N93mV_Og8Ztc",
  authDomain: "fit-tracker-d0804.firebaseapp.com",
  projectId: "fit-tracker-d0804",
  storageBucket: "fit-tracker-d0804.firebasestorage.app",
  messagingSenderId: "662990449040",
  appId: "1:662990449040:web:e4f3da525f954612a06b15"
};

export const isConfigured = firebaseConfig.apiKey !== "AIzaSyCaQphkoKlUqR2ruOAOLJ1N93mV_Og8Ztc";
