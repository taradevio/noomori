import { type Href, useRouter } from "expo-router";
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

import { AddRecipeBottomSheet } from "./add-recipe-bottom-sheet";

type AddRecipeAction = {
  openAddRecipe: () => void;
};

const AddRecipeActionContext = createContext<AddRecipeAction | null>(null);

/** Owns the global Add Recipe chooser for every top-level tab. */
export function AddRecipeActionProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const value = useMemo(() => ({ openAddRecipe: () => setIsOpen(true) }), []);

  const openRoute = (route: Href) => {
    setIsOpen(false);
    router.push(route);
  };

  return (
    <AddRecipeActionContext.Provider value={value}>
      {children}
      <AddRecipeBottomSheet
        isOpen={isOpen}
        onDismiss={() => setIsOpen(false)}
        onImportFromText={() => openRoute("/recipe/import-text")}
        onImportFromWebsite={() => openRoute("/recipe/import-url")}
        onWriteFromScratch={() => openRoute("/recipe/new")}
      />
    </AddRecipeActionContext.Provider>
  );
}

export function useAddRecipeAction() {
  const value = useContext(AddRecipeActionContext);
  if (!value) {
    throw new Error(
      "useAddRecipeAction must be used inside AddRecipeActionProvider.",
    );
  }
  return value;
}
