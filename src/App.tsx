import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CoFounderProvider } from './contexts/CoFounderContext';
import { signInWithGoogle, logout } from './firebase';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './components/NoteEditor';
import { GitHubSync } from './components/GitHubSync';
import { DashboardView } from './components/DashboardView';
import { 
  LogOut, 
  PanelLeftClose, 
  PanelLeftOpen, 
  PanelRightClose, 
  PanelRightOpen, 
  Moon, 
  Sun,
  Github,
  FolderGit2,
  Folder,
  Layers,
  LayoutDashboard,
  FileEdit,
  Settings,
  X,
  Cloud,
  CloudOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Note, OperationType, LensType } from './types';
import * as dbManager from './services/dbManager';
import { syncNotes, isFirebaseBackupEnabled } from './services/syncManager';

function MainApp() {
  const { user, loading: authLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isLeftOpen, setIsLeftOpen] = useState(false);
  const [isRightOpen, setIsRightOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'editor' | 'dashboard'>('dashboard');
  const [activeLens, setActiveLens] = useState<LensType>('Feature');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [firebaseBackup, setFirebaseBackup] = useState(isFirebaseBackupEnabled());

  const toggleLeftSidebar = (open: boolean) => {
    setIsLeftOpen(open);
    if (open && typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsRightOpen(false);
    }
  };

  const toggleRightSidebar = (open: boolean) => {
    setIsRightOpen(open);
    if (open && typeof window !== 'undefined' && window.innerWidth < 640) {
      setIsLeftOpen(false);
    }
  };

  const [projectNotes, setProjectNotes] = useState<Note[]>([]);
  const [leftWidth, setLeftWidth] = useState(256); // Default w-64
  const [rightWidth, setRightWidth] = useState(384); // Default w-96
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') as 'light' | 'dark' || 'dark';
    }
    return 'dark';
  });

  const handleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signInWithGoogle();
    } finally {
      setIsSigningIn(false);
    }
  };

  const loadNotes = async () => {
    if (!selectedProjectId) {
      setProjectNotes([]);
      return;
    }
    const allNotes = await dbManager.getAllNotes();
    const filteredNotes = allNotes.filter(n => n.projectId === selectedProjectId);
    setProjectNotes(filteredNotes);
  };

  useEffect(() => {
    loadNotes();

    if (user && selectedProjectId && firebaseBackup) {
      // Trigger background sync
      syncNotes(selectedProjectId, (updatedNotes) => {
        setProjectNotes(updatedNotes);
      }).catch(err => {
        console.error("Background sync failed:", err);
      });
    }
  }, [user, selectedProjectId, firebaseBackup]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = e.clientX;
        if (newWidth > 160 && newWidth < 480) {
          setLeftWidth(newWidth);
        }
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 240 && newWidth < 600) {
          setRightWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = 'default';
    };

    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const toggleFirebaseBackup = () => {
    const newVal = !firebaseBackup;
    setFirebaseBackup(newVal);
    localStorage.setItem('firebaseBackupEnabled', String(newVal));
  };

  if (authLoading) {
    return <div className="h-screen flex items-center justify-center bg-background text-foreground">Loading...</div>;
  }

  return (
    <div className="flex h-screen bg-background text-foreground font-sans selection:bg-primary/30 selection:text-primary-foreground">
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings size={20} className="text-primary" />
                  Settings
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Data & Sync</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-xl border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${firebaseBackup ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {firebaseBackup ? <Cloud size={20} /> : <CloudOff size={20} />}
                      </div>
                      <div>
                        <p className="font-medium">Firebase Backup</p>
                        <p className="text-xs text-muted-foreground">Sync data to cloud</p>
                      </div>
                    </div>
                    <button
                      onClick={toggleFirebaseBackup}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${firebaseBackup ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${firebaseBackup ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  
                  {!user && firebaseBackup && (
                    <p className="text-xs text-amber-500 bg-amber-500/10 p-3 rounded-lg border border-amber-500/20">
                      You need to sign in to use Firebase Backup.
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Left Sidebar */}
      <motion.div 
        animate={{ width: isLeftOpen ? (typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : leftWidth) : 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-16 bottom-0 left-0 sm:relative sm:top-0 flex border-r border-border bg-secondary/30 group/sidebar z-40 shadow-2xl sm:shadow-none overflow-hidden"
      >
        <div style={{ width: typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : leftWidth }} className="h-full flex flex-col">
          <Sidebar 
            onSelectNote={(id) => {
              setSelectedNoteId(id);
              if (window.innerWidth < 640) toggleLeftSidebar(false);
            }} 
            selectedNoteId={selectedNoteId} 
            onClose={() => toggleLeftSidebar(false)} 
            selectedProjectId={selectedProjectId}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
            }}
            onNotesChanged={loadNotes}
            notes={projectNotes}
            activeLens={activeLens}
            setActiveLens={setActiveLens}
          />
          {/* Left Resizer Handle */}
          <div 
            className="hidden sm:flex absolute top-0 -right-1 w-2 h-full cursor-col-resize hover:bg-primary/40 transition-colors z-50 items-center justify-center"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingLeft(true);
            }}
          >
            <div className={`w-[1px] h-full ${isResizingLeft ? 'bg-primary' : 'bg-transparent'}`} />
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 sticky top-0 z-50">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Sidebar Toggle */}
            <button 
              onClick={() => toggleLeftSidebar(!isLeftOpen)}
              className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-all active:scale-95"
            >
              {isLeftOpen ? <PanelLeftClose size={20} className="text-primary" /> : <PanelLeftOpen size={20} />}
            </button>

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="hidden xs:block">
                <h1 className="text-sm sm:text-lg font-black tracking-tighter uppercase italic leading-none">Composer</h1>
                <span className="text-[8px] sm:text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">System Engine</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-3 sm:pr-4">
              {/* View Mode Toggle */}
              <div className="hidden sm:flex items-center bg-muted/50 p-1 rounded-xl border border-border">
                <button
                  onClick={() => setViewMode('dashboard')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'dashboard' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <LayoutDashboard size={16} />
                  Dashboard
                </button>
                <button
                  onClick={() => setViewMode('editor')}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${viewMode === 'editor' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <FileEdit size={16} />
                  Editor
                </button>
              </div>

              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-all active:scale-95"
                title="Settings"
              >
                <Settings size={18} />
              </button>

              <button 
                onClick={toggleTheme}
                className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-all active:scale-95 hidden sm:flex"
                title={theme === 'light' ? 'Switch to Dark' : 'Switch to Light'}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              
              {user ? (
                <>
                  <div className="flex items-center gap-2 sm:gap-3 px-1 sm:px-2 py-1.5 hover:bg-muted rounded-2xl transition-all cursor-pointer group">
                    <img 
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} 
                      alt="Profile" 
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl border-2 border-border group-hover:border-primary transition-all shadow-md"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-right hidden lg:block">
                      <p className="text-xs font-bold leading-none group-hover:text-primary transition-colors">{user.displayName || 'Developer'}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{user.email}</p>
                    </div>
                  </div>
                  <button onClick={logout} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition-all active:scale-95" title="Sign out">
                    <LogOut size={18} />
                  </button>
                </>
              ) : (
                <button 
                  onClick={handleSignIn}
                  disabled={isSigningIn}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:opacity-90 transition-all active:scale-95"
                >
                  {isSigningIn ? '...' : 'Sign In'}
                </button>
              )}
              
              <button 
                onClick={() => toggleRightSidebar(!isRightOpen)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-xl transition-all active:scale-95"
              >
                {isRightOpen ? <PanelRightClose size={20} className="text-primary" /> : <PanelRightOpen size={20} />}
              </button>
            </div>
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-0 sm:p-8 lg:p-12 bg-muted/5 relative">
          <div className={`${viewMode === 'dashboard' ? 'max-w-none' : 'max-w-6xl'} mx-auto w-full h-full`}>
            <AnimatePresence mode="wait">
              <motion.div 
                key={viewMode === 'dashboard' ? 'dashboard' : 'editor'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="h-full"
              >
                {selectedProjectId ? (
                  viewMode === 'dashboard' ? (
                    <DashboardView 
                      projectId={selectedProjectId}
                      notes={projectNotes} 
                      onSelectNote={(id) => {
                        setSelectedNoteId(id);
                        setViewMode('editor');
                      }} 
                      onNotesChanged={loadNotes}
                      activeLens={activeLens}
                      setActiveLens={setActiveLens}
                    />
                  ) : (
                    <NoteEditor 
                      noteId={selectedNoteId} 
                      projectId={selectedProjectId}
                      onSaved={loadNotes}
                      onDeleted={() => {
                        setSelectedNoteId(null);
                        loadNotes();
                      }}
                    />
                  )
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto">
                    <div className="w-24 h-24 bg-muted rounded-[2.5rem] flex items-center justify-center mb-8 text-muted-foreground/30 shadow-inner">
                      <FolderGit2 size={40} />
                    </div>
                    <h2 className="text-2xl font-bold mb-3 tracking-tight">Initialize Workspace</h2>
                    <p className="text-muted-foreground mb-8 leading-relaxed">Select an existing project from the explorer or create a new one to begin architecting your system.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Right Sidebar */}
      <motion.div 
        animate={{ width: isRightOpen ? (typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : rightWidth) : 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-16 bottom-0 right-0 sm:relative sm:top-0 flex border-l border-border bg-secondary/30 group/sidebar z-40 shadow-2xl sm:shadow-none overflow-hidden"
      >
        <div style={{ width: typeof window !== 'undefined' && window.innerWidth < 640 ? '100%' : rightWidth }} className="h-full flex flex-col">
          <GitHubSync 
            onClose={() => toggleRightSidebar(false)} 
            projectId={selectedProjectId} 
            onSyncComplete={() => {
              loadNotes();
              if (selectedProjectId) {
                syncNotes(selectedProjectId).then(() => loadNotes());
              }
            }} 
            activeLens={activeLens}
            setActiveLens={setActiveLens}
          />
          {/* Right Resizer Handle */}
          <div 
            className="hidden sm:flex absolute top-0 -left-1 w-2 h-full cursor-col-resize hover:bg-primary/40 transition-colors z-50 items-center justify-center"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingRight(true);
            }}
          >
            <div className={`w-[1px] h-full ${isResizingRight ? 'bg-primary' : 'bg-transparent'}`} />
          </div>
        </div>
      </motion.div>

    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CoFounderProvider>
        <MainApp />
      </CoFounderProvider>
    </AuthProvider>
  );
}
