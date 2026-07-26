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
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};

export const isConfigured = firebaseConfig.apiKey !== "REPLACE_ME";
