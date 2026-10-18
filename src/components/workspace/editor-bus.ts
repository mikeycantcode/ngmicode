"use client";

type RevealFn = (path: string, line: number) => void;

let revealImpl: RevealFn | null = null;

/** Lets panels ask the editor to jump to a line without prop drilling. */
export const editorBus = {
  register(fn: RevealFn) {
    revealImpl = fn;
    return () => {
      if (revealImpl === fn) revealImpl = null;
    };
  },
  reveal(path: string, line: number) {
    revealImpl?.(path, line);
  },
};
