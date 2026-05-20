const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// GET /api/auth/nonce - Get a new SIWE nonce
router.get('/nonce', authController.getNonce);

// POST /api/auth/verify - Verify SIWE signature and get JWT
router.post('/verify', authController.verifySignature);

module.exports = router;
