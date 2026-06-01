// Firebase client init shared by the web app. The config values are public —
// Firebase enforces security on the server side via the API key's auth-domain
// restriction + Authentication rules, not by hiding the key.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDtkKKVfk6GXixLy9V-z0GjHJgbUTtQYW8',
  authDomain: 'zimbabeats-music.firebaseapp.com',
  projectId: 'zimbabeats-music',
  storageBucket: 'zimbabeats-music.firebasestorage.app',
  messagingSenderId: '739115993220',
  appId: '1:739115993220:web:a1c7f95822c5c336475ad1',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
