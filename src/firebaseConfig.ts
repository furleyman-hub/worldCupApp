// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA-mxGQU7KX-kyRz2XWu-Zk-y6fSPgnkGs",
  authDomain: "world-cup-2026-b594c.firebaseapp.com",
  projectId: "world-cup-2026-b594c",
  storageBucket: "world-cup-2026-b594c.firebasestorage.app",
  messagingSenderId: "1005673655822",
  appId: "1:1005673655822:web:2e1f1b1223af3b0d61565f"
};
// Shared passphrase the family must type when creating an account.
// A light gate against strangers signing up — change it to anything you like.
export const FAMILY_PASSPHRASE = 'usawins';
// Initialize Firebase
const app = initializeApp(firebaseConfig);

