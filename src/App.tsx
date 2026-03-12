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

  const isAdminUser = user?.email === 'karunakar.pothuganti@gmail.com' || (IS_OFFLINE && user?.uid === 'off_ADMIN001');

  // Fetch questions
  const fetchQuestions = useCallback(async () => {
    try {
      if (IS_OFFLINE) {
        const res = await fetch(`${LOCAL_API_URL}/questions`);
        const data = await res.json();
        setQuestions(data);
      } else {
        // Fallback to static for now if not using firebase/firestore for questions
        setQuestions(QUESTIONS);
      }
    } catch (error) {
      console.error('Failed to fetch questions:', error);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  // Auth listener
  useEffect(() => {
    if (IS_OFFLINE) {
      // Check for persisted session in offline mode
      const savedUser = localStorage.getItem('offline_user');
      if (savedUser) {
        const u = JSON.parse(savedUser);
        setUser(u);
        fetch(`${LOCAL_API_URL}/users/${u.uid}`)
          .then(res => res.json())
          .then(data => {
            if (data) {
              setUserData({ ...data, completed: !!data.completed });
            }
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
      return;
    }
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data() as UserData);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Leaderboard listener
  useEffect(() => {
    if (!user) return;
    if (IS_OFFLINE) {
      const fetchLeaderboard = () => {
        fetch(`${LOCAL_API_URL}/leaderboard`)
          .then(res => res.json())
          .then(data => setLeaderboard(data));
      };
      fetchLeaderboard();
      const interval = setInterval(fetchLeaderboard, 5000);
      return () => clearInterval(interval);
    }
    const path = 'users';
    const q = query(collection(db, path), orderBy('score', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as UserData);
      setLeaderboard(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return unsubscribe;
  }, [user]);

  // Admin: All users listener
  useEffect(() => {
    if (isAdminUser && user) {
      const path = 'users';
      const q = query(collection(db, path), orderBy('lastActive', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => doc.data() as UserData);
        setAllUsers(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      });
      return unsubscribe;
    }
  }, [isAdminUser, user]);

  // Timer logic
  useEffect(() => {
    if (userData && !userData.completed) {
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
      if (IS_OFFLINE) {
        localStorage.removeItem('offline_user');
      } else {
        await logOut();
      }
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
    try {
      if (IS_OFFLINE) {
        // Create a predictable UID from Student ID for the competition environment
        const uid = `off_${loginForm.studentId}`;
        const userObj = { uid, email: `${loginForm.studentId}@offline.local`, displayName: loginForm.name };

        const newUserData: UserData = {
          uid,
          name: loginForm.name,
          studentId: loginForm.studentId,
          teamNo: loginForm.teamNo,
          score: 0,
          startTime: new Date().toISOString(),
          completed: false,
          lastActive: new Date().toISOString(),
        };

        // Check if user exists first to resume state
        const existingRes = await fetch(`${LOCAL_API_URL}/users/${uid}`);
        const existingData = await existingRes.json();

        if (existingData) {
          console.log('Resuming existing session:', existingData);
          setUserData({ ...existingData, completed: !!existingData.completed });
        } else {
          console.log('Creating new session:', newUserData);
          await fetch(`${LOCAL_API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newUserData)
          });
          setUserData(newUserData);
        }

        setUser(userObj);
        localStorage.setItem('offline_user', JSON.stringify(userObj));
        return;
      }
      const u = await signIn();
      const userDocRef = doc(db, 'users', u.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        const newUserData: UserData = {
          uid: u.uid,
          name: loginForm.name,
          studentId: loginForm.studentId,
          teamNo: loginForm.teamNo,
          score: 0,
          startTime: new Date().toISOString(),
          completed: false,
          lastActive: new Date().toISOString(),
        };
        await setDoc(userDocRef, newUserData);
        setUserData(newUserData);
      } else {
        setUserData(userDoc.data() as UserData);
      }
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;
    setIsSavingQuestion(true);
    try {
      const method = editingQuestion.id ? 'PUT' : 'POST';
      const url = editingQuestion.id
        ? `${LOCAL_API_URL}/questions/${editingQuestion.id}`
        : `${LOCAL_API_URL}/questions`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingQuestion)
      });

      if (res.ok) {
        await fetchQuestions();
        setEditingQuestion(null);
      }
    } catch (error) {
      console.error('Failed to save question:', error);
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this question?')) return;
    try {
      const res = await fetch(`${LOCAL_API_URL}/questions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchQuestions();
      }
    } catch (error) {
      console.error('Failed to delete question:', error);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];

  useEffect(() => {
    if (currentQuestion) {
      setCode(currentQuestion.buggyCode[language as keyof typeof currentQuestion.buggyCode] || '');
    }
  }, [currentQuestionIndex, language]);

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

        // Update score if not already completed
        if (userData && !userData.completed) {
          const newScore = userData.score + currentQuestion.points;
          if (IS_OFFLINE) {
            await fetch(`${LOCAL_API_URL}/users`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...userData, score: newScore, lastActive: new Date().toISOString() })
            });
          } else {
            const userDocRef = doc(db, 'users', userData.uid);
            await setDoc(userDocRef, { ...userData, score: newScore }, { merge: true });
          }
          setUserData(prev => prev ? { ...prev, score: newScore } : null);

          // Move to next question or finish
          if (currentQuestionIndex < questions.length - 1) {
            setTimeout(() => {
              setShowLeaderboard(true);
              setCurrentQuestionIndex(prev => prev + 1);
              setOutput('');
            }, 2000);
          } else {
            setTimeout(() => {
              handleFinishChallenge();
            }, 2000);
          }
        }
      } else {
        setOutput(prev => prev + '\n\n❌ INCORRECT. Try again!');
      }

      // Log submission
      if (user) {
        if (IS_OFFLINE) {
          await fetch(`${LOCAL_API_URL}/submissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.uid,
              questionId: currentQuestion.id,
              code,
              language,
              status: isCorrect ? 'correct' : 'incorrect',
              timestamp: new Date().toISOString()
            })
          });
        } else {
          const path = 'submissions';
          try {
            await addDoc(collection(db, path), {
              userId: user.uid,
              questionId: currentQuestion.id,
              code,
              language,
              status: isCorrect ? 'correct' : 'incorrect',
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, path);
          }
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
      if (IS_OFFLINE) {
        await fetch(`${LOCAL_API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...userData, completed: true, lastActive: new Date().toISOString() })
        });
      } else {
        const userDocRef = doc(db, 'users', userData.uid);
        await setDoc(userDocRef, { ...userData, completed: true }, { merge: true });
      }
      setUserData(prev => prev ? { ...prev, completed: true } : null);
      setShowLeaderboard(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <img src="/logo.png" alt="ByteXL Logo" className="h-12 w-auto object-contain" />
        </motion.div>
      </div>
    );
  }

  if (!user || !userData) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-[#151619] border border-white/10 rounded-2xl p-8 shadow-2xl"
        >
          {IS_OFFLINE && (
            <div className="absolute top-4 right-4 px-2 py-0.5 border border-emerald-500/20 bg-emerald-500/5 rounded text-[8px] font-bold text-emerald-500/60 uppercase tracking-widest pointer-events-none">
              Local Environment Active
            </div>
          )}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6">
              <img src="/logo.png" alt="ByteXL Logo" className="h-16 w-auto object-contain" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-center">ByteXL Debug Challenge</h1>
            <p className="text-white/50 text-sm mt-2">Professional Coding Arena</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                required
                type="text"
                value={loginForm.name}
                onChange={e => setLoginForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="Enter your name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5">Student ID</label>
              <input
                required
                type="text"
                value={loginForm.studentId}
                onChange={e => setLoginForm(prev => ({ ...prev, studentId: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="ID Number"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/40 uppercase tracking-wider mb-1.5">Team Number</label>
              <input
                required
                type="text"
                value={loginForm.teamNo}
                onChange={e => setLoginForm(prev => ({ ...prev, teamNo: e.target.value }))}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
                placeholder="Team #"
              />
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 mt-4"
            >
              {isLoggingIn ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>Start Challenge <ChevronRight className="w-5 h-5" /></>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-white/30 mt-6">
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="h-16 border-bottom border-white/10 bg-[#151619] flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="ByteXL Logo" className="h-8 w-auto object-contain" />
          <div>
            <h1 className="font-bold text-sm tracking-tight">ByteXL Debug Challenge</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Live Editor</p>
              {IS_OFFLINE && (
                <span className="text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">LOCAL</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded-full border border-white/5">
            <Timer className={cn("w-4 h-4", timeLeft < 60 ? "text-red-500 animate-pulse" : "text-emerald-500")} />
            <span className={cn("font-mono text-sm font-bold", timeLeft < 60 ? "text-red-500" : "text-white")}>
              {formatTime(timeLeft)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {isAdminUser && (
              <button
                onClick={() => setShowAdminDashboard(true)}
                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold transition-colors"
              >
                Admin
              </button>
            )}
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold">{userData.name}</p>
              <p className="text-[10px] text-white/40">Team {userData.teamNo}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 transition-all group"
              title="Logout"
            >
              <LogOut className="w-5 h-5 text-white/60 group-hover:text-red-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar - Questions List */}
        <aside className="w-80 border-right border-white/10 bg-[#0a0a0a] hidden lg:flex flex-col">
          <div className="p-6 border-bottom border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-white/40">Questions</h2>
              <span className="text-xs font-bold text-emerald-500">{currentQuestionIndex + 1}/{questions.length}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500"
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
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : "bg-transparent border-transparent hover:bg-white/5 text-white/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold",
                    idx === currentQuestionIndex ? "bg-emerald-500 text-black" : "bg-white/10 text-white/40"
                  )}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium truncate">{q.title}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="p-4 border-top border-white/10">
            <button
              onClick={() => setShowLeaderboard(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-bold"
            >
              <Trophy className="w-4 h-4 text-yellow-500" /> Leaderboard
            </button>
          </div>
        </aside>

        {/* Main Content - Editor */}
        <div className="flex-1 flex flex-col min-w-0">
          {userData.completed ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-md w-full text-center space-y-6"
              >
                <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto">
                  <Trophy className="w-12 h-12 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold">Challenge Completed!</h2>
                  <p className="text-white/50 mt-2">You've finished the ByteXL Debug Challenge. Check your final rank on the leaderboard.</p>
                </div>
                <div className="bg-[#151619] border border-white/10 rounded-2xl p-6">
                  <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Final Score</p>
                  <p className="text-5xl font-bold text-emerald-500">{userData.score}</p>
                </div>
                <button
                  onClick={() => setShowLeaderboard(true)}
                  className="w-full py-4 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-600 transition-colors"
                >
                  View Leaderboard
                </button>
              </motion.div>
            </div>
          ) : (
            <>
              {/* Question Header */}
              <div className="p-6 bg-[#151619] border-bottom border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold">{currentQuestion.title}</h2>
                    <p className="text-white/60 mt-1 text-sm">{currentQuestion.description}</p>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
                    <Trophy className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold text-emerald-500">{currentQuestion.points} pts</span>
                  </div>
                </div>
              </div>

              {/* Editor Toolbar */}
              <div className="h-12 bg-[#0a0a0a] border-bottom border-white/10 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  {['python', 'java', 'c', 'cpp'].map(lang => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={cn(
                        "px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                        language === lang ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleRunCode}
                    disabled={isCompiling}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-black text-xs font-bold transition-all"
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
                <div className="flex-1 border-right border-white/10 relative">
                  <Editor
                    height="100%"
                    language={language === 'cpp' ? 'cpp' : language === 'c' ? 'c' : language}
                    theme="vs-dark"
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
                <div className="w-full lg:w-96 bg-[#0a0a0a] flex flex-col">
                  <div className="h-10 border-bottom border-white/10 flex items-center px-4 bg-[#151619]">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Console Output</span>
                  </div>
                  <div className="flex-1 p-4 font-mono text-xs overflow-y-auto whitespace-pre-wrap">
                    {output ? (
                      <div className={cn(
                        "p-3 rounded-lg border",
                        output.includes('✅') ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                          output.includes('❌') ? "bg-red-500/10 border-red-500/20 text-red-400" :
                            "bg-white/5 border-white/10 text-white/80"
                      )}>
                        {output}
                      </div>
                    ) : (
                      <span className="text-white/20 italic">Run your code to see results...</span>
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
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#151619] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8 border-bottom border-white/10 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Leaderboard</h2>
                    <p className="text-white/40 text-sm">Top 10 ByteXL Debuggers</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors"
                >
                  <LogOut className="w-5 h-5 text-white/40" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30">
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Participant</th>
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-right">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {leaderboard.map((entry, idx) => (
                      <tr key={entry.uid} className={cn(
                        "group transition-colors",
                        entry.uid === user.uid ? "bg-emerald-500/10" : "hover:bg-white/5"
                      )}>
                        <td className="px-4 py-4">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm",
                            idx === 0 ? "bg-yellow-500 text-black" :
                              idx === 1 ? "bg-slate-300 text-black" :
                                idx === 2 ? "bg-amber-600 text-black" :
                                  "bg-white/5 text-white/40"
                          )}>
                            {idx + 1}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-sm font-bold">{entry.name}</p>
                            <p className="text-[10px] text-white/40">{entry.studentId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-xs font-medium text-white/60">Team {entry.teamNo}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="text-lg font-mono font-bold text-emerald-500">{entry.score}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-6 bg-black/40 border-top border-white/10 flex justify-center">
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-bold"
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
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#151619] border border-white/10 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-bottom border-white/10 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
                    <Terminal className="w-6 h-6 text-black" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Admin Dashboard</h2>
                    <div className="flex gap-4 mt-1">
                      <button
                        onClick={() => setAdminTab('users')}
                        className={cn("text-sm transition-colors", adminTab === 'users' ? "text-emerald-500 font-bold" : "text-white/40 hover:text-white/60")}
                      >
                        Participants ({allUsers.length})
                      </button>
                      <button
                        onClick={() => setAdminTab('questions')}
                        className={cn("text-sm transition-colors", adminTab === 'questions' ? "text-emerald-500 font-bold" : "text-white/40 hover:text-white/60")}
                      >
                        Manage Questions ({questions.length})
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowAdminDashboard(false)}
                  className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center transition-colors"
                >
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-4">
                {adminTab === 'users' ? (
                  <table className="w-full">
                    <thead className="sticky top-0 bg-[#151619] z-10">
                      <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-white/30 border-bottom border-white/5">
                        <th className="px-4 py-3">Participant</th>
                        <th className="px-4 py-3">Team</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {allUsers.map((entry) => (
                        <tr key={entry.uid} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-4">
                            <div>
                              <p className="text-sm font-bold">{entry.name}</p>
                              <p className="text-[10px] text-white/40">{entry.studentId}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <span className="text-xs font-medium text-white/60">Team {entry.teamNo}</span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md",
                              entry.completed ? "bg-emerald-500/10 text-emerald-500" : "bg-yellow-500/10 text-yellow-500"
                            )}>
                              {entry.completed ? 'Finished' : 'In Progress'}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="text-lg font-mono font-bold text-emerald-500">{entry.score}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center px-4">
                      <h3 className="text-sm font-bold text-white/60 uppercase tracking-widest">Questions List</h3>
                      <button
                        onClick={() => setEditingQuestion({
                          title: '',
                          description: '',
                          points: 10,
                          buggyCode: { python: '', java: '', c: '', cpp: '' },
                          testCases: [{ input: '', expectedOutput: '' }]
                        })}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black rounded-lg text-xs font-bold hover:bg-emerald-600 transition-colors"
                      >
                        <Plus className="w-4 h-4" /> Add Question
                      </button>
                    </div>

                    <div className="space-y-2">
                      {questions.map((q) => (
                        <div key={q.id} className="p-4 bg-black/20 border border-white/5 rounded-xl flex items-center justify-between group hover:border-emerald-500/30 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center font-mono font-bold text-white/20">
                              {q.id}
                            </div>
                            <div>
                              <p className="text-sm font-bold">{q.title}</p>
                              <p className="text-[10px] text-white/40">{q.points} points • {q.description.substring(0, 60)}...</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingQuestion(q)}
                              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-emerald-500 transition-all"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(q.id)}
                              className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-red-500 transition-all"
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

              <div className="p-6 bg-black/40 border-top border-white/10 flex justify-center">
                <button
                  onClick={() => setShowAdminDashboard(false)}
                  className="px-8 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-sm font-bold"
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
                    className="absolute inset-0 bg-[#151619] z-20 flex flex-col"
                  >
                    <form onSubmit={handleSaveQuestion} className="flex flex-col h-full">
                      <div className="p-6 border-bottom border-white/10 flex items-center justify-between bg-emerald-500/5">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                            <Edit2 className="w-5 h-5 text-black" />
                          </div>
                          <h2 className="text-xl font-bold">{editingQuestion.id ? 'Edit Question' : 'Add New Question'}</h2>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingQuestion(null)}
                            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-bold transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isSavingQuestion}
                            className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold transition-colors flex items-center gap-2"
                          >
                            {isSavingQuestion ? <div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            Save Question
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-auto p-8 space-y-6">
                        <div className="grid grid-cols-3 gap-6">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Title</label>
                            <input
                              required
                              value={editingQuestion.title}
                              onChange={e => setEditingQuestion({ ...editingQuestion, title: e.target.value })}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                              placeholder="e.g. 🐍 The Infinite Snake Loop"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Points</label>
                            <input
                              required
                              type="number"
                              value={editingQuestion.points}
                              onChange={e => setEditingQuestion({ ...editingQuestion, points: parseInt(e.target.value) })}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Description</label>
                          <textarea
                            required
                            rows={3}
                            value={editingQuestion.description}
                            onChange={e => setEditingQuestion({ ...editingQuestion, description: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500/50"
                            placeholder="Describe the bug and target behavior..."
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          {['python', 'java', 'c', 'cpp'].map((lang) => (
                            <div key={lang}>
                              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">
                                <Languages className="w-3 h-3" /> {lang} Buggy Code
                              </label>
                              <div className="h-48 border border-white/10 rounded-xl overflow-hidden">
                                <Editor
                                  height="100%"
                                  language={lang === 'cpp' ? 'cpp' : lang === 'c' ? 'c' : lang}
                                  theme="vs-dark"
                                  value={editingQuestion.buggyCode?.[lang as keyof typeof editingQuestion.buggyCode] || ''}
                                  onChange={v => setEditingQuestion({
                                    ...editingQuestion,
                                    buggyCode: { ...editingQuestion.buggyCode!, [lang]: v || '' }
                                  } as any)}
                                  options={{ fontSize: 12, minimap: { enabled: false }, padding: { top: 10 } }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2">Test Cases</label>
                          <div className="space-y-3">
                            {editingQuestion.testCases?.map((tc, tcIdx) => (
                              <div key={tcIdx} className="grid grid-cols-2 gap-4 bg-black/20 p-4 rounded-xl relative group">
                                <div>
                                  <label className="block text-[8px] font-bold uppercase tracking-widest text-white/20 mb-1">Input</label>
                                  <input
                                    value={tc.input}
                                    onChange={e => {
                                      const newTcs = [...editingQuestion.testCases!];
                                      newTcs[tcIdx].input = e.target.value;
                                      setEditingQuestion({ ...editingQuestion, testCases: newTcs });
                                    }}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500/50"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[8px] font-bold uppercase tracking-widest text-white/20 mb-1">Expected Output</label>
                                  <input
                                    required
                                    value={tc.expectedOutput}
                                    onChange={e => {
                                      const newTcs = [...editingQuestion.testCases!];
                                      newTcs[tcIdx].expectedOutput = e.target.value;
                                      setEditingQuestion({ ...editingQuestion, testCases: newTcs });
                                    }}
                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500/50"
                                  />
                                </div>
                                {tcIdx > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const newTcs = editingQuestion.testCases!.filter((_, i) => i !== tcIdx);
                                      setEditingQuestion({ ...editingQuestion, testCases: newTcs });
                                    }}
                                    className="absolute -right-2 -top-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setEditingQuestion({
                                ...editingQuestion,
                                testCases: [...editingQuestion.testCases!, { input: '', expectedOutput: '' }]
                              })}
                              className="text-[10px] text-emerald-500 font-bold hover:underline"
                            >
                              + Add Test Case
                            </button>
                          </div>
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
