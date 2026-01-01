import { create } from "zustand";

interface ImageStore {
  capturedImageUri: string | null;
  setCapturedImageUri: (uri: string | null) => void;
  clearCapturedImageUri: () => void;
}

export const useImageStore = create<ImageStore>((set) => ({
  capturedImageUri: null,
  setCapturedImageUri: (uri) => set({ capturedImageUri: uri }),
  clearCapturedImageUri: () => set({ capturedImageUri: null }),
}));

