const stakingService = require('../../services/stakingService');
const StakingContract = require('../../models/staking/stakingContract');
const csv = require('csv-parser');
const { Readable } = require('stream');

class StakingAdminController {
  // CSV Management endpoints
  async uploadStakingContractsCSV(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'CSV file is required'
        });
      }

      const csvData = req.file.buffer.toString('utf8');
      const contracts = [];
      const errors = [];

      // Parse CSV data
      const stream = Readable.from([csvData]);
      
      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (row) => {
            try {
              // Validate required fields
              if (!row.contractName || !row.contractAddress || !row.blockchain) {
                errors.push(`Missing required fields in row: ${JSON.stringify(row)}`);
                return;
              }

              // Validate contract address format
              if (!StakingContract.validateContractAddress(row.contractAddress, row.blockchain)) {
                errors.push(`Invalid contract address format: ${row.contractAddress} for ${row.blockchain}`);
                return;
              }

              // Parse reward structures if provided
              let rewardStructures = null;
              if (row.sixMonthTickets || row.twelveMonthTickets || row.threeYearTickets) {
                rewardStructures = {
                  sixMonths: {
                    openEntryTicketsPerMonth: parseInt(row.sixMonthTickets) || 5,
                    bonusMultiplier: parseFloat(row.sixMonthMultiplier) || 1.1
                  },
                  twelveMonths: {
                    openEntryTicketsPerMonth: parseInt(row.twelveMonthTickets) || 12,
                    bonusMultiplier: parseFloat(row.twelveMonthMultiplier) || 1.25
                  },
                  threeYears: {
                    openEntryTicketsPerMonth: parseInt(row.threeYearTickets) || 30,
                    bonusMultiplier: parseFloat(row.threeYearMultiplier) || 1.5
                  }
                };
              }

              contracts.push({
                contractName: row.contractName.trim(),
                contractAddress: row.contractAddress.trim().toLowerCase(),
                blockchain: row.blockchain.trim().toLowerCase(),
                description: row.description?.trim() || '',
                isActive: row.isActive !== 'false',
                rewardStructures
              });
            } catch (error) {
              errors.push(`Error processing row: ${error.message}`);
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'CSV parsing errors',
          errors
        });
      }

      // Process contracts
      const results = {
        created: [],
        updated: [],
        errors: []
      };

      for (const contractData of contracts) {
        try {
          // Check if contract already exists
          const existingContract = await StakingContract.findOne({
            contractAddress: contractData.contractAddress,
            blockchain: contractData.blockchain
          });

          if (existingContract) {
            // Update existing contract
            const updatedContract = await stakingService.updateStakingContract(
              existingContract._id,
              contractData,
              req.user.id
            );
            results.updated.push(updatedContract);
          } else {
            // Create new contract
            const newContract = await stakingService.createStakingContract(
              contractData,
              req.user.id
            );
            results.created.push(newContract);
          }
        } catch (error) {
          results.errors.push({
            contract: contractData.contractAddress,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'CSV processing completed',
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async exportStakingContractsCSV(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const filters = {};
      if (req.query.blockchain) {
        filters.blockchain = req.query.blockchain;
      }
      if (req.query.isActive !== undefined) {
        filters.isActive = req.query.isActive === 'true';
      }

      const contracts = await stakingService.getStakingContracts(filters);

      // Convert to CSV format
      const csvHeaders = [
        'contractName',
        'contractAddress',
        'blockchain',
        'description',
        'isActive',
        'sixMonthTickets',
        'sixMonthMultiplier',
        'twelveMonthTickets',
        'twelveMonthMultiplier',
        'threeYearTickets',
        'threeYearMultiplier',
        'totalStaked',
        'totalRewardsDistributed',
        'createdAt'
      ];

      const csvRows = contracts.map(contract => [
        contract.contractName,
        contract.contractAddress,
        contract.blockchain,
        contract.description || '',
        contract.isActive,
        contract.rewardStructures.sixMonths.openEntryTicketsPerMonth,
        contract.rewardStructures.sixMonths.bonusMultiplier,
        contract.rewardStructures.twelveMonths.openEntryTicketsPerMonth,
        contract.rewardStructures.twelveMonths.bonusMultiplier,
        contract.rewardStructures.threeYears.openEntryTicketsPerMonth,
        contract.rewardStructures.threeYears.bonusMultiplier,
        contract.totalStaked,
        contract.totalRewardsDistributed,
        contract.createdAt.toISOString()
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="staking-contracts.csv"');
      res.send(csvContent);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Contract management interface endpoints
  async getStakingContractsDashboard(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const [contracts, analytics] = await Promise.all([
        stakingService.getStakingContracts(),
        stakingService.getStakingAnalytics()
      ]);

      // Group contracts by blockchain
      const contractsByBlockchain = contracts.reduce((acc, contract) => {
        if (!acc[contract.blockchain]) {
          acc[contract.blockchain] = [];
        }
        acc[contract.blockchain].push(contract);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          contracts,
          contractsByBlockchain,
          analytics,
          summary: {
            totalContracts: contracts.length,
            activeContracts: contracts.filter(c => c.isActive).length,
            validatedContracts: contracts.filter(c => c.contractValidation.isValidated).length,
            blockchainDistribution: Object.keys(contractsByBlockchain).map(blockchain => ({
              blockchain,
              count: contractsByBlockchain[blockchain].length,
              active: contractsByBlockchain[blockchain].filter(c => c.isActive).length
            }))
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getDefaultRewardStructure(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { blockchain } = req.params;
      
      if (!blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Blockchain parameter is required'
        });
      }

      const defaultStructure = await StakingContract.getDefaultRewardStructure(blockchain);

      res.json({
        success: true,
        data: {
          blockchain,
          defaultRewardStructure: defaultStructure
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async createStakingContractWithDefaults(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const contractData = req.body;

      // Get default reward structure if not provided
      if (!contractData.rewardStructures) {
        contractData.rewardStructures = await StakingContract.getDefaultRewardStructure(
          contractData.blockchain
        );
      }

      const contract = await stakingService.createStakingContract(contractData, req.user.id);

      res.json({
        success: true,
        message: 'Staking contract created with default reward structure',
        data: contract
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateRewardStructure(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const { rewardStructures } = req.body;

      if (!rewardStructures) {
        return res.status(400).json({
          success: false,
          message: 'Reward structures are required'
        });
      }

      const contract = await stakingService.updateStakingContract(
        contractId,
        { rewardStructures },
        req.user.id
      );

      res.json({
        success: true,
        message: 'Reward structure updated successfully',
        data: contract
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async bulkUpdateContracts(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractIds, updates } = req.body;

      if (!contractIds || !Array.isArray(contractIds) || contractIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Contract IDs array is required'
        });
      }

      const results = {
        updated: [],
        errors: []
      };

      for (const contractId of contractIds) {
        try {
          const contract = await stakingService.updateStakingContract(
            contractId,
            updates,
            req.user.id
          );
          results.updated.push(contract);
        } catch (error) {
          results.errors.push({
            contractId,
            error: error.message
          });
        }
      }

      res.json({
        success: true,
        message: 'Bulk update completed',
        data: results
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async validateContractAddress(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractAddress, blockchain } = req.body;

      if (!contractAddress || !blockchain) {
        return res.status(400).json({
          success: false,
          message: 'Contract address and blockchain are required'
        });
      }

      const isValid = StakingContract.validateContractAddress(contractAddress, blockchain);
      
      // Check if contract already exists
      let exists = false;
      if (isValid) {
        const existingContract = await StakingContract.findOne({
          contractAddress: contractAddress.toLowerCase(),
          blockchain: blockchain.toLowerCase()
        });
        exists = !!existingContract;
      }

      res.json({
        success: true,
        data: {
          contractAddress,
          blockchain,
          isValid,
          exists,
          message: isValid 
            ? (exists ? 'Contract already exists in system' : 'Valid contract address')
            : `Invalid contract address format for ${blockchain}`
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async getContractAnalytics(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;
      const timeRange = parseInt(req.query.timeRange) || 30;

      const [contract, performance, analytics] = await Promise.all([
        StakingContract.findById(contractId).populate('createdBy lastModifiedBy'),
        stakingService.getContractPerformanceMetrics(contractId),
        stakingService.getStakingAnalytics(timeRange)
      ]);

      if (!contract) {
        return res.status(404).json({
          success: false,
          message: 'Contract not found'
        });
      }

      res.json({
        success: true,
        data: {
          contract,
          performance,
          analytics
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async deleteStakingContract(req, res) {
    try {
      if (!req.user.isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      const { contractId } = req.params;

      // Check if contract has active staking positions
      const StakingPosition = require('../../models/staking/stakingPosition');
      const activePositions = await StakingPosition.countDocuments({
        stakingContractId: contractId,
        status: 'active'
      });

      if (activePositions > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete contract with ${activePositions} active staking positions`
        });
      }

      // Soft delete by setting isActive to false
      const contract = await StakingContract.findByIdAndUpdate(
        contractId,
        { 
          isActive: false,
          lastModifiedBy: req.user.id
        },
        { new: true }
      );

      if (!contract) {
        return res.status(404).json({
          success: false,
          message: 'Contract not found'
        });
      }

      res.json({
        success: true,
        message: 'Contract deactivated successfully',
        data: contract
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new StakingAdminController();