/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Code2,
  Timer,
  Trophy,
  User as UserIcon,
  Users,
  Play,
  CheckCircle2,
  AlertCircle,
  LogOut,
  ChevronRight,
  Terminal,
  FileCode,
  Plus,
  Edit2,
  Trash2,
  Save,
  X,
  Languages
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Editor from '@monaco-editor/react';
import {
  db,
  auth,
  signIn,
  logOut
} from './firebase';
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  orderBy,
  limit,
  addDoc,
  deleteDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore';
import { QUESTIONS, Question } from './questions';
import { compileCode } from './CompilerService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it correctly for the system
}

interface UserData {
  uid: string;
  email?: string;
  name: string;
  studentId: string;
  teamNo: string;
  score: number;
  startTime: string;
  completed: boolean;
  lastActive: string;
}

const CHALLENGE_DURATION = 20 * 60; // 20 minutes in seconds

const IS_OFFLINE = import.meta.env.VITE_IS_OFFLINE === 'true';
const LOCAL_API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [output, setOutput] = useState('');
  const [isCompiling, setIsCompiling] = useState(false);
  const [timeLeft, setTimeLeft] = useState(CHALLENGE_DURATION);
  const [leaderboard, setLeaderboard] = useState<UserData[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [allUsers, setAllUsers] = useState<UserData[]>([]);
  const [loginForm, setLoginForm] = useState({ name: '', studentId: '', teamNo: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [adminTab, setAdminTab] = useState<'users' | 'questions'>('users');
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [dismissCompleted, setDismissCompleted] = useState(false);

  const isAdminUser = user?.email === 'karunakar.pothuganti@gmail.com' || (IS_OFFLINE && user?.uid === 'off_ADMIN001');

  // Fetch questions from Firestore
  const fetchQuestions = useCallback(async () => {
    console.log('[App] Fetching questions...');
    try {
      const snapshot = await getDocs(collection(db, 'questions'));
      if (snapshot.empty) {
        console.log('[App] No questions in Firestore, using static list');
        setQuestions(QUESTIONS);
      } else {
        const data = snapshot.docs.map(d => ({
          id: d.data().id,
          ...d.data(),
          _firestoreId: d.id
        })) as any[];
        data.sort((a, b) => (a.id || 0) - (b.id || 0));
        console.log(`[App] Loaded ${data.length} questions from Firestore`);
        setQuestions(data);
      }
    } catch (error) {
      console.error('[App] Failed to fetch questions:', error);
      setQuestions(QUESTIONS);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Auth listener - Firestore only
  useEffect(() => {
    console.log('[Auth] Initializing auth listener');
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      console.log('[Auth] State changed:', u ? `User: ${u.uid}` : 'Logged out');
      setUser(u);
      if (u) {
        try {
          const userDoc = await getDoc(doc(db, 'users', u.uid));
          if (userDoc.exists()) {
            console.log('[Auth] User data found in Firestore');
            setUserData(userDoc.data() as UserData);
          } else {
            console.log('[Auth] No user data found in Firestore');
            // If it's the admin, we don't necessarily need a document to show the dashboard
            if (u.email === 'karunakar.pothuganti@gmail.com') {
              setUserData({
                uid: u.uid,
                name: 'Admin',
                studentId: 'ADMIN',
                teamNo: '0',
                score: 0,
                startTime: new Date().toISOString(),
                completed: false,
                lastActive: new Date().toISOString(),
                email: u.email
              });
            }
          }
        } catch (err) {
          console.error('[Auth] Error fetching user data:', err);
        }
        await fetchQuestions();
      } else {
        setUserData(null);
        setLoadingQuestions(false); // Even if logged out, stop loading questions
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [fetchQuestions]);

  // Leaderboard listener - Firestore onSnapshot
  useEffect(() => {
    if (!user) return;
    const path = 'users';
    const q = query(collection(db, path), orderBy('score', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as UserData);
      setLeaderboard(data.filter(u => u.name !== 'Admin' && u.email !== 'karunakar.pothuganti@gmail.com'));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return unsubscribe;
  }, [user]);

  // Admin: All users listener - Firestore onSnapshot
  useEffect(() => {
    if (isAdminUser && user) {
      const path = 'users';
      const q = query(collection(db, path), orderBy('lastActive', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as UserData);
        setAllUsers(data.filter(u => u.name !== 'Admin' && u.email !== 'karunakar.pothuganti@gmail.com'));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });
      return unsubscribe;
    }
  }, [isAdminUser, user]);

  // Timer logic
  useEffect(() => {
    if (userData && !userData.completed && !isAdminUser) {
      const start = new Date(userData.startTime).getTime();
      const interval = setInterval(() => {
        const now = Date.now();
        const elapsed = Math.floor((now - start) / 1000);
        const remaining = Math.max(0, CHALLENGE_DURATION - elapsed);
        setTimeLeft(remaining);

        if (remaining <= 0) {
          handleFinishChallenge();
          clearInterval(interval);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [userData]);

  const handleLogout = async () => {
    try {
      await logOut();
      setUser(null);
      setUserData(null);
      setShowAdminDashboard(false);
      setShowLeaderboard(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    console.log('[Login] Starting login process...');
    try {
      const u = await signIn();
      console.log('[Login] Firebase Auth success:', u.uid);
      const userDocRef = doc(db, 'users', u.uid);
      const userDoc = await getDoc(userDocRef);
      
      let finalUserData: UserData;
      if (!userDoc.exists()) {
        console.log('[Login] Creating brand new user profile');
        finalUserData = {
          uid: u.uid,
          name: loginForm.name,
          studentId: loginForm.studentId,
          teamNo: loginForm.teamNo,
          score: 0,
          startTime: new Date().toISOString(),
          completed: false,
          lastActive: new Date().toISOString(),
          email: u.email || undefined
        };
        await setDoc(userDocRef, finalUserData);
        console.log('[Login] Profile saved to Firestore');
      } else {
        console.log('[Login] Existing profile found');
        finalUserData = userDoc.data() as UserData;
      }
      
      setUserData(finalUserData);
      console.log('[Login] App state updated, ready to start');
    } catch (error: any) {
      console.error('[Login] Process failed:', error);
      alert('Login failed: ' + (error.message || 'Unknown error'));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setIsSavingQuestion(true);
    try {
      const firestoreId = (editingQuestion as any)._firestoreId;
      const dataToSave = { ...editingQuestion };
      delete (dataToSave as any)._firestoreId;
      if (firestoreId) {
        await setDoc(doc(db, 'questions', firestoreId), dataToSave, { merge: true });
      } else {
        const newId = questions.length > 0 ? Math.max(...questions.map(q => q.id || 0)) + 1 : 1;
        await addDoc(collection(db, 'questions'), { ...dataToSave, id: newId });
      }
      await fetchQuestions();
      setEditingQuestion(null);
      alert('✅ Question saved!');
    } catch (error: any) {
      alert(`❌ Save failed: ${error.message}`);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!window.confirm('Delete this question?')) return;
    try {
      const q = questions.find(q => q.id === id) as any;
      const firestoreId = q?._firestoreId;
      if (firestoreId) await deleteDoc(doc(db, 'questions', firestoreId));
      await fetchQuestions();
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const currentQuestion = questions && questions.length > 0 ? questions[currentQuestionIndex] : null;

  useEffect(() => {
    if (currentQuestion) {
      setLanguage(currentQuestion.language || 'python');
      setCode(currentQuestion.buggyCode[currentQuestion.language as keyof typeof currentQuestion.buggyCode] || '');
    }
  }, [currentQuestionIndex, questions, currentQuestion]);

  const handleRunCode = async () => {
    setIsCompiling(true);
    setOutput('Compiling and running...');
    try {
      const result = await compileCode(language, code);
      setOutput(result.output || result.stderr || 'No output');

      // Helper to normalize output for comparison
      const normalize = (str: string) => str.replace(/\s+/g, ' ').trim();

      // Check if correct
      const expected = currentQuestion.testCases[0].expectedOutput;
      const isCorrect = normalize(result.stdout) === normalize(expected);

      if (isCorrect) {
        setOutput(prev => prev + '\n\n✅ CORRECT! Well done.');
        if (userData && !userData.completed) {
          const newScore = userData.score + currentQuestion.points;
          const userDocRef = doc(db, 'users', userData.uid);
          await setDoc(userDocRef, { ...userData, score: newScore, lastActive: new Date().toISOString() }, { merge: true });
          setUserData(prev => prev ? { ...prev, score: newScore } : null);
          if (currentQuestionIndex < questions.length - 1) {
            setTimeout(() => { setShowLeaderboard(true); setCurrentQuestionIndex(prev => prev + 1); setOutput(''); }, 2000);
          } else {
            setTimeout(() => { handleFinishChallenge(); }, 2000);
          }
        }
      } else {
        setOutput(prev => prev + '\n\n❌ INCORRECT. Try again!');
      }

      if (user) {
        try {
          await addDoc(collection(db, 'submissions'), {
            userId: user.uid,
            questionId: currentQuestion.id,
            code,
            language,
            status: isCorrect ? 'correct' : 'incorrect',
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'submissions');
        }
      }
    } catch (error) {
      setOutput('Error: ' + (error as Error).message);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleFinishChallenge = async () => {
    if (userData && !userData.completed) {
      const userDocRef = doc(db, 'users', userData.uid);
      await setDoc(userDocRef, { ...userData, completed: true }, { merge: true });
      setUserData(prev => prev ? { ...prev, completed: true } : null);
      setShowLeaderboard(true);
    }
  };

  // Timeout guard for loading screen
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading || loadingQuestions) {
        console.warn('[App] Loading timeout reached. Forcing load state to false.');
        setLoading(false);
        setLoadingQuestions(false);
      }
    }, 10000); // 10 seconds
    return () => clearTimeout(timer);
  }, [loading, loadingQuestions]);

  if (loading || loadingQuestions) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            <img src="/logo.png" alt="ByteXL Logo" className="h-12 w-auto object-contain" />
          </motion.div>
          <p className="text-slate-500 text-xs font-medium animate-pulse">Initializing Platform...</p>
        </div>
      </div>
    );
  }

  if (!user || !userData) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white border border-slate-300 rounded-2xl p-8 shadow-2xl"
        >
          {IS_OFFLINE && (
            <div className="absolute top-4 right-4 px-2 py-0.5 border border-blue-600/20 bg-blue-600/5 rounded text-[8px] font-bold text-blue-600/60 uppercase tracking-widest pointer-events-none">
              Local Environment Active
            </div>
          )}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6">
              <img src="/logo.png" alt="ByteXL Logo" className="h-16 w-auto object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center">ByteXL Debug Challenge</h1>
            <p className="text-slate-500 text-sm mt-2">Professional Coding Arena</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                required
                type="text"
                value={loginForm.name}
                onChange={e => setLoginForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50 transition-colors"
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Student ID</label>
              <input
                required
                type="text"
                value={loginForm.studentId}
                onChange={e => setLoginForm(prev => ({ ...prev, studentId: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50 transition-colors"
                placeholder="ID Number"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5">Team Number</label>
              <input
                required
                type="text"
                value={loginForm.teamNo}
                onChange={e => setLoginForm(prev => ({ ...prev, teamNo: e.target.value }))}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50 transition-colors"
                placeholder="Team #"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>Start Challenge <ChevronRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            20 Minutes • 6 Questions • Real-time Leaderboard
          </p>
        </motion.div >
      </div >
    );
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="h-16 border-bottom border-slate-300 bg-white flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="ByteXL Logo" className="h-8 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-sm tracking-tight">ByteXL Debug Challenge</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Live Editor</p>
              {IS_OFFLINE && (
                <span className="text-[8px] font-bold text-blue-600 bg-blue-600/10 px-1.5 py-0.5 rounded border border-blue-600/20">LOCAL</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {!isAdminUser && (
            <div className="flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-200">
              <Timer className={cn("w-4 h-4", timeLeft < 60 ? "text-red-500 animate-pulse" : "text-blue-600")} />
              <span className={cn("font-mono text-sm font-bold", timeLeft < 60 ? "text-red-500" : "text-slate-900")}>
                {formatTime(timeLeft)}
              </span>
            </div>
          )}

          <div className="flex items-center gap-4">
            {isAdminUser && (
              <button
                onClick={() => setShowAdminDashboard(true)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold transition-colors"
              >
                Admin
              </button>
            )}
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold">{userData.name}</p>
              <p className="text-[10px] text-slate-500">Team {userData.teamNo}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-300 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-slate-600 group-hover:text-red-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Questions List */}
        <aside className="w-80 border-right border-slate-300 bg-slate-50 hidden lg:flex flex-col">
          <div className="p-6 border-bottom border-slate-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Questions</h2>
              <span className="text-xs font-bold text-blue-600">{currentQuestionIndex + 1}/{questions.length}</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-600"
                initial={{ width: 0 }}
                animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => setCurrentQuestionIndex(idx)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all group",
                  idx === currentQuestionIndex
                    ? "bg-blue-600/10 border-blue-600/30 text-blue-600"
                    : "bg-transparent border-transparent hover:bg-slate-100 text-slate-600"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold",
                    idx === currentQuestionIndex ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
                  )}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium truncate">{q.title}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 border-top border-slate-300">
            <button
              onClick={() => setShowLeaderboard(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-bold"
            >
              <Trophy className="w-4 h-4 text-yellow-500" /> Leaderboard
            </button>
          </div>
        </aside>

        {/* Main Content - Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {userData.completed && !isAdminUser && !dismissCompleted ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-md w-full text-center space-y-6"
              >
                <div className="w-24 h-24 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto">
                  <Trophy className="w-12 h-12 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Challenge Completed!</h2>
                  <p className="text-slate-500 mt-2">You've finished the ByteXL Debug Challenge. Check your final rank on the leaderboard.</p>
                </div>
                <div className="bg-white border border-slate-300 rounded-2xl p-6">
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Final Score</p>
                  <p className="text-5xl font-bold text-blue-600">{userData.score}</p>
                </div>
                <button
                  onClick={() => setShowLeaderboard(true)}
                  className="w-full py-4 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-colors"
                >
                  View Leaderboard
                </button>
                <button
                  onClick={() => setDismissCompleted(true)}
                  className="w-full py-3 rounded-xl border border-slate-300 text-slate-600 font-bold hover:bg-slate-100 transition-colors text-sm"
                >
                  ✕ Continue Working on Questions
                </button>
              </motion.div>
            </div>
          ) : (
            <>
              {/* Question Header */}
              <div className="p-6 bg-white border-bottom border-slate-300">
                <div className="flex items-start justify-between gap-4">
                  {currentQuestion ? (
                    <>
                      <div>
                        <h2 className="text-xl font-bold">{currentQuestion.title}</h2>
                        <p className="text-slate-600 mt-1 text-sm">{currentQuestion.description}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-blue-600/10 px-3 py-1.5 rounded-lg border border-blue-600/20">
                        <Trophy className="w-4 h-4 text-blue-600" />
                        <span className="text-xs font-bold text-blue-600">{currentQuestion.points} pts</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 py-4 text-center text-slate-400 italic text-sm">
                      Question data unavailable. Contact admin to seed questions.
                    </div>
                  )}
                </div>
              </div>

              {/* Editor Toolbar */}
              <div className="h-12 bg-slate-50 border-bottom border-slate-300 flex items-center justify-between px-4">
                <div className="flex items-center gap-1.5">
                  {(['python', 'java', 'c', 'cpp'] as const).map(lang => {
                    const isActive = lang === (currentQuestion.language || 'python');
                    return (
                      <button
                        key={lang}
                        disabled={!isActive}
                        className={cn(
                          "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                          isActive
                            ? "bg-blue-600 text-white cursor-default"
                            : "bg-slate-100 text-slate-300 cursor-not-allowed line-through opacity-50"
                        )}
                        title={isActive ? `Active: ${lang}` : `Disabled for this question`}
                      >
                        {lang}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleRunCode}
                    disabled={isCompiling}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all"
                  >
                    {isCompiling ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Terminal className="w-3.5 h-3.5" /></motion.div>
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    Run Code
                  </button>
                </div>
              </div>

              {/* Editor & Console */}
              <div className="flex-1 flex flex-col lg:flex-row min-h-0">
                <div className="flex-1 border-right border-slate-300 relative">
                  <Editor
                    height="100%"
                    language={language === 'cpp' ? 'cpp' : language === 'c' ? 'c' : language}
                    theme="light"
                    value={code}
                    onChange={(v) => setCode(v || '')}
                    options={{
                      fontSize: 14,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      padding: { top: 20 },
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  />
                </div>
                <div className="w-full lg:w-96 bg-slate-50 flex flex-col">
                  <div className="h-10 border-bottom border-slate-300 flex items-center px-4 bg-white">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console Output</span>
                  </div>
                  <div className="flex-1 p-4 font-mono text-xs overflow-y-auto whitespace-pre-wrap">
                    {output ? (
                      <div className={cn(
                        "p-3 rounded-lg border",
                        output.includes('✅') ? "bg-blue-600/10 border-blue-600/20 text-blue-600" :
                          output.includes('❌') ? "bg-red-500/10 border-red-500/20 text-red-400" :
                            "bg-slate-100 border-slate-300 text-slate-700"
                      )}>
                        {output}
                      </div>
                    ) : (
                      <span className="text-slate-300 italic">Run your code to see results...</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Leaderboard Modal */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-slate-300 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-bottom border-slate-300 flex items-center justify-between bg-blue-600/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Leaderboard</h2>
                    <p className="text-slate-500 text-sm">Top 10 ByteXL Debuggers</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <LogOut className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Participant</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {leaderboard.map((entry, idx) => (
                      <tr key={entry.uid} className={cn(
                        "group transition-colors",
                        entry.uid === user.uid ? "bg-blue-600/10" : "hover:bg-slate-100"
                      )}>
                        <td className="px-4 py-4">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                            idx === 0 ? "bg-yellow-500 text-white" :
                              idx === 1 ? "bg-slate-300 text-white" :
                                idx === 2 ? "bg-amber-600 text-white" :
                                  "bg-slate-100 text-slate-500"
                          )}>
                            {idx + 1}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-sm font-bold">{entry.name}</p>
                            <p className="text-[10px] text-slate-500">{entry.studentId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-medium text-slate-600">Team {entry.teamNo}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-lg font-mono font-bold text-blue-600">{entry.score}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-slate-50 border-top border-slate-300 flex justify-center">
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="px-8 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-bold"
                >
                  Back to Challenge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Dashboard Modal */}
      <AnimatePresence>
        {showAdminDashboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white border border-slate-300 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-bottom border-slate-300 flex items-center justify-between bg-blue-600/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Admin Dashboard</h2>
                    <div className="flex gap-4 mt-1">
                      <button
                        onClick={() => setAdminTab('users')}
                        className={cn("text-sm transition-colors", adminTab === 'users' ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-600")}
                      >
                        Participants ({allUsers.length})
                      </button>
                      <button
                        onClick={() => setAdminTab('questions')}
                        className={cn("text-sm transition-colors", adminTab === 'questions' ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-600")}
                      >
                        Manage Questions ({questions.length})
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAdminDashboard(false)}
                  className="w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {adminTab === 'users' ? (
                  <>
                    <table className="w-full">
                      <thead className="sticky top-0 bg-white z-10">
                      <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 border-bottom border-slate-200">
                        <th className="px-4 py-3">Participant</th>
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {allUsers.map((entry) => (
                        <tr key={entry.uid} className="hover:bg-slate-100 transition-colors">
                          <td className="px-4 py-4">
                            <div>
                              <p className="text-sm font-bold">{entry.name}</p>
                              <p className="text-[10px] text-slate-500">{entry.studentId}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs font-medium text-slate-600">Team {entry.teamNo}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                              entry.completed ? "bg-blue-600/10 text-blue-600" : "bg-yellow-500/10 text-yellow-500"
                            )}>
                              {entry.completed ? 'Finished' : 'In Progress'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="text-lg font-mono font-bold text-blue-600">{entry.score}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-4 mt-6 border-t border-slate-200 flex justify-end">
                    <button
                      onClick={async () => {
                        if (window.confirm("Are you SURE you want to reset the leaderboard? This clears all student scores!")) {
                          try {
                            const snapshot = await getDocs(collection(db, 'users'));
                            const resets = snapshot.docs.map(d =>
                              setDoc(doc(db, 'users', d.id), { score: 0, completed: false }, { merge: true })
                            );
                            await Promise.all(resets);
                            alert('✅ Leaderboard reset! All scores cleared.');
                          } catch (err: any) {
                            alert('❌ Reset failed: ' + err.message);
                          }
                        }
                      }}
                      className="px-4 py-2 bg-red-600 text-white font-bold rounded-lg text-sm hover:bg-red-700 transition"
                    >
                      Reset Leaderboard Data
                    </button>
                  </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-sm font-bold text-slate-600 uppercase tracking-widest">Questions List</h3>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!window.confirm('This will upload all 10 default questions to Firestore. Continue?')) return;
                            try {
                              const { QUESTIONS: staticQs } = await import('./questions');
                              for (let i = 0; i < staticQs.length; i++) {
                                const { id: _id, ...rest } = staticQs[i] as any;
                                await addDoc(collection(db, 'questions'), { ...rest, id: i + 1 });
                              }
                              await fetchQuestions();
                              alert('✅ All 10 questions seeded to Firestore!');
                            } catch (err: any) {
                              alert('❌ Seed failed: ' + err.message);
                            }
                          }}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-100 border border-slate-300 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors"
                        >
                          ☁️ Seed Default Questions
                        </button>
                        <button
                          onClick={() => setEditingQuestion({
                            title: '',
                            description: '',
                            points: 10,
                            language: 'python',
                            buggyCode: { python: '', java: '', c: '', cpp: '' },
                            testCases: [{ input: '', expectedOutput: '' }]
                          })}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Add Question
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {questions.map((q) => (
                        <div key={q.id} className="p-4 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-between group hover:border-blue-600/30 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center font-mono font-bold text-slate-300">
                              {q.id}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{q.title}</p>
                              <p className="text-[10px] text-slate-500">{q.points} points • {q.description.substring(0, 60)}...</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingQuestion(q)}
                              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-blue-600 transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-2 hover:bg-slate-200 rounded-lg text-slate-500 hover:text-red-500 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-slate-50 border-top border-slate-300 flex justify-center">
                <button
                  onClick={() => setShowAdminDashboard(false)}
                  className="px-8 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-sm font-bold"
                >
                  Close Dashboard
                </button>
              </div>

              {/* Question Editor Overlay */}
              <AnimatePresence>
                {editingQuestion && (
                  <motion.div
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    className="absolute inset-0 bg-white z-20 flex flex-col"
                  >
                    <form onSubmit={handleSaveQuestion} className="flex flex-col h-full">
                      <div className="p-6 border-bottom border-slate-300 flex items-center justify-between bg-blue-600/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                            <Edit2 className="w-5 h-5 text-white" />
                          </div>
                          <h2 className="text-xl font-bold">{editingQuestion.id ? 'Edit Question' : 'Add New Question'}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingQuestion(null)}
                            className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingQuestion}
                            className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors flex items-center gap-2"
                          >
                            {isSavingQuestion ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Question
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto p-8 space-y-6">
                        <div className="grid grid-cols-4 gap-6">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Title</label>
                            <input
                              required
                              value={editingQuestion.title}
                              onChange={e => setEditingQuestion({ ...editingQuestion, title: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50"
                              placeholder="e.g. 🐍 The Infinite Snake Loop"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Language</label>
                            <select
                              value={editingQuestion.language || 'python'}
                              onChange={e => setEditingQuestion({ ...editingQuestion, language: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50"
                            >
                              <option value="python">Python</option>
                              <option value="java">Java</option>
                              <option value="c">C</option>
                              <option value="cpp">C++</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Points</label>
                            <input
                              required
                              type="number"
                              value={editingQuestion.points}
                              onChange={e => setEditingQuestion({ ...editingQuestion, points: parseInt(e.target.value) })}
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Description</label>
                          <textarea
                            required
                            rows={3}
                            value={editingQuestion.description}
                            onChange={e => setEditingQuestion({ ...editingQuestion, description: e.target.value })}
                            className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-600/50"
                            placeholder="Describe the bug and target behavior..."
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                            <div>
                              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                                <Languages className="w-3 h-3" /> {(editingQuestion.language || 'python').toUpperCase()} Buggy Code
                              </label>
                              <div className="h-48 border border-slate-300 rounded-xl overflow-hidden">
                                <Editor
                                  height="100%"
                                  language={editingQuestion.language === 'cpp' ? 'cpp' : editingQuestion.language === 'c' ? 'c' : editingQuestion.language || 'python'}
                                  theme="light"
                                  value={editingQuestion.buggyCode?.[(editingQuestion.language || 'python') as keyof typeof editingQuestion.buggyCode] || ''}
                                  onChange={v => setEditingQuestion({
                                    ...editingQuestion,
                                    buggyCode: { ...editingQuestion.buggyCode!, [editingQuestion.language || 'python']: v || '' }
                                  } as any)}
                                  options={{ fontSize: 12, minimap: { enabled: false }, padding: { top: 10 } }}
                                />
                              </div>
                            </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Expected Output</label>
                          <div className="h-48 border border-slate-300 rounded-xl overflow-hidden shadow-sm">
                            <Editor
                              height="100%"
                              language="plaintext"
                              theme="light"
                              value={editingQuestion.testCases?.[0]?.expectedOutput || ''}
                              onChange={v => {
                                setEditingQuestion({ 
                                  ...editingQuestion, 
                                  testCases: [{ input: '', expectedOutput: v || '' }] 
                                });
                              }}
                              options={{ fontSize: 13, minimap: { enabled: false }, padding: { top: 16 }, lineHeight: 24 }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-2">
                            The student's code output will be compared against this expected output exactly snippet-by-snippet (ignoring extra whitespaces and newlines).
                          </p>
                        </div>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
