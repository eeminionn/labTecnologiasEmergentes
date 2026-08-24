import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDyGdQ9yW_IivMKg5Fkmw7upXWmsg1Eq4w",
  authDomain: "registro-vehicular-mlr.firebaseapp.com",
  projectId: "registro-vehicular-mlr",
  storageBucket: "registro-vehicular-mlr.firebasestorage.app",
  messagingSenderId: "813235786860",
  appId: "1:813235786860:web:cf22fa603d38c25f09b449",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const authReady = setPersistence(auth, browserLocalPersistence);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
