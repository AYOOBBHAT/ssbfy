import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { savedMaterialRepository } from '../repositories/savedMaterialRepository.js';
import { noteRepository } from '../repositories/noteRepository.js';
import { pdfNoteRepository } from '../repositories/pdfNoteRepository.js';

function makePreview(content, max = 120) {
  const normalized = typeof content === 'string' ? content.replace(/\s+/g, ' ').trim() : '';
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max).trimEnd()}...`;
}

export const savedMaterialService = {
  async toggle(userId, { materialType, noteId, pdfId }) {
    if (materialType !== 'note' && materialType !== 'pdf') {
      throw new AppError('materialType must be note or pdf', HTTP_STATUS.BAD_REQUEST);
    }

    if (materialType === 'note') {
      const note = await noteRepository.findById(noteId);
      if (!note || note.isActive === false) {
        throw new AppError('Note not found', HTTP_STATUS.NOT_FOUND);
      }
    } else {
      const pdf = await pdfNoteRepository.findById(pdfId);
      if (!pdf || pdf.isActive === false) {
        throw new AppError('PDF note not found', HTTP_STATUS.NOT_FOUND);
      }
    }

    const existing = await savedMaterialRepository.findByUserAndMaterial({
      userId,
      materialType,
      noteId,
      pdfId,
    });

    if (existing) {
      await savedMaterialRepository.deleteById(existing._id);
      return { saved: false };
    }

    await savedMaterialRepository.create({
      userId,
      materialType,
      noteId: materialType === 'note' ? noteId : null,
      pdfId: materialType === 'pdf' ? pdfId : null,
    });
    return { saved: true };
  },

  async listMine(userId) {
    const [savedPdfs, savedNotes] = await Promise.all([
      savedMaterialRepository.listSavedPdfs(userId),
      savedMaterialRepository.listSavedNotes(userId),
    ]);

    return {
      savedPdfs: (savedPdfs || []).map((p) => ({
        savedId: p.savedId,
        pdfId: p.pdfId,
        title: p.title || 'Untitled PDF',
        fileUrl: p.fileUrl || '',
        postTitle: p.postTitle || p.postName || '',
        createdAt: p.createdAt,
      })),
      savedNotes: (savedNotes || []).map((n) => ({
        savedId: n.savedId,
        noteId: n.noteId,
        title: n.title || 'Untitled note',
        content: typeof n.content === 'string' ? n.content : '',
        contentPreview: makePreview(n.content, 120),
        subject: n.subject || '',
        topic: n.topic || '',
        post: n.post || '',
        createdAt: n.createdAt,
      })),
    };
  },
};
