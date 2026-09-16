import { videoLectureService } from '../services/videoLectureService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/response.js';

export const videoLectureController = {
  provisionUpload: asyncHandler(async (req, res) => {
    const payload = await videoLectureService.provisionDirectUpload(req.body);
    return sendCreated(res, payload, 'Upload URL created');
  }),

  listAdmin: asyncHandler(async (req, res) => {
    const data = await videoLectureService.listAdmin(req.query);
    return sendSuccess(res, data, 'Video lectures');
  }),

  getAdmin: asyncHandler(async (req, res) => {
    const lecture = await videoLectureService.getById(req.params.id);
    return sendSuccess(res, { lecture }, 'Video lecture');
  }),

  update: asyncHandler(async (req, res) => {
    const lecture = await videoLectureService.update(req.params.id, req.body);
    return sendSuccess(res, { lecture }, 'Video lecture updated');
  }),

  archive: asyncHandler(async (req, res) => {
    const lecture = await videoLectureService.archive(req.params.id);
    return sendSuccess(res, { lecture }, 'Video lecture archived');
  }),
};
