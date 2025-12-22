import { Mark, mergeAttributes } from '@tiptap/react';

export const SuggestionAddition = Mark.create({
  name: 'suggestion-addition',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'suggestion-addition',
        style: 'background-color: rgba(74, 222, 128, 0.2); text-decoration: underline; text-decoration-color: #22c55e; cursor: pointer;',
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setSuggestionAddition: () => ({ commands }: any) => {
        return commands.setMark(this.name);
      },
      acceptSuggestion: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const { from, to } = selection;
        
        // Aceitar adição = manter o texto e remover a marcação
        if (dispatch) {
          tr.removeMark(from, to, state.schema.marks['suggestion-addition']);
        }
        return true;
      },
      rejectSuggestion: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const { from, to } = selection;
        
        // Rejeitar adição = apagar o texto
        if (dispatch) {
          tr.delete(from, to);
        }
        return true;
      },
    } as any;
  },
});

export const SuggestionDeletion = Mark.create({
  name: 'suggestion-deletion',

  addOptions() {
    return {
      HTMLAttributes: {
        class: 'suggestion-deletion',
        style: 'background-color: rgba(239, 68, 68, 0.2); text-decoration: line-through; color: #ef4444; cursor: pointer;',
      },
    };
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setSuggestionDeletion: () => ({ commands }: any) => {
        return commands.setMark(this.name);
      },
      acceptSuggestion: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const { from, to } = selection;
        
        // Aceitar deleção = apagar o texto (confirmar a exclusão)
        if (dispatch) {
          tr.delete(from, to);
        }
        return true;
      },
      rejectSuggestion: () => ({ tr, state, dispatch }: any) => {
        const { selection } = state;
        const { from, to } = selection;
        
        // Rejeitar deleção = manter o texto e remover a marcação (restaurar)
        if (dispatch) {
          tr.removeMark(from, to, state.schema.marks['suggestion-deletion']);
        }
        return true;
      },
    } as any;
  },
});