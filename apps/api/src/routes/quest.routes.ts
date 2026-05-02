import { Router, type Request, type Response, type NextFunction } from 'express';
import { authRequired } from '../middleware/auth.middleware.js';
import { questService } from '../services/QuestService.js';

const router = Router();

router.get('/', authRequired, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const quests = await questService.getActiveQuests(req.user!.userId);
    res.json({ quests });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/claim', authRequired, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const result = await questService.claimQuest(req.user!.userId, req.params.id);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
