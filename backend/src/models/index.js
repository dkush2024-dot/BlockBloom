/**
 * Models barrel export.
 * Import all models from one place: const { DAO, Proposal, Vote } = require('../models');
 */

const DAO = require('./DAO');
const Proposal = require('./Proposal');
const Vote = require('./Vote');
const SyncState = require('./SyncState');

module.exports = { DAO, Proposal, Vote, SyncState };
