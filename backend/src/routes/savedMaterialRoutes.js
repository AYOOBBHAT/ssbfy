import { Router } from 'express';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { savedMaterialController } from '../controllers/savedMaterialController.js';
import { toggleSavedMaterialValidators } from '../validators/savedMaterialValidators.js';

const router = Router();

router.post('/toggle', authenticate, toggleSavedMaterialValidators, validateRequest, savedMaterialController.toggle);
router.get('/', authenticate, savedMaterialController.listMine);

export default router;
