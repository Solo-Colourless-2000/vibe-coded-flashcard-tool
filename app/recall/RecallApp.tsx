"use client";

import { useState } from "react";
import { seedSets, type StudySet } from "../model";
import { useNotifications } from "./shared/useNotifications";
import { useStudyStorage } from "./storage/useStudyStorage";
import { useAppNavigation } from "./navigation/useAppNavigation";
import { useSetLibrary } from "./library/useSetLibrary";
import { useSetEditor } from "./editor/useSetEditor";
import { useStudySession } from "./study/useStudySession";
import { useFlashcards } from "./flashcards/useFlashcards";
import type { SetActions } from "./types";
import { LoadingScreen } from "./shared/LoadingScreen";
import { AppSidebar } from "./shell/AppSidebar";
import { DashboardView } from "./library/DashboardView";
import { LibraryView } from "./library/LibraryView";
import { EditorView } from "./editor/EditorView";
import { StudyView } from "./study/StudyView";
import { FlashcardsView } from "./flashcards/FlashcardsView";
import ImportDialog from "../ImportDialog";
import { StorageDialog } from "./storage/StorageDialog";
import { BackupRestoreDialog } from "./storage/BackupRestoreDialog";
import { DeleteSetDialog } from "./library/DeleteSetDialog";
import { Toast } from "./shared/Toast";

export default function RecallApp() {
  const [activeSetId, setActiveSetId] = useState(seedSets[0].id);
  const { toast, setToast } = useNotifications();
  const storage = useStudyStorage({ setToast, setActiveSetId, onBackupRestored: handleBackupRestored });
  const { sets, setSets, hydrated, explicitSaveInProgress } = storage;
  const { view, goTo, openHome, openSets } = useAppNavigation(hydrated, clearTransientState);
  const library = useSetLibrary({
    sets, setSets, activeSetId, setActiveSetId,
    explicitSaveInProgress, persistDeletion: storage.persistDeletion, goTo, setToast
  });
  const editor = useSetEditor({
    sets, setSets, hydrated, view, setActiveSetId,
    explicitSaveInProgress, persistSetsForExplicitAction: storage.persistSetsForExplicitAction,
    goTo, setToast, onStudyReady: () => study.resetSession()
  });
  const study = useStudySession({
    sets, setSets, activeSetId, setActiveSetId, view, goTo,
    modalOpen:
      storage.storageDialogOpen ||
      library.deleteTarget !== null ||
      editor.importOpen ||
      storage.backupRestoreCandidate !== null,
  });
  const flashcards = useFlashcards({ sets, activeSetId, setActiveSetId, goTo });
  const activeSet = sets.find((set) => set.id === activeSetId) ?? sets[0];
  const actions: SetActions = {
    startNewSet: editor.startNewSet,
    startImportingSet: editor.startImportingSet,
    editSet: editor.editSet,
    openStudy: study.openStudy,
    openFlashcards: flashcards.openFlashcards,
    openSets,
  };

  function clearTransientState(fromHistory: boolean) {
    editor.clearEditorError();
    study.clearStudyMessage();
    if (fromHistory) {
      editor.setImportOpen(false);
      storage.setStorageDialogOpen(false);
      library.setDeleteTarget(null);
      storage.setBackupRestoreCandidate(null);
    }
  }

  function handleBackupRestored(restoredSets: StudySet[]) {
    study.resetSession();
    flashcards.resetFlashcards();
    editor.resetDraft();
    goTo(restoredSets.length > 0 ? "sets" : "home");
  }

  if (!hydrated) {
    return <LoadingScreen />;
  }

  return (
    <main className="app-shell">
      <AppSidebar
        view={view}
        openHome={openHome}
        actions={actions}
        storage={storage}
      />
      <section className={"content view-" + view}>
        {view === "home" && (
          <DashboardView
            sets={sets}
            totalCards={library.totalCards}
            averageScore={library.averageScore}
            actions={actions}
          />
        )}
        {view === "sets" && (
          <LibraryView library={library} actions={actions} />
        )}
        {view === "editor" && (
          <EditorView
            editor={editor}
            explicitSaveInProgress={explicitSaveInProgress}
            openSets={openSets}
          />
        )}
        {view === "study" && (
          <StudyView activeSet={activeSet} study={study} openSets={openSets} />
        )}
        {view === "flashcards" && (
          <FlashcardsView
            activeSet={activeSet}
            flashcards={flashcards}
            openSets={openSets}
            openStudy={study.openStudy}
          />
        )}
      </section>
      {editor.importOpen && (
        <ImportDialog
          existingCards={editor.draft.cards}
          onClose={() => editor.setImportOpen(false)}
          onImport={editor.importCards}
          open
        />
      )}
      <StorageDialog storage={storage} />
      <BackupRestoreDialog storage={storage} />
      <DeleteSetDialog library={library} explicitSaveInProgress={explicitSaveInProgress} />
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </main>
  );
}
