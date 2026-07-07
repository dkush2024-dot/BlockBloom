const express = require('express');
const router = express.Router();
const multer = require('multer');
const verificationController = require('../controllers/verificationController');
const { requireAuth } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/rbac');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// POST /api/verifications/:electionAddress/upload
router.post('/:electionAddress/upload', requireAuth, requireRole('superadmin', 'admin'), upload.single('file'), verificationController.uploadCSV);

// GET /api/verifications/:electionAddress/proof
router.get('/:electionAddress/proof', requireAuth, verificationController.getProof);

module.exports = router;
