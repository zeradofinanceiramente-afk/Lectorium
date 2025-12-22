
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  Timestamp 
} from "firebase/firestore";
import { db } from "../firebase";
import { Annotation } from "../types";

/**
 * Caminho: users/{uid}/driveFiles/{fileId}/annotations/{annId}
 * Seguindo a estrutura solicitada (sub-coleção "anno")
 */
const getAnnotationRef = (uid: string, fileId: string, annId: string) => {
  return doc(db, "users", uid, "driveFiles", fileId, "anno", annId);
};

const getAnnotationsCollection = (uid: string, fileId: string) => {
  return collection(db, "users", uid, "driveFiles", fileId, "anno");
};

export const syncAnnotationToCloud = async (uid: string, fileId: string, ann: Annotation) => {
  if (uid === 'guest' || !ann.id) return;
  
  const ref = getAnnotationRef(uid, fileId, ann.id);
  await setDoc(ref, {
    ...ann,
    updatedAt: Timestamp.now(),
    serverSync: true
  }, { merge: true });
};

export const deleteAnnotationFromCloud = async (uid: string, fileId: string, annId: string) => {
  if (uid === 'guest') return;
  const ref = getAnnotationRef(uid, fileId, annId);
  await deleteDoc(ref);
};

export const subscribeToAnnotations = (
  uid: string, 
  fileId: string, 
  onUpdate: (annotations: Annotation[]) => void
) => {
  if (uid === 'guest') return () => {};

  const q = query(getAnnotationsCollection(uid, fileId));
  return onSnapshot(q, (snapshot) => {
    const annotations: Annotation[] = [];
    snapshot.forEach((doc) => {
      annotations.push(doc.data() as Annotation);
    });
    onUpdate(annotations);
  }, (error) => {
    console.warn("[Firestore] Sync error:", error);
  });
};
