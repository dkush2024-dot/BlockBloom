/**
 * Models barrel export.
 * Import all models from one place: const { DAO, Proposal, Vote } = require('../models');
 */

const DAO = require('./DAO');
const Proposal = require('./Proposal');
const Vote = require('./Vote');
const SyncState = require('./SyncState');
const DraftProposal = require('./DraftProposal');
const ChatSession = require('./ChatSession');
const GovernanceDoc = require('./GovernanceDoc');
const User = require('./User');
const Organization = require('./Organization');
const Department = require('./Department');
const Election = require('./Election');
const StudentVerification = require('./StudentVerification');
const AuditLog = require('./AuditLog');

module.exports = { DAO, Proposal, Vote, SyncState, DraftProposal, ChatSession, GovernanceDoc, User, Organization, Department, Election, StudentVerification, AuditLog };
