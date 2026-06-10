// Copy this file to src/firebaseConfig.ts and fill in the values from your
// Firebase console (Project settings -> Your apps -> Web app -> Config).
// The web config is NOT a secret — security comes from Firestore rules.
// See SETUP.md for the full walkthrough.

export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// Shared passphrase the family must type when creating an account.
// A light gate against strangers signing up — change it to anything you like.
export const FAMILY_PASSPHRASE = 'changeme';
