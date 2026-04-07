import { collection, query, where, getDocs, doc, writeBatch, getDoc, setDoc, runTransaction, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Note, SyncLedger, OperationType } from '../types';
import { computeHash, handleFirestoreError, removeUndefined } from '../lib/utils';
import * as dbManager from './dbManager';

export const syncNotes = async (projectId: string, onProgress?: (notes: Note[]) => void) => {
  if (!auth.currentUser) return;

  const lastSyncedAtKey = `lastSyncedAt_${projectId}`;
  const lastSyncedAtStr = localStorage.getItem(lastSyncedAtKey);
  const lastSyncedAt = lastSyncedAtStr ? new Date(lastSyncedAtStr) : new Date(0);
  const syncStartTime = new Date().toISOString();

  // 1. Fetch Manifest Document from Firestore
  const manifestRef = doc(db, 'sync_manifests', projectId);
  let manifestData: Record<string, string> = {};
  try {
    const manifestSnap = await getDoc(manifestRef);
    if (manifestSnap.exists()) {
      manifestData = manifestSnap.data().fileShaMap || {};
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `sync_manifests/${projectId}`);
  }

  // 2. Get Local Data
  const allLocalNotes = await dbManager.getAllNotes();
  const localNotes = allLocalNotes.filter(n => n.projectId === projectId);

  // 3. Compare
  const toFetch: string[] = [];
  const toUpload: Note[] = [];

  // Find local notes that need uploading
  localNotes.forEach(local => {
    const localUpdated = typeof local.lastUpdated === 'string' ? new Date(local.lastUpdated) : new Date(0);
    if (localUpdated > lastSyncedAt) {
      toUpload.push(local);
    }
  });

  // Find remote notes that need fetching
  Object.entries(manifestData).forEach(([id, value]) => {
    // value could be a hash (old format) or an ISO string (new format)
    const remoteUpdated = new Date(value);
    const isOldFormat = isNaN(remoteUpdated.getTime());
    
    let isNewer = false;
    if (isOldFormat) {
      // Old format: value is a hash. Compare with local hash.
      const localNote = localNotes.find(n => n.id === id);
      if (!localNote || localNote.contentHash !== value) {
        isNewer = true;
      }
    } else {
      isNewer = remoteUpdated > lastSyncedAt;
    }
    
    if (isNewer) {
      // If we are already uploading this note, compare timestamps if possible
      const uploadingNote = toUpload.find(n => n.id === id);
      if (uploadingNote) {
        if (!isOldFormat) {
          const localUpdated = typeof uploadingNote.lastUpdated === 'string' ? new Date(uploadingNote.lastUpdated) : new Date(0);
          if (remoteUpdated > localUpdated) {
            // Remote wins
            toUpload.splice(toUpload.indexOf(uploadingNote), 1);
            toFetch.push(id);
          }
        } else {
          // Old format (hash). If we are uploading it, local wins. Do not fetch.
          // It will be uploaded and the manifest will be updated to the new format.
        }
      } else {
        toFetch.push(id);
      }
    }
  });

  // 4. Upload local notes to Firebase
  if (toUpload.length > 0) {
    for (let i = 0; i < toUpload.length; i += 50) {
      const batch = writeBatch(db);
      const chunk = toUpload.slice(i, i + 50);
      
      for (const note of chunk) {
        const noteRef = doc(db, 'notes', note.id);
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
        
        batch.set(noteRef, cleanMetadata, { merge: true });
        
        // Update Content
        const contentRef = doc(db, 'note_contents', note.id);
        batch.set(contentRef, {
          id: note.id,
          body: String(note.body || ''),
          components: note.components,
          flow: note.flow,
          io: note.io
        }, { merge: true });

        // Update Embedding if present
        if (embedding) {
          const embeddingRef = doc(db, 'note_embeddings', note.id);
          batch.set(embeddingRef, {
            id: note.id,
            embedding: embedding,
            embeddingHash: note.embeddingHash,
            embeddingModel: note.embeddingModel,
            lastEmbeddedAt: note.lastEmbeddedAt
          }, { merge: true });
        }
        
        // Update manifestData locally to be saved later
        manifestData[note.id] = cleanMetadata.lastUpdated;
      }
      
      try {
        await batch.commit();
      } catch (error) {
        console.error('Error uploading batch of notes:', error);
        // Fallback to individual uploads
        for (const note of chunk) {
          const noteRef = doc(db, 'notes', note.id);
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
          
          try {
            await setDoc(noteRef, cleanMetadata, { merge: true });
            
            // Update Content
            const contentRef = doc(db, 'note_contents', note.id);
            await setDoc(contentRef, {
              id: note.id,
              body: String(note.body || ''),
              components: note.components,
              flow: note.flow,
              io: note.io
            }, { merge: true });

            // Update Embedding if present
            if (embedding) {
              const embeddingRef = doc(db, 'note_embeddings', note.id);
              await setDoc(embeddingRef, {
                id: note.id,
                embedding: embedding,
                embeddingHash: note.embeddingHash,
                embeddingModel: note.embeddingModel,
                lastEmbeddedAt: note.lastEmbeddedAt
              }, { merge: true });
            }
            
            manifestData[note.id] = cleanMetadata.lastUpdated;
          } catch (err) {
            console.error('Failed to upload note:', note.id, err);
            handleFirestoreError(err, OperationType.WRITE, 'notes/' + note.id);
          }
        }
      }
    }
    
    // Save updated manifest
    try {
      await setDoc(manifestRef, { fileShaMap: manifestData }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `sync_manifests/${projectId}`);
    }
  }

  // 5. Fetch remote notes
  if (toFetch.length > 0) {
    const fetchedNotes: Note[] = [];
    const BATCH_SIZE = 30;
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const batchIds = toFetch.slice(i, i + BATCH_SIZE);
      const promises = batchIds.map(async (id) => {
        try {
          const [metaSnap, contentSnap, embeddingSnap] = await Promise.all([
            getDoc(doc(db, 'notes', id)),
            getDoc(doc(db, 'note_contents', id)),
            getDoc(doc(db, 'note_embeddings', id))
          ]);
          
          if (metaSnap.exists()) {
            const data = { 
              id: metaSnap.id, 
              ...metaSnap.data(),
              ...(contentSnap.exists() ? contentSnap.data() : {}),
              ...(embeddingSnap.exists() ? embeddingSnap.data() : {})
            } as Note;
            return data;
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `notes/${id}`);
        }
        return null;
      });
      const results = await Promise.all(promises);
      fetchedNotes.push(...results.filter((n): n is Note => n !== null));
    }
    if (fetchedNotes.length > 0) {
      await dbManager.bulkSaveNotes(fetchedNotes);
      if (onProgress) {
        const updatedLocalNotes = await dbManager.getAllNotes();
        onProgress(updatedLocalNotes.filter(n => n.projectId === projectId));
      }
    }
  }

  // 6. Update lastSyncedAt
  localStorage.setItem(lastSyncedAtKey, syncStartTime);

  const finalLocalNotes = await dbManager.getAllNotes();
  return finalLocalNotes.filter(n => n.projectId === projectId);
};

export const deleteNoteFromSync = async (noteId: string, projectId: string) => {
  // Delete Local
  await dbManager.deleteNote(noteId);

  // Delete Remote
  try {
    await Promise.all([
      deleteDoc(doc(db, 'notes', noteId)),
      deleteDoc(doc(db, 'note_contents', noteId)),
      deleteDoc(doc(db, 'note_embeddings', noteId))
    ]);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'notes/' + noteId);
  }

  // Delete from Manifest
  const manifestRef = doc(db, 'sync_manifests', projectId);
  try {
    await runTransaction(db, async (transaction) => {
      const manifestDoc = await transaction.get(manifestRef);
      if (manifestDoc.exists()) {
        const manifestData = manifestDoc.data().fileShaMap || {};
        if (manifestData[noteId]) {
          delete manifestData[noteId];
          transaction.set(manifestRef, { fileShaMap: manifestData }, { merge: false });
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sync_manifests/' + projectId);
  }
};

export const saveNoteToSync = async (note: Note) => {
  // Calculate hash
  const content = note.body || '';
  const contentHash = await computeHash(content);
  const noteWithHash = { ...note, contentHash };

  // Save Local
  await dbManager.saveNote(noteWithHash);

  // Save Remote - Partial Update
  const noteRef = doc(db, 'notes', note.id);
  try {
    const { parentNoteIds, childNoteIds, relatedNoteIds, embedding, ...metadata } = noteWithHash;
    const cleanMetadata = removeUndefined({ 
      ...metadata,
      projectId: String(noteWithHash.projectId),
      title: String(noteWithHash.title || ''),
      summary: String(noteWithHash.summary || ''),
      folder: String(noteWithHash.folder || '/'),
      noteType: noteWithHash.noteType || 'Domain',
      status: noteWithHash.status || 'Planned',
      priority: noteWithHash.priority || 'C',
      uid: String(auth.currentUser?.uid),
      lastUpdated: typeof noteWithHash.lastUpdated === 'string' 
        ? noteWithHash.lastUpdated 
        : new Date().toISOString()
    });

    // Update Metadata
    await setDoc(noteRef, cleanMetadata, { merge: true });

    // Update Content
    const contentRef = doc(db, 'note_contents', note.id);
    await setDoc(contentRef, {
      id: note.id,
      body: String(noteWithHash.body || ''),
      components: noteWithHash.components,
      flow: noteWithHash.flow,
      io: noteWithHash.io
    }, { merge: true });

    // Update Embedding if present
    if (embedding) {
      const embeddingRef = doc(db, 'note_embeddings', note.id);
      await setDoc(embeddingRef, {
        id: note.id,
        embedding: embedding,
        embeddingHash: noteWithHash.embeddingHash,
        embeddingModel: noteWithHash.embeddingModel,
        lastEmbeddedAt: noteWithHash.lastEmbeddedAt
      }, { merge: true });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'notes/' + note.id);
  }
};
