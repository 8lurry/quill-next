
import Quill from 'quill';
import { useQuill } from "./use-quill";
import { useQuillEvent } from "./use-quill-event";
import { Delta, EmitterSource } from 'quill';

export type TextChangeHandler = (delta: Delta, oldDelta: Delta, source: EmitterSource) => void

export function useQuillTextChange(callback: TextChangeHandler): void {
  const quill = useQuill();
  return useQuillEvent(quill, Quill.events.TEXT_CHANGE, callback);
}
