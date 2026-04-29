import { body } from 'express-validator';

export const toggleSavedMaterialValidators = [
  body('materialType')
    .exists({ checkFalsy: true })
    .withMessage('materialType is required')
    .bail()
    .isIn(['pdf', 'note'])
    .withMessage('materialType must be "pdf" or "note"'),
  body('noteId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('noteId must be a valid id'),
  body('pdfId')
    .optional({ nullable: true })
    .isMongoId()
    .withMessage('pdfId must be a valid id'),
  body().custom((value) => {
    const type = value?.materialType;
    const hasNote = !!value?.noteId;
    const hasPdf = !!value?.pdfId;
    if (type === 'note' && !hasNote) {
      throw new Error('noteId is required when materialType is "note"');
    }
    if (type === 'pdf' && !hasPdf) {
      throw new Error('pdfId is required when materialType is "pdf"');
    }
    if (hasNote && hasPdf) {
      throw new Error('Provide exactly one of noteId or pdfId');
    }
    return true;
  }),
];
