# Zanco — Complete Rebuild Guide

If the project is ever lost, this document contains everything needed to recreate it from scratch.

---

## What the App Is

**Zanco** is a real estate flip walkthrough app for iOS (saved to home screen as a PWA).  
Live URL: https://zanco.netlify.app  
GitHub repo: https://github.com/hayleycostas/flip-walkthrough  
Local folder: `/Users/hayleycostas/property-walkthrough/`

### Core features
- Multi-user accounts (email + password login, stays logged in)
- Each user has their own projects; team members are invited per-project
- Invite team members via SMS or Email (opens native app with pre-filled message + join link)
- Walkthrough checklist across 9 room categories (Kitchen, Bathrooms, Bedrooms, etc.)
- Status tracking per item: Not Started / In Progress / Done
- Before/After photo slots per item — swipeable carousel, synced to Firebase for all team members
- Summary page: project overview, priorities, budget/timeline, AI renderings, floor plan, walkthrough videos
- Walkthrough videos uploaded to Firebase Storage, streamable by all team members
- Real-time sync — changes appear instantly for everyone on the project
- Export/share report as HTML

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Single-file React 18 app (CDN), Babel transpiled in-browser |
| Hosting | Netlify (auto-deploys from GitHub `main` branch) |
| Auth | Firebase Authentication — Email/Password, LOCAL persistence |
| Database | Firebase Realtime Database |
| File storage | Firebase Storage (for walkthrough videos) |
| SMS/Email invites | Native `sms:` and `mailto:` URI scheme — no backend needed |

---

## Firebase Project

- **Project ID:** `zanco-e2a3f`
- **Database URL:** `https://zanco-e2a3f-default-rtdb.firebaseio.com`
- **API Key:** `AIzaSyBcKTjlFLaExaFuSiuRusH2MDpCm8VzlDQ`
- **Auth Domain:** `zanco-e2a3f.firebaseapp.com`

### Firebase services that must be enabled
1. **Authentication** → Sign-in method → **Email/Password** → Enable
2. **Realtime Database** → Create database (any region)
3. **Storage** → Get started (any region)

### Firebase Realtime Database rules
```json
{
  "rules": {
    "projects": {
      "$projectId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "userProjects": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "invites": {
      ".read": "auth != null",
      ".write": "auth != null"
    }
  }
}
```

### Firebase Storage rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /projects/{projectId}/videos/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Firebase data structure
```
projects/
  {projectId}/
    meta/         { address, sqft, curBed, curBath, futBed, futBath, ownerId, ownerName, createdAt }
    members/      { uid: { name, email, role, addedAt } }
    data/         { catId/itemId: { status, notes, updatedAt, updatedBy }, _summary: { overview, priorities[], budget, timeline } }
    photos/       { catId/itemId: { before: [], vision: [] }, _summary: { photos:[], aiVision:[], floorPlan:[], videos:[] } }

userProjects/
  {uid}/
    {projectId}: true

invites/
  {token}/      { projectId, projectAddress, createdBy, createdByName, createdAt }
```

---

## File Structure

```
property-walkthrough/
├── index.html          ← entire app (single file)
├── icon.png            ← clipboard + hardhat app icon (sage green / seafoam blue)
├── netlify.toml        ← Netlify config
└── REBUILD_GUIDE.md    ← this file
```

---

## How to Rebuild from Scratch

### Step 1 — Set up Firebase
1. Go to https://console.firebase.google.com
2. Create a new project named `zanco-e2a3f` (or any name — update the constants in the code)
3. Add a **Web app** inside the project → copy the `apiKey`
4. Enable **Authentication** → Email/Password
5. Create **Realtime Database** → paste the rules above
6. Enable **Storage** → paste the storage rules above

### Step 2 — Set up GitHub repo
```bash
git init
git remote add origin https://github.com/hayleycostas/flip-walkthrough.git
```

### Step 3 — Set up Netlify
1. Go to https://netlify.com → New site from Git → connect GitHub repo
2. No build command needed — it serves `index.html` directly
3. The site auto-deploys on every push to `main`

### Step 4 — Restore the app file
The entire app lives in `index.html`. Key sections in order:

#### HTML head (lines ~1–20)
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Zanco">
<link rel="apple-touch-icon" href="icon.png">
<link rel="icon" type="image/png" href="icon.png">
<script src="https://unpkg.com/react@18/umd/react.development.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js"></script>
```

#### Firebase init (inside `<script type="text/babel">`)
```javascript
const FB_PROJECT = 'zanco-e2a3f';
const FB_DB_URL  = 'https://zanco-e2a3f-default-rtdb.firebaseio.com';

function initFirebase(apiKey) {
  if (firebase.apps.length) return true;
  try {
    firebase.initializeApp({
      apiKey,
      authDomain: `${FB_PROJECT}.firebaseapp.com`,
      databaseURL: FB_DB_URL,
      projectId: FB_PROJECT,
      storageBucket: `${FB_PROJECT}.appspot.com`
    });
    return true;
  } catch(e) { return false; }
}

// Hardcoded — no setup screen needed
initFirebase('AIzaSyBcKTjlFLaExaFuSiuRusH2MDpCm8VzlDQ');
```

#### DB helpers
```javascript
const getDb   = () => firebase.database();
const getAuth = () => firebase.apps.length ? firebase.auth() : null;
const dbGet    = path => getDb().ref(path).once('value').then(s=>s.val());
const dbSet    = (path,v) => getDb().ref(path).set(v);
const dbUpdate = (path,v) => getDb().ref(path).update(v);
const dbRemove = path => getDb().ref(path).remove();
function dbListen(path, cb) {
  const ref = getDb().ref(path);
  ref.on('value', s => cb(s.val()));
  return () => ref.off('value');
}
```

#### Key components (in order)
1. `LoginPage` — email/password sign in, link to SignupPage
2. `SignupPage` — name + email + password, calls `createUserWithEmailAndPassword`
3. `MigrationModal` — one-time modal to import any data from localStorage on first login
4. `InviteModal` — two tabs: SMS (opens Messages app) and Email (opens Mail app), both with pre-filled join link
5. `PhotoSlot` — swipeable carousel for before/after photos; touch swipe + prev/next buttons + dot indicators
6. `VideoSection` — uploads video files to Firebase Storage, shows progress bar, displays with `<video>` tag
7. `SummaryPage` — overview text, priorities list, budget/timeline, photos, AI renderings, floor plan, videos
8. `WalkthroughView` — main view; two Firebase listeners (data + photos), `updateItem` splits photos to `/photos` path
9. `ParticipantsPage` — shows all project members from Firebase, owner can remove members
10. `PropertyList` — lists all projects for the logged-in user from Firebase
11. `App` — root; handles auth state, invite token detection in URL (`?join=TOKEN`), routes between screens

#### Auth persistence (important)
```javascript
getAuth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
```
This keeps the user logged in after closing the app.

#### Invite flow
- Owner opens InviteModal → enters phone or email → app generates a token in `/invites/{token}` → opens SMS/Mail with link `https://zanco.netlify.app?join={token}`
- New user opens the link → app detects `?join=TOKEN` in URL → after signup/login, reads the invite from Firebase → adds user to `projects/{id}/members/` and `userProjects/{uid}/{projectId}`

#### Photo sync architecture
Photos are stored separately from checklist data to keep updates fast:
- Status/notes → `/projects/{id}/data/{catId}/{itemId}`
- Photos → `/projects/{id}/photos/{catId}/{itemId}` with `{ before: [], vision: [] }`
- Two separate `dbListen` calls in `WalkthroughView` merge both into a single state object via `buildMerged()`

#### Video upload
```javascript
const storage = firebase.storage();
const ref = storage.ref(`projects/${propId}/videos/${uid()}_${file.name}`);
const task = ref.put(file);
task.on('state_changed', snap => setProgress(Math.round(snap.bytesTransferred/snap.totalBytes*100)));
await task;
const url = await ref.getDownloadURL();
// Save url to Firebase /photos/_summary/videos array
```

---

## Deployment

Every `git push` to `main` triggers an automatic Netlify deploy. To deploy manually:
```bash
cd /Users/hayleycostas/property-walkthrough
git add index.html
git commit -m "Your message"
git push
```
Netlify deploys in ~30 seconds. Check status at https://app.netlify.com.

---

## The App Icon

`icon.png` — a clipboard with a hardhat overlay in sage green / seafoam blue tones.  
To add to iPhone home screen: open https://zanco.netlify.app in Safari → Share → Add to Home Screen.

---

## Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| Sign up fails with `auth/operation-not-allowed` | Enable Email/Password in Firebase Console → Authentication → Sign-in method |
| Video upload fails | Enable Firebase Storage and paste the storage rules above |
| App shows old version after deploy | Hard reload in Safari: hold Reload button → Reload Without Content Blockers; or clear website data |
| Firebase error on load | Check that the API key in the code matches the one in Firebase Console → Project Settings |
| Photos not visible to other team members | Confirm `/photos` Firebase rules allow authenticated reads |
