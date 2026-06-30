const { Election, Proposal } = require('../../models');
const { ApiError } = require('../../utils');

class ElectionController {
  // GET /api/elections
  async getElections(req, res, next) {
    try {
      const orgId = req.query.orgId;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const query = orgId ? { orgId } : {};
      
      const elections = await Election.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
      const total = await Election.countDocuments(query);
      
      res.json({ success: true, elections, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/elections/:address
  async getElectionByAddress(req, res, next) {
    try {
      const election = await Election.findOne({ contractAddress: req.params.address.toLowerCase() });
      if (!election) {
        throw ApiError.notFound('Election not found');
      }
      res.json({ success: true, election });
    } catch (error) {
      next(error);
    }
  }

  // GET /api/elections/:address/proposals
  async getElectionProposals(req, res, next) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const skip = (page - 1) * limit;

      const proposals = await Proposal.find({ daoAddress: req.params.address.toLowerCase() })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
        
      const total = await Proposal.countDocuments({ daoAddress: req.params.address.toLowerCase() });

      res.json({ success: true, proposals, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new ElectionController();
