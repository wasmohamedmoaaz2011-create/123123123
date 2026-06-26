import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where,
  writeBatch
} from 'firebase/firestore';

// ----------------------------------------------------
// Local Database Configuration (IndexedDB)
// ----------------------------------------------------
const LOCAL_DB_NAME = 'TeacherSystemLocalDB';
const LOCAL_DB_VERSION = 1;

function getIndexedDB() {
  return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
}

export function initLocalDB() {
  return new Promise((resolve, reject) => {
    const idb = getIndexedDB();
    if (!idb) {
      reject(new Error('IndexedDB is not supported on this device.'));
      return;
    }
    const request = idb.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('groups')) {
        db.createObjectStore('groups', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('students')) {
        db.createObjectStore('students', { keyPath: 'id' });
      }
    };
  });
}

// Helper to run a transaction
function runLocalTransaction(storeName, mode, callback) {
  return initLocalDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);
      
      transaction.oncomplete = () => resolve(request ? request.result : null);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

// ----------------------------------------------------
// Firebase Configuration & Initialization
// ----------------------------------------------------
let firebaseApp = null;
let firestoreDb = null;

export function getFirebaseConfig() {
  // Try to load from localStorage first (dynamic user configuration)
  const savedConfig = localStorage.getItem('firebase_config');
  if (savedConfig) {
    try {
      return JSON.parse(savedConfig);
    } catch (e) {
      console.error('Failed to parse saved Firebase config', e);
    }
  }
  
  // Fallback to environment variables
  if (process.env.REACT_APP_FIREBASE_API_KEY) {
    return {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
      authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
      storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.REACT_APP_FIREBASE_APP_ID
    };
  }
  
  return null;
}

export function isCloudMode() {
  return !!getFirebaseConfig();
}

export function initFirebase() {
  const config = getFirebaseConfig();
  if (!config) {
    firebaseApp = null;
    firestoreDb = null;
    return false;
  }
  
  try {
    if (getApps().length === 0) {
      firebaseApp = initializeApp(config);
    } else {
      firebaseApp = getApp();
    }
    firestoreDb = getFirestore(firebaseApp);
    return true;
  } catch (e) {
    console.error('Failed to initialize Firebase', e);
    firebaseApp = null;
    firestoreDb = null;
    return false;
  }
}

// Initialize on load
initFirebase();

// ----------------------------------------------------
// Unified DB Interface (Dynamic Routing)
// ----------------------------------------------------

export async function getGroups() {
  if (isCloudMode() && firestoreDb) {
    try {
      const q = collection(firestoreDb, 'groups');
      const querySnapshot = await getDocs(q);
      const groups = [];
      querySnapshot.forEach((doc) => {
        groups.push({ id: doc.id, ...doc.data() });
      });
      return groups;
    } catch (e) {
      console.warn('Firestore read failed, falling back to local cache', e);
    }
  }
  
  // Fallback/Default to IndexedDB
  return runLocalTransaction('groups', 'readonly', (store) => store.getAll());
}

export async function saveGroup(group) {
  // Always save to IndexedDB as local cache
  await runLocalTransaction('groups', 'readwrite', (store) => store.put(group));
  
  if (isCloudMode() && firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'groups', group.id);
      await setDoc(docRef, group);
    } catch (e) {
      console.error('Firestore saveGroup failed', e);
    }
  }
  return group;
}

export async function deleteGroup(groupId) {
  // 1. Delete from IndexedDB
  await runLocalTransaction('groups', 'readwrite', (store) => store.delete(groupId));
  
  // 2. Delete all students of this group locally
  const students = await getStudents(groupId);
  for (const s of students) {
    await deleteStudent(s.id);
  }
  
  // 3. Cloud updates
  if (isCloudMode() && firestoreDb) {
    try {
      // Delete group
      await deleteDoc(doc(firestoreDb, 'groups', groupId));
      
      // Delete students (using batch)
      const batch = writeBatch(firestoreDb);
      students.forEach((s) => {
        batch.delete(doc(firestoreDb, 'students', s.id));
      });
      await batch.commit();
    } catch (e) {
      console.error('Firestore deleteGroup failed', e);
    }
  }
}

export async function getStudents(groupId) {
  if (isCloudMode() && firestoreDb) {
    try {
      const q = query(collection(firestoreDb, 'students'), where('group_id', '==', groupId));
      const querySnapshot = await getDocs(q);
      const students = [];
      querySnapshot.forEach((doc) => {
        students.push({ id: doc.id, ...doc.data() });
      });
      return students;
    } catch (e) {
      console.warn('Firestore read students failed, falling back to local', e);
    }
  }
  
  // Local IndexedDB query
  const allStudents = await runLocalTransaction('students', 'readonly', (store) => store.getAll());
  return allStudents.filter(s => s.group_id === groupId);
}

export async function saveStudent(student) {
  // Save to IndexedDB
  await runLocalTransaction('students', 'readwrite', (store) => store.put(student));
  
  if (isCloudMode() && firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'students', student.id);
      await setDoc(docRef, student);
    } catch (e) {
      console.error('Firestore saveStudent failed', e);
    }
  }
  return student;
}

export async function deleteStudent(studentId) {
  // Delete from IndexedDB
  await runLocalTransaction('students', 'readwrite', (store) => store.delete(studentId));
  
  if (isCloudMode() && firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'students', studentId));
    } catch (e) {
      console.error('Firestore deleteStudent failed', e);
    }
  }
}

// ----------------------------------------------------
// Sync Local Data to Cloud & Settings Configuration
// ----------------------------------------------------

export async function syncLocalToCloud(config) {
  // 1. Temporarily initialize Firebase with the new config
  let tempApp;
  let tempDb;
  try {
    tempApp = initializeApp(config, 'tempSyncApp');
    tempDb = getFirestore(tempApp);
  } catch (e) {
    throw new Error('بيانات الاتصال غير صالحة. يرجى التحقق من الكود المدخل. ' + e.message);
  }
  
  // 2. Fetch all local data
  const localGroups = await runLocalTransaction('groups', 'readonly', (store) => store.getAll());
  const localStudents = await runLocalTransaction('students', 'readonly', (store) => store.getAll());
  
  // 3. Write local data to Firestore using batches to optimize writes
  try {
    // Write Groups
    const groupBatch = writeBatch(tempDb);
    localGroups.forEach((group) => {
      const docRef = doc(tempDb, 'groups', group.id);
      groupBatch.set(docRef, group);
    });
    if (localGroups.length > 0) {
      await groupBatch.commit();
    }
    
    // Write Students (max 500 per batch in Firestore)
    const chunkSize = 400;
    for (let i = 0; i < localStudents.length; i += chunkSize) {
      const studentBatch = writeBatch(tempDb);
      const chunk = localStudents.slice(i, i + chunkSize);
      chunk.forEach((student) => {
        const docRef = doc(tempDb, 'students', student.id);
        studentBatch.set(docRef, student);
      });
      await studentBatch.commit();
    }
    
    // 4. Save config to localStorage and switch mode
    localStorage.setItem('firebase_config', JSON.stringify(config));
    initFirebase(); // Re-initialize the default app
    return true;
  } catch (e) {
    console.error('Sync failed', e);
    throw new Error('حدث خطأ أثناء نقل البيانات إلى السحابة: ' + e.message);
  }
}

export function disconnectCloud() {
  localStorage.removeItem('firebase_config');
  firebaseApp = null;
  firestoreDb = null;
  initFirebase();
}

// ----------------------------------------------------
// Export / Import JSON Backup Utility (Local-first safety)
// ----------------------------------------------------

export async function exportBackupData() {
  const groups = await runLocalTransaction('groups', 'readonly', (store) => store.getAll());
  const students = await runLocalTransaction('students', 'readonly', (store) => store.getAll());
  
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    data: { groups, students }
  };
}

export async function importBackupData(backupJson) {
  if (!backupJson || !backupJson.data || !backupJson.data.groups || !backupJson.data.students) {
    throw new Error('ملف النسخة الاحتياطية غير صالح.');
  }
  
  const { groups, students } = backupJson.data;
  
  // Save to IndexedDB
  for (const group of groups) {
    await runLocalTransaction('groups', 'readwrite', (store) => store.put(group));
  }
  for (const student of students) {
    await runLocalTransaction('students', 'readwrite', (store) => store.put(student));
  }
  
  // If cloud mode is active, sync them to cloud too
  if (isCloudMode() && firestoreDb) {
    try {
      const config = getFirebaseConfig();
      await syncLocalToCloud(config);
    } catch (e) {
      console.warn('Backup imported locally, but cloud sync failed. It will sync on next writes.', e);
    }
  }
  
  return { groupsCount: groups.length, studentsCount: students.length };
}
