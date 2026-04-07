import { doc, writeBatch, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Note, SyncLedger } from '../types';
import { removeUndefined, computeHash } from '../lib/utils';
import * as dbManager from './dbManager';

export const isFirebaseBackupEnabled = () => {
  return localStorage.getItem('firebaseBackupEnabled') === 'true';
};

export const getBackupInterval = (): number => {
  const intervalStr = localStorage.getItem('firebaseBackupInterval');
  return intervalStr ? parseInt(intervalStr, 10) : 0; // 0 means manual only
};

export const setBackupInterval = (intervalMs: number) => {
  localStorage.setItem('firebaseBackupInterval', intervalMs.toString());
};

export const getLastBackupTime = (): Date | null => {
  const timeStr = localStorage.getItem('lastFirebaseBackupTime');
  return timeStr ? new Date(timeStr) : null;
};

export const backupToFirebase = async (projectId: string): Promise<void> => {
  if (!auth.currentUser || !isFirebaseBackupEnabled()) {
    return;
  }

  try {
    const dirtyNotes = await dbManager.getDirtyNotes();
    const notesToBackup = dirtyNotes.filter(n => n.projectId === projectId);

    if (notesToBackup.length === 0) {
      return; // Nothing to backup
    }

    // We might need multiple batches if we have a lot of dirty notes
    // For simplicity, we'll process in chunks of 100 notes (each note might take 2-3 operations)
    for (let i = 0; i < notesToBackup.length; i += 100) {
      const currentBatch = writeBatch(db);
      const chunk = notesToBackup.slice(i, i + 100);
      
      for (const note of chunk) {
        const noteRef = doc(db, 'notes', note.id);
        const contentRef = doc(db, 'note_contents', note.id);
        const embeddingRef = doc(db, 'note_embeddings', note.id);

        if (note.deleted) {
          currentBatch.delete(noteRef);
          currentBatch.delete(contentRef);
          currentBatch.delete(embeddingRef);
        } else {
          const { parentNoteIds, childNoteIds, relatedNoteIds, embedding, ...metadata } = note;
          const cleanMetadata = removeUndefined({ 
            ...metadata,
            projectId: String(projectId),
            title: String(note.title || ''),
            summary: String(note.summary || ''),
            folder: String(note.folder || '/'),
            noteType: note.noteType || 'Domain',
            status: note.status || 'Planned',
            priority: note.priority || 'C',
            uid: String(auth.currentUser?.uid),
            lastUpdated: typeof note.lastUpdated === 'string' 
              ? note.lastUpdated 
              : new Date().toISOString()
          });

          if ('createdAt' in cleanMetadata) {
            delete cleanMetadata.createdAt;
          }
          if ('isDirty' in cleanMetadata) {
            delete cleanMetadata.isDirty;
          }
          if ('deleted' in cleanMetadata) {
            delete cleanMetadata.deleted;
          }
          
          currentBatch.set(noteRef, cleanMetadata, { merge: true });
          
          currentBatch.set(contentRef, removeUndefined({
            id: note.id,
            body: String(note.body || ''),
            components: note.components,
            flow: note.flow,
            io: note.io
          }), { merge: true });

          if (embedding) {
            currentBatch.set(embeddingRef, removeUndefined({
              id: note.id,
              embedding: embedding,
              embeddingHash: note.embeddingHash,
              embeddingModel: note.embeddingModel,
              lastEmbeddedAt: note.lastEmbeddedAt
            }), { merge: true });
          }
        }
      }
      
      await currentBatch.commit();
    }

    // Mark notes as clean locally
    await dbManager.markNotesClean(notesToBackup.map(n => n.id));
    
    // Update last backup time
    localStorage.setItem('lastFirebaseBackupTime', new Date().toISOString());

  } catch (error: any) {
    console.error('Firebase backup failed:', error);
    if (error.message && (error.message.includes('Quota exceeded') || error.message.includes('resource-exhausted'))) {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw error;
  }
};

// We keep syncNotes as a wrapper that just returns local notes and triggers backup
export const syncNotes = async (projectId: string, onProgress?: (notes: Note[]) => void) => {
  // Trigger backup in background
  backupToFirebase(projectId).catch(console.error);
  
  // Return local notes immediately
  const finalLocalNotes = await dbManager.getAllNotes();
  return finalLocalNotes.filter(n => n.projectId === projectId);
};

export const deleteNoteFromSync = async (noteId: string, projectId: string) => {
  // Delete Local (Soft delete, marks as dirty)
  await dbManager.deleteNote(noteId);
  
  // Trigger background backup
  backupToFirebase(projectId).catch(console.error);
};

export const saveNoteToSync = async (note: Note) => {
  // Calculate hash
  const content = note.body || '';
  const contentHash = await computeHash(content);
  const noteWithHash = { ...note, contentHash };

  // Save Local (marks as dirty)
  await dbManager.saveNote(noteWithHash);
  
  // Trigger background backup
  backupToFirebase(note.projectId).catch(console.error);
};

// --- Sync Ledger Functions ---
export const syncLedger = async (projectId: string, localLedger: SyncLedger | undefined): Promise<SyncLedger | undefined> => {
  if (!auth.currentUser || !isFirebaseBackupEnabled()) {
    return localLedger;
  }

  const ledgerRef = doc(db, 'sync_ledgers', projectId);
  
  try {
    const ledgerSnap = await getDoc(ledgerRef);
    
    if (!ledgerSnap.exists()) {
      if (localLedger) {
        await setDoc(ledgerRef, localLedger);
      }
      return localLedger;
    }
    
    const remoteLedger = ledgerSnap.data() as SyncLedger;
    
    if (!localLedger) {
      await dbManager.saveSyncLedger(remoteLedger);
      return remoteLedger;
    }
    
    const localUpdated = new Date(localLedger.lastSyncedAt);
    const remoteUpdated = new Date(remoteLedger.lastSyncedAt);
    
    if (localUpdated > remoteUpdated) {
      await setDoc(ledgerRef, localLedger);
      return localLedger;
    } else if (remoteUpdated > localUpdated) {
      await dbManager.saveSyncLedger(remoteLedger);
      return remoteLedger;
    }
    
    return localLedger;
  } catch (error) {
    console.error("Firebase ledger sync failed:", error);
    return localLedger;
  }
};

export const saveLedgerToFirebase = async (ledger: SyncLedger) => {
  if (!auth.currentUser || !isFirebaseBackupEnabled()) return;
  try {
    const ledgerRef = doc(db, 'sync_ledgers', ledger.projectId);
    await setDoc(ledgerRef, ledger);
  } catch (error) {
    console.error("Failed to save ledger to Firebase:", error);
  }
};
