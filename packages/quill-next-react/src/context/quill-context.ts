import { createContext } from "react";
import type Quill from 'quill';

export const QuillContext = createContext<Quill | null>(null);
