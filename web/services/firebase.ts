// Firebase client init shared by the web app. The config values are public —
// Firebase enforces security on the server side via the API key's auth-domain
// restriction + Authentication rules, not by hiding the key.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyDtkKKVfk6GXixLy9V-z0GjHJgbUTtQYW8',
  // Custom auth domain on our own registrable domain (myuzika.com) so the
  // OAuth redirect handler's cookies are FIRST-PARTY relative to the app at
  // myuzika.com. With the old zimbabeats-music.firebaseapp.com authDomain,
  // mobile Chrome blocked those cookies as third-party and signInWithRedirect
  // never completed. auth.myuzika.com is a Firebase Hosting custom domain
  // (CNAME -> zimbabeats-music.web.app) serving the real /__/auth/ handler.
  // Also fixes the consent screen branding (shows auth.myuzika.com, not zimbabeats).
  authDomain: 'auth.myuzika.com',
  projectId: 'zimbabeats-music',
  storageBucket: 'zimbabeats-music.firebasestorage.app',
  messagingSenderId: '739115993220',
  appId: '1:739115993220:web:a1c7f95822c5c336475ad1',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export default app;
